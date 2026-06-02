import { test, expect } from "@playwright/test";

// RLS / data-isolation checks. These run as real authenticated actors
// (tokens minted via the service-role admin API, captcha-free) and as anon,
// hitting PostgREST directly to verify row-level security holds. They rely
// on the seeded throwaway vendor (e2e-vendor@) having ~180 inquiries spread
// across the e2e-host-*@ test hosts.
//
// Gated on the same creds as the authed display tests; skips otherwise.
const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const ANON =
  process.env.E2E_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "";
const VENDOR_EMAIL = process.env.E2E_VENDOR_EMAIL || "";
const HOST_EMAIL = "e2e-host-1@eventvendora.test";

const HAS_CREDS = Boolean(SUPABASE_URL && ANON && SERVICE_ROLE && VENDOR_EMAIL);

// Mint a real session for `email` (admin OTP → verify); returns the access
// token + the user's id, captcha-free.
async function actor(email: string): Promise<{ token: string; uid: string }> {
  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkRes.ok) throw new Error(`generate_link ${linkRes.status}: ${await linkRes.text()}`);
  const link = await linkRes.json();
  const otp: string | undefined = link?.email_otp ?? link?.properties?.email_otp;
  if (!otp) throw new Error(`no email_otp for ${email}`);
  const vr = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ type: "email", email, token: otp }),
  });
  if (!vr.ok) throw new Error(`verify ${vr.status}: ${await vr.text()}`);
  const s = await vr.json();
  if (!s?.access_token || !s?.user?.id) throw new Error(`no session for ${email}`);
  return { token: s.access_token, uid: s.user.id };
}

// PostgREST GET as a given actor (or anon when token omitted).
async function rest(path: string, token?: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: ANON,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

test.describe("RLS data isolation", () => {
  test.skip(!HAS_CREDS, "E2E Supabase creds not configured");

  test("vendor sees their inbox; host sees only their own; anon sees none", async () => {
    const vendor = await actor(VENDOR_EMAIL);
    const host = await actor(HOST_EMAIL);

    // Derive the vendor's own listing id (owner can read own profile).
    const listings = await rest("vendor_profiles?select=id&limit=1", vendor.token);
    expect(listings.length, "test vendor should own a listing").toBeGreaterThan(0);
    const listingId: string = listings[0].id;

    // 1. Vendor (team member) sees the full seeded inbox for their listing.
    const asVendor = await rest(
      `inquiries?vendor_id=eq.${listingId}&select=id,host_id`,
      vendor.token,
    );
    expect(asVendor.length, "vendor should see their full seeded inbox").toBeGreaterThan(50);

    // 2. A host sees ONLY inquiries where they are the host — never the
    //    vendor's whole inbox, never another host's leads.
    const asHost = await rest(
      `inquiries?vendor_id=eq.${listingId}&select=id,host_id`,
      host.token,
    );
    expect(asHost.length, "host should see at least their own inquiries").toBeGreaterThan(0);
    expect(asHost.length, "host must NOT see the vendor's whole inbox").toBeLessThan(asVendor.length);
    expect(
      asHost.every((r) => r.host_id === host.uid),
      "every inquiry a host sees must be one where they are the host",
    ).toBe(true);

    // 3. Anonymous callers see no inquiries at all (no anon SELECT policy).
    const asAnon = await rest(`inquiries?vendor_id=eq.${listingId}&select=id`);
    expect(asAnon.length, "anon must not read inquiries").toBe(0);
  });

  test("anon cannot see a pending (unapproved) vendor listing", async () => {
    const vendor = await actor(VENDOR_EMAIL);
    const listings = await rest(
      "vendor_profiles?select=id,application_status&limit=1",
      vendor.token,
    );
    const listingId: string = listings[0].id;

    const asAnon = await rest(`vendor_profiles?select=id&id=eq.${listingId}`);
    expect(asAnon.length, "anon must not see a non-approved listing").toBe(0);
  });

  test("invoices/payment_links are vendor-team-only (host + anon blocked)", async () => {
    const vendor = await actor(VENDOR_EMAIL);
    const host = await actor(HOST_EMAIL);
    const listings = await rest("vendor_profiles?select=id&limit=1", vendor.token);
    const listingId: string = listings[0].id;

    for (const table of ["invoices", "payment_links"]) {
      const asHost = await rest(`${table}?vendor_id=eq.${listingId}&select=id`, host.token);
      expect(asHost.length, `host must not read ${table}`).toBe(0);
      const asAnon = await rest(`${table}?vendor_id=eq.${listingId}&select=id`);
      expect(asAnon.length, `anon must not read ${table}`).toBe(0);
    }
  });

  test("vendor_overview_analytics RPC is scoped to the caller", async () => {
    const vendor = await actor(VENDOR_EMAIL);
    const host = await actor(HOST_EMAIL);

    const callRpc = async (token: string) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vendor_overview_analytics`, {
        method: "POST",
        headers: {
          apikey: ANON,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: "{}",
      });
      if (!res.ok) throw new Error(`rpc ${res.status}: ${await res.text()}`);
      return res.json();
    };

    const vendorRes = await callRpc(vendor.token);
    expect(vendorRes?.leads?.total, "vendor should get their own non-zero leads").toBeGreaterThan(0);

    // A host owns no listings, so the same RPC returns an empty pipeline —
    // it never leaks the vendor's numbers.
    const hostRes = await callRpc(host.token);
    expect(hostRes?.leads?.total, "host must not see the vendor's leads").toBe(0);
  });
});
