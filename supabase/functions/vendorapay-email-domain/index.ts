// Per-vendor sending-domain management. Proxies the Resend Domains
// API so a vendor can hook up their own domain (e.g. floralsbyana.com)
// and have buyer-receipt emails go out from noreply@<their-domain>
// instead of the platform default.
//
// Three actions, all POST {action, vendor_id, [domain]}:
//
//   action=create  → adds the domain to our Resend account and
//                    saves the DNS records the vendor needs to set
//   action=verify  → polls Resend for the current status, updates
//                    our row, returns the latest DNS state
//   action=remove  → deletes the row + the Resend-side domain
//
// Authorization: standard Supabase JWT — we resolve the caller's
// user_id and check ownership against vendor_profiles. Without a
// matching profile the call is rejected.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface ResendDomainRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string | number;
  priority?: number;
  status?: string;
}

interface ResendDomain {
  id: string;
  name: string;
  status: string;
  records?: ResendDomainRecord[];
}

async function resend(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const r = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response from Resend */
  }
  return { ok: r.ok, status: r.status, data, text };
}

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

function isValidDomain(d: string): boolean {
  // Conservative — at least one dot, ASCII letters/digits/dash/dot,
  // labels 1-63 chars, total <= 253. Good enough to reject typos
  // and command injection; Resend will catch deeper issues.
  if (!d || d.length > 253) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (d.startsWith(".") || d.endsWith(".") || d.includes("..")) return false;
  if (!d.includes(".")) return false;
  const labels = d.split(".");
  if (labels.some((l) => l.length === 0 || l.length > 63)) return false;
  if (labels.some((l) => l.startsWith("-") || l.endsWith("-"))) return false;
  return true;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!RESEND_API_KEY) {
    return json(500, { error: "email_provider_not_configured" });
  }

  // Resolve caller. We need the bearer's user_id and an authed
  // client to enforce the same RLS as the rest of the app.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized" });
  }
  const userClient = createClient(SUPABASE_URL, authHeader.slice(7), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userResp } = await userClient.auth.getUser();
  const userId = userResp?.user?.id;
  if (!userId) return json(401, { error: "unauthorized" });

  // Service-role client for the actual writes (RLS on
  // vendor_email_domains forbids client-side mutations).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: "create" | "verify" | "remove";
      vendor_id?: string;
      domain?: string;
    };
    const { action, vendor_id } = body;
    if (!action || !vendor_id) {
      return json(400, { error: "action_and_vendor_id_required" });
    }

    // Ownership check — the caller must be the user_id on the
    // vendor_profile. (Team-membership support can be added later
    // by switching to vendor_team_members + is_vendor_member().)
    const { data: vp } = await adminClient
      .from("vendor_profiles")
      .select("id, user_id")
      .eq("id", vendor_id)
      .maybeSingle();
    if (!vp || (vp as { user_id?: string }).user_id !== userId) {
      return json(403, { error: "forbidden" });
    }

    if (action === "create") {
      const raw = (body.domain ?? "").toString();
      const domain = normalizeDomain(raw);
      if (!isValidDomain(domain)) {
        return json(400, { error: "invalid_domain" });
      }
      // Snapshot the previously-installed Resend resource + domain
      // name so we can: (a) clean it up AFTER the new domain is
      // fully provisioned, and (b) gate the 422 "reset stuck"
      // affordance on whether the caller is actually re-submitting
      // the SAME name. Selecting only resend_domain_id (as the
      // previous version did) made the retry path destructive when
      // the 422 came from any unrelated cause (invalid TLD, account
      // collision with another tenant): we'd DELETE the vendor's
      // still-working old resource, then fail the retry POST, then
      // the vendor's verified domain is gone.
      const { data: existing } = await adminClient
        .from("vendor_email_domains")
        .select("resend_domain_id, domain")
        .eq("vendor_id", vendor_id)
        .maybeSingle();
      const existingRow = existing as
        | { resend_domain_id?: string; domain?: string }
        | null;
      const existingId = existingRow?.resend_domain_id;
      const existingDomain = existingRow?.domain;

      // Hand off to Resend. Their API returns 422 when re-adding a
      // domain name that already exists in our Resend account.
      // Only fall back to the "reset stuck" DELETE + retry when the
      // incoming domain is the SAME as the existing row's — that's
      // the only case where a duplicate-name 422 is plausible AND
      // the destructive DELETE is recoverable (we're re-creating
      // the same name).
      let r = await resend("POST", "/domains", { name: domain });
      if (
        !r.ok &&
        r.status === 422 &&
        existingId &&
        existingDomain === domain
      ) {
        const { ok: delOk } = await resend("DELETE", `/domains/${existingId}`);
        if (delOk) {
          r = await resend("POST", "/domains", { name: domain });
          // If the retry POST ALSO fails, our DB row's
          // resend_domain_id now points at a resource we just
          // deleted. Null it out so subsequent create attempts
          // don't get stuck in the same DELETE-and-retry loop
          // against a stale id.
          if (!r.ok) {
            await adminClient
              .from("vendor_email_domains")
              .update({ resend_domain_id: null, status: "pending" })
              .eq("vendor_id", vendor_id);
          }
        }
      }
      if (!r.ok) {
        return json(r.status, {
          error: "resend_create_failed",
          detail: r.data?.message ?? r.text.slice(0, 200),
        });
      }
      const d = r.data as ResendDomain;
      const { error: upsertErr } = await adminClient
        .from("vendor_email_domains")
        .upsert(
          {
            vendor_id,
            domain: d.name,
            resend_domain_id: d.id,
            dns_records: d.records ?? [],
            status: d.status ?? "pending",
            verified_at: null,
          },
          { onConflict: "vendor_id" },
        );
      if (upsertErr) {
        // Roll back the Resend create so we don't leak a domain
        // with no DB pointer. Error-check the rollback — if Resend
        // 5xx's, we have an orphaned domain on the Resend side
        // with no DB pointer and no recovery path. Loud log so ops
        // can manually delete it via the Resend dashboard.
        const rollback = await resend("DELETE", `/domains/${d.id}`);
        if (!rollback.ok) {
          console.error(
            "[vendorapay-email-domain] rollback DELETE failed; orphaned Resend domain",
            d.id,
            rollback.status,
            rollback.text.slice(0, 200),
          );
        }
        return json(500, {
          error: "internal",
          detail: `upsert_failed: ${upsertErr.message?.slice(0, 200)}`,
        });
      }

      // Only AFTER the DB swap commits do we tear down the old
      // Resend resource. Best-effort — if it 404s the row was
      // already gone. Skip when the reset-stuck retry above
      // already deleted it (existingId === d.id is rare but
      // safer to guard against).
      if (existingId && existingId !== d.id) {
        await resend("DELETE", `/domains/${existingId}`);
      }

      return json(200, {
        ok: true,
        domain: d.name,
        status: d.status,
        records: d.records ?? [],
      });
    }

    if (action === "verify") {
      const { data: row } = await adminClient
        .from("vendor_email_domains")
        .select("resend_domain_id, verified_at")
        .eq("vendor_id", vendor_id)
        .maybeSingle();
      const r0 = row as {
        resend_domain_id?: string;
        verified_at?: string | null;
      } | null;
      if (!r0?.resend_domain_id) {
        return json(404, { error: "no_domain_for_vendor" });
      }
      const r = await resend("GET", `/domains/${r0.resend_domain_id}`);
      if (!r.ok) {
        return json(r.status, {
          error: "resend_verify_failed",
          detail: r.data?.message ?? r.text.slice(0, 200),
        });
      }
      const d = r.data as ResendDomain;
      const verifiedNow = d.status === "verified";
      // Preserve the original verified_at when a row was already
      // verified — re-polling Resend shouldn't slide the audit
      // timestamp forward. Only clear/set when the state actually
      // transitions.
      let newVerifiedAt: string | null;
      if (verifiedNow) {
        newVerifiedAt = r0.verified_at ?? new Date().toISOString();
      } else {
        newVerifiedAt = null;
      }
      await adminClient
        .from("vendor_email_domains")
        .update({
          dns_records: d.records ?? [],
          status: d.status ?? "pending",
          verified_at: newVerifiedAt,
        })
        .eq("vendor_id", vendor_id);
      return json(200, {
        ok: true,
        domain: d.name,
        status: d.status,
        records: d.records ?? [],
        verified: verifiedNow,
      });
    }

    if (action === "remove") {
      const { data: row } = await adminClient
        .from("vendor_email_domains")
        .select("resend_domain_id")
        .eq("vendor_id", vendor_id)
        .maybeSingle();
      const r0 = row as { resend_domain_id?: string } | null;
      if (r0?.resend_domain_id) {
        // Best-effort delete on the Resend side. We don't fail
        // the call if Resend 404s — they might've already pruned
        // the domain and the local row is stale.
        await resend("DELETE", `/domains/${r0.resend_domain_id}`);
      }
      await adminClient
        .from("vendor_email_domains")
        .delete()
        .eq("vendor_id", vendor_id);
      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (err) {
    console.error("[vendorapay-email-domain] error", err);
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: "internal", detail: message.slice(0, 240) });
  }
});
