// Cron-driven recurring invoice emitter. Wakes up (typically every
// hour), finds active vendor_recurring_invoices rows whose
// next_run_at has passed, and emits a fresh invoice for each one
// using the same path as a manual send (invoice insert + invoke
// vendorapay-invoice-send → branded buyer email).
//
// next_run_at is advanced by one cadence after a successful send.
// last_run_at + last_invoice_id are stamped so the vendor can
// trace which invoice corresponds to which cycle.
//
// Auth: service-role bearer. No JWT user — this is meant to be
// triggered by an external cron / Supabase scheduled task.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface LineItem {
  name: string;
  qty: number;
  unit_price_cents: number;
  total_cents?: number;
}

interface RecurringRow {
  id: string;
  vendor_id: string;
  customer_id: string;
  interval: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  day_of_month: number | null;
  line_items: LineItem[];
  notes: string | null;
  tax_pct: number;
  next_run_at: string;
}

interface CustomerRow {
  email: string;
  name: string | null;
}

interface VendorRow {
  user_id: string;
}

// Move a UTC timestamp forward by one cadence period. Months are
// calendar-aware (Date#setMonth handles overflow into the next
// month, e.g. Jan 31 + 1 month -> Mar 3, which is fine for our
// "approximately monthly" intent).
function advance(from: Date, interval: RecurringRow["interval"]): Date {
  const d = new Date(from.getTime());
  if (interval === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (interval === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else if (interval === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (interval === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (interval === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

function sumCents(items: LineItem[]): number {
  return items.reduce(
    (s, it) => s + (it.total_cents ?? it.qty * it.unit_price_cents),
    0,
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("method", { status: 405, headers: cors });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date();
  // Cap each run to a reasonable batch so a backlog doesn't blow
  // out a single invocation. Future invocations pick up the rest.
  const { data: due, error: dueErr } = await (db as any)
    .from("vendor_recurring_invoices")
    .select(
      "id, vendor_id, customer_id, interval, day_of_month, line_items, notes, tax_pct, next_run_at",
    )
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .limit(50);

  if (dueErr) {
    return new Response(
      JSON.stringify({ error: "scan_failed", detail: dueErr.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const dueRows = (due ?? []) as RecurringRow[];
  let succeeded = 0;
  let failed = 0;

  for (const row of dueRows) {
    try {
      // Resolve the buyer's email + name and the vendor's owner id
      // (needed for the invoices.created_by column).
      const { data: cust } = await (db as any)
        .from("vendor_customers")
        .select("email, name")
        .eq("id", row.customer_id)
        .maybeSingle();
      const custRow = cust as CustomerRow | null;
      if (!custRow?.email) {
        console.warn("[scan-vendorapay-recurring] customer missing email", row.id);
        failed++;
        continue;
      }

      const { data: vp } = await (db as any)
        .from("vendor_profiles")
        .select("user_id")
        .eq("id", row.vendor_id)
        .maybeSingle();
      const vpRow = vp as VendorRow | null;
      if (!vpRow?.user_id) {
        console.warn("[scan-vendorapay-recurring] vendor missing user_id", row.id);
        failed++;
        continue;
      }

      const items = Array.isArray(row.line_items) ? row.line_items : [];
      const parsedItems: LineItem[] = items
        .filter(
          (it) =>
            typeof it.name === "string" &&
            it.name.trim().length > 0 &&
            it.qty > 0 &&
            it.unit_price_cents > 0,
        )
        .map((it) => ({
          name: it.name,
          qty: it.qty,
          unit_price_cents: it.unit_price_cents,
          total_cents: it.qty * it.unit_price_cents,
        }));

      if (parsedItems.length === 0) {
        console.warn("[scan-vendorapay-recurring] no line items, skipping", row.id);
        // Still advance next_run_at so we don't loop on this row.
        await (db as any)
          .from("vendor_recurring_invoices")
          .update({
            next_run_at: advance(new Date(row.next_run_at), row.interval).toISOString(),
            last_run_at: now.toISOString(),
          })
          .eq("id", row.id);
        failed++;
        continue;
      }

      const subtotal = sumCents(parsedItems);
      const taxBps = Math.round((row.tax_pct ?? 0) * 100);
      const taxCents = Math.round((subtotal * taxBps) / 10_000);
      const total = subtotal + taxCents;

      const issueDate = now.toISOString().slice(0, 10);

      const { data: newInv, error: insErr } = await (db as any)
        .from("invoices")
        .insert({
          vendor_id: row.vendor_id,
          bill_to_name: custRow.name,
          bill_to_email: custRow.email,
          issue_date: issueDate,
          notes: row.notes,
          line_items: parsedItems,
          subtotal_cents: subtotal,
          tax_rate_bps: taxBps,
          tax_cents: taxCents,
          total_cents: total,
          status: "sent",
          sent_at: now.toISOString(),
          invoice_number: "",
          created_by: vpRow.user_id,
        })
        .select("id")
        .single();

      if (insErr || !newInv) {
        console.error("[scan-vendorapay-recurring] insert failed", row.id, insErr);
        failed++;
        continue;
      }

      // Send via the existing invoice-send edge fn (uses the
      // vendor's saved brand + verified domain when present).
      const sendRes = await fetch(
        `${SUPABASE_URL}/functions/v1/vendorapay-invoice-send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ invoice_id: (newInv as { id: string }).id }),
        },
      );
      if (!sendRes.ok) {
        console.warn(
          "[scan-vendorapay-recurring] send failed (invoice still created)",
          row.id,
          await sendRes.text(),
        );
      }

      // Advance the cycle. We base off the previous next_run_at,
      // not "now", so cadences stay anchored (e.g. monthly invoices
      // keep landing on the same calendar day each month).
      await (db as any)
        .from("vendor_recurring_invoices")
        .update({
          next_run_at: advance(new Date(row.next_run_at), row.interval).toISOString(),
          last_run_at: now.toISOString(),
          last_invoice_id: (newInv as { id: string }).id,
        })
        .eq("id", row.id);

      succeeded++;
    } catch (err) {
      console.error("[scan-vendorapay-recurring] row threw", row.id, err);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: dueRows.length, succeeded, failed }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
