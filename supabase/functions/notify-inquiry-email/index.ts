// New-inquiry email, fired by a database trigger.
//
// WHY THIS EXISTS. The new_inquiry email used to be sent by the web
// client — a fire-and-forget supabase.functions.invoke in
// apps/web/.../InquiryFormModal.tsx, right after the insert. Two
// problems with that:
//
//   1. apps/host-mobile never made the call at all, so an inquiry sent
//      from the phone produced no email whatsoever. Combined with push
//      reaching two devices out of fifteen (none on Android), a vendor
//      could be inquired with and told by nothing.
//   2. Even on web it was best-effort from a browser. Close the tab
//      fast enough and the mail never leaves — and the comment on that
//      call says the three-hour reply SLA depends on it landing.
//
// Moving it to a trigger makes it client-independent: the email follows
// the row, not the app that happened to write it.
//
// WHY A SEPARATE FUNCTION. send-transactional-email is verify_jwt=true
// and holds every template; a trigger has no JWT to present. Rather than
// drop platform auth on the function that can mail every user, this is a
// narrow relay: one payload shape, one action, and it calls
// send-transactional-email with the service-role key every edge function
// already has in its environment.
//
// SECURITY. verify_jwt=false (config.toml) because the caller is
// Postgres. Guarded by x-cron-secret the same way the cron-invoked
// functions are: enforced only once CRON_SECRET is set on this function,
// so the migration is safe to apply before the secret exists. Until then
// the exposure is bounded — a caller who guesses an inquiry UUID can
// cause a duplicate email to that inquiry's own vendor. No data comes
// back: the response never echoes the inquiry.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: CRON_SECRET.

// deno-lint-ignore-file no-explicit-any

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Enforced only once the operator sets CRON_SECRET here AND the
  // matching Vault secret the trigger reads. Same staged rollout the
  // cron jobs use, so neither half can break the other on its own.
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const inquiryId = typeof body?.inquiryId === "string" ? body.inquiryId : null;
  if (!inquiryId) return json({ error: "inquiryId required" }, 400);

  // Hand off to the function that owns the templates. Service role, so
  // it passes that function's verify_jwt check without anything being
  // relaxed there.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ kind: "new_inquiry", inquiryId }),
  });

  if (!res.ok) {
    // Logged, not thrown: the trigger is fire-and-forget by design and an
    // inquiry must never fail to save because its email bounced.
    console.error(
      "[notify-inquiry-email] send failed",
      res.status,
      (await res.text()).slice(0, 300),
    );
    return json({ ok: false, status: res.status }, 200);
  }

  return json({ ok: true });
});
