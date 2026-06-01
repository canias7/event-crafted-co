// Cron-driven recurring expense logger. Wakes up daily, finds
// active vendor_recurring_expenses rows whose next_run_at has
// passed, and inserts a fresh vendor_expenses row mirroring the
// rule's template. next_run_at is advanced by one cadence after a
// successful insert; long outages catch up so the vendor doesn't
// see a backlog drip-feed one row per day.
//
// Auth: deployed with verify_jwt=false and called from pg_cron via
// net.http_post — same pattern as scan-vendorapay-recurring. The
// function only inserts on due rows so accidental triggers just
// advance the schedule slightly early; no security-sensitive
// surface.

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

interface RecurringRow {
  id: string;
  user_id: string | null;
  vendor_id: string | null;
  interval: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  day_of_month: number | null;
  amount_cents: number;
  currency: string;
  category: string;
  description: string;
  item_name: string | null;
  quantity: string | null;
  paid_to: string | null;
  notes: string | null;
  contractor_id: string | null;
  next_run_at: string;
  created_by: string;
}

// Mirror of advance() in scan-vendorapay-recurring — clamps the
// anchor to [1,31] and to the last day of the target month so a
// rule on the 31st doesn't drift into March.
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
  const normYear = targetYear + Math.floor(targetMonthRaw / 12);
  const normMonth = ((targetMonthRaw % 12) + 12) % 12;
  const rawAnchor = dayOfMonth ?? from.getUTCDate();
  const safeAnchor = Number.isFinite(rawAnchor) ? rawAnchor : from.getUTCDate();
  const anchor = Math.max(1, Math.min(31, safeAnchor));
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("method", { status: 405, headers: cors });
  }

  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret") ??
      (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date();
  const { data: due, error: dueErr } = await (db as any)
    .from("vendor_recurring_expenses")
    .select(
      "id, user_id, vendor_id, interval, day_of_month, amount_cents, currency, category, description, item_name, quantity, paid_to, notes, contractor_id, next_run_at, created_by",
    )
    .eq("active", true)
    .lte("next_run_at", now.toISOString())
    .limit(100);

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
      // occurred_on is anchored to the cycle that was due, not
      // today — if the cron skips a day (or catches up after an
      // outage) the row's calendar date still reflects when it
      // *should* have fired. Calendar-only field (no TZ).
      const occurredOn = row.next_run_at.slice(0, 10);
      const { data: ins, error: insErr } = await (db as any)
        .from("vendor_expenses")
        .insert({
          user_id: row.user_id,
          vendor_id: row.vendor_id,
          occurred_on: occurredOn,
          amount_cents: row.amount_cents,
          currency: row.currency,
          category: row.category,
          description: row.description,
          item_name: row.item_name,
          quantity: row.quantity,
          paid_to: row.paid_to,
          notes: row.notes,
          contractor_id:
            row.contractor_id && row.category === "labor"
              ? row.contractor_id
              : null,
          created_by: row.created_by,
          recurring_rule_id: row.id,
        })
        .select("id")
        .single();

      if (insErr || !ins) {
        console.error(
          "[scan-vendor-recurring-expenses] insert failed",
          row.id,
          insErr,
        );
        failed++;
        continue;
      }

      // Catch up: advance past every elapsed cycle so a multi-day
      // cron outage doesn't drip-feed one row per tick.
      let nextRun = advance(new Date(row.next_run_at), row.interval, row.day_of_month);
      while (nextRun <= now) {
        nextRun = advance(nextRun, row.interval, row.day_of_month);
      }

      const { error: advErr } = await (db as any)
        .from("vendor_recurring_expenses")
        .update({
          next_run_at: nextRun.toISOString(),
          last_run_at: now.toISOString(),
          last_expense_id: (ins as { id: string }).id,
        })
        .eq("id", row.id);

      if (advErr) {
        // If the advance fails we'd double-insert on the next tick.
        // Loud log + count as failure so the dashboard surfaces it.
        console.error(
          "[scan-vendor-recurring-expenses] advance failed",
          row.id,
          advErr,
        );
        failed++;
        continue;
      }

      succeeded++;
    } catch (err) {
      console.error("[scan-vendor-recurring-expenses] row threw", row.id, err);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: dueRows.length, succeeded, failed }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
