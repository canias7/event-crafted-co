// Cron-driven recurring invoice emitter. Wakes up daily, finds
// active vendor_recurring_invoices rows whose next_run_at has
// passed, and emits a fresh invoice for each one using the same
// path as a manual send (invoice insert + invoke
// vendorapay-invoice-send → branded buyer email).
//
// next_run_at is advanced by one cadence after a successful send.
// last_run_at + last_invoice_id are stamped so the vendor can
// trace which invoice corresponds to which cycle.
//
// Auth: deployed with verify_jwt=false and called from pg_cron
// via net.http_post — same pattern as scan-vendorapay-payment-
// schedules. The function only acts on due rows so accidental
// triggers just advance the schedule slightly early; no security-
// sensitive surface.

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
  last_invoice_id: string | null;
}

interface CustomerRow {
  email: string;
  name: string | null;
}

interface VendorRow {
  user_id: string;
}

// Move a UTC timestamp forward by one cadence period.
//
// For month/quarter/year cadences we re-anchor on day_of_month so a
// rule configured for the 31st doesn't drift to the 3rd via
// setUTCMonth's overflow (Jan 31 + 1 month -> Mar 3). When the
// target month has fewer days than the anchor (e.g. Feb 31 doesn't
// exist), we clamp to the last day of that month — same intent as
// "last calendar day" billing.
function lastDayOfMonth(year: number, monthZeroIdx: number): number {
  return new Date(Date.UTC(year, monthZeroIdx + 1, 0)).getUTCDate();
}
function advance(
  from: Date,
  interval: RecurringRow["interval"],
  dayOfMonth: number | null,
): Date {
  if (interval === "weekly") {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  if (interval === "biweekly") {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + 14);
    return d;
  }
  const monthDelta =
    interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 12;
  const yearDelta = interval === "yearly" ? 1 : 0;
  const targetYear = from.getUTCFullYear() + yearDelta;
  const targetMonthRaw =
    from.getUTCMonth() + (interval === "yearly" ? 0 : monthDelta);
  // Normalize month overflow into year via Date.UTC arithmetic.
  const normYear = targetYear + Math.floor(targetMonthRaw / 12);
  const normMonth = ((targetMonthRaw % 12) + 12) % 12;
  const anchor = dayOfMonth ?? from.getUTCDate();
  const day = Math.min(anchor, lastDayOfMonth(normYear, normMonth));
  return new Date(
    Date.UTC(
      normYear,
      normMonth,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
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

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date();
  // Cap each run to a reasonable batch so a backlog doesn't blow
  // out a single invocation. Future invocations pick up the rest.
  const { data: due, error: dueErr } = await (db as any)
    .from("vendor_recurring_invoices")
    .select(
      "id, vendor_id, customer_id, interval, day_of_month, line_items, notes, tax_pct, next_run_at, last_invoice_id",
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

      // Compute the next scheduled run upfront so all branches use
      // the same value. Catch-up: walk past now() so a long outage
      // doesn't fire one invoice per cron tick.
      let nextRun = advance(new Date(row.next_run_at), row.interval, row.day_of_month);
      while (nextRun <= now) {
        nextRun = advance(nextRun, row.interval, row.day_of_month);
      }

      if (parsedItems.length === 0) {
        console.warn("[scan-vendorapay-recurring] no line items, skipping", row.id);
        // Still advance next_run_at so we don't loop on this row.
        // Error-checked: if the UPDATE fails the row is wedged on
        // the next tick (re-selected by .lte(next_run_at, now)),
        // so surface the failure rather than swallowing it.
        const { error: skipAdvErr } = await (db as any)
          .from("vendor_recurring_invoices")
          .update({
            next_run_at: nextRun.toISOString(),
            last_run_at: now.toISOString(),
          })
          .eq("id", row.id);
        if (skipAdvErr) {
          console.error(
            "[scan-vendorapay-recurring] skip-path advance failed",
            row.id,
            skipAdvErr,
          );
        }
        failed++;
        continue;
      }

      // Idempotency: if the previous cycle's invoice is still a
      // draft (e.g. send failed and was rolled back), reuse it
      // instead of emitting a new numbered invoice. Without this,
      // a multi-day Resend outage stacks N orphan drafts (each
      // consuming an INV-NNNN slot from the trigger-assigned
      // counter) for one cadence's worth of intended sends.
      let invoiceIdToSend: string | null = null;
      if (row.last_invoice_id) {
        const { data: prevInv } = await (db as any)
          .from("invoices")
          .select("id, status")
          .eq("id", row.last_invoice_id)
          .maybeSingle();
        const prev = prevInv as { id: string; status: string } | null;
        if (prev && prev.status === "draft") {
          invoiceIdToSend = prev.id;
        }
      }

      if (!invoiceIdToSend) {
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
        invoiceIdToSend = (newInv as { id: string }).id;
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
          body: JSON.stringify({ invoice_id: invoiceIdToSend }),
        },
      );
      if (!sendRes.ok) {
        // Send failed — DON'T advance next_run_at or the schedule
        // silently progresses while no email goes out. Mark the
        // invoice as draft so the next tick's idempotency check
        // reuses it, count the row as failed, retry on the next
        // cron tick.
        const errText = await sendRes.text();
        console.error(
          "[scan-vendorapay-recurring] send failed (rolling back)",
          row.id,
          sendRes.status,
          errText,
        );
        const { error: rollbackErr } = await (db as any)
          .from("invoices")
          .update({ status: "draft", sent_at: null })
          .eq("id", invoiceIdToSend);
        if (rollbackErr) {
          // The invoice is now stuck status='sent' with no email
          // delivered. Loud log; ops needs to investigate before
          // the vendor sees a phantom-sent row.
          console.error(
            "[scan-vendorapay-recurring] rollback UPDATE failed (phantom sent)",
            invoiceIdToSend,
            rollbackErr,
          );
        }
        // Pin last_invoice_id to this draft so the next tick reuses
        // it instead of emitting a fresh INV-NNNN.
        const { error: pinErr } = await (db as any)
          .from("vendor_recurring_invoices")
          .update({ last_invoice_id: invoiceIdToSend, last_run_at: now.toISOString() })
          .eq("id", row.id);
        if (pinErr) {
          console.error(
            "[scan-vendorapay-recurring] last_invoice_id pin failed",
            row.id,
            pinErr,
          );
        }
        failed++;
        continue;
      }

      const { error: advErr } = await (db as any)
        .from("vendor_recurring_invoices")
        .update({
          next_run_at: nextRun.toISOString(),
          last_run_at: now.toISOString(),
          last_invoice_id: invoiceIdToSend,
        })
        .eq("id", row.id);
      if (advErr) {
        // Send succeeded (buyer got the email) but the schedule
        // UPDATE didn't land. Don't roll back the invoice — the
        // buyer already received it. The next cron tick will re-
        // select this row (next_run_at still in past); the
        // idempotency check above will see last_invoice_id pointing
        // at a 'sent' (not 'draft') invoice and emit a fresh one,
        // so we WILL double-bill unless this UPDATE eventually
        // lands. Mark the invoice for ops visibility and try once
        // more before giving up.
        console.error(
          "[scan-vendorapay-recurring] post-send advance failed (retrying once)",
          row.id,
          invoiceIdToSend,
          advErr,
        );
        const { error: retryErr } = await (db as any)
          .from("vendor_recurring_invoices")
          .update({
            next_run_at: nextRun.toISOString(),
            last_run_at: now.toISOString(),
            last_invoice_id: invoiceIdToSend,
          })
          .eq("id", row.id);
        if (retryErr) {
          console.error(
            "[scan-vendorapay-recurring] post-send advance FAILED PERMANENTLY",
            row.id,
            invoiceIdToSend,
            retryErr,
          );
          // Tag the invoice notes so ops finds it. Best-effort.
          await (db as any)
            .from("invoices")
            .update({
              notes:
                "(internal) recurring schedule UPDATE failed after send — " +
                "manual review needed before next cron tick",
            })
            .eq("id", invoiceIdToSend);
        }
      }

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
