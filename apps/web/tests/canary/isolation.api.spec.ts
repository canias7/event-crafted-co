import { test, expect } from "@playwright/test";
import { accessibleVendorIds, hostActor, rest, rpc, vendorActor, type Actor } from "./api";
import { AUTH_CONFIGURED, BLOCKED_REASON, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// READ-ONLY data-isolation checks against production, as ordinary users
// (dedicated synthetic vendor + host) and anon. Nothing here writes; write-side
// isolation (a vendor trying to UPDATE another vendor's rows) is tested only
// against the isolated local stack in tests/write/.

test.describe("read isolation (production, ordinary user tokens)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!AUTH_CONFIGURED, BLOCKED_REASON);

  let vendor: Actor;
  let host: Actor;
  let ownIds: string[];
  let otherVendorId: string;

  test.beforeAll(async () => {
    if (!AUTH_CONFIGURED) return;
    vendor = vendorActor();
    host = hostActor();
    ownIds = await accessibleVendorIds(vendor);
    expect(ownIds.length, "the test vendor must own or belong to a listing").toBeGreaterThan(0);
    // Another vendor's listing: any approved public listing that isn't ours.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/vendor_profiles?select=id&application_status=eq.approved`,
      { headers: { apikey: SUPABASE_ANON_KEY } },
    );
    const publicIds: string[] = (await res.json()).map((r: { id: string }) => r.id);
    otherVendorId = publicIds.find((id) => !ownIds.includes(id)) ?? "";
    expect(otherVendorId, "need another vendor's public listing to test cross-vendor reads").not.toBe("");
  });

  test("vendor sees their own inbox; host sees only theirs; anon sees none", async () => {
    const ids = ownIds.join(",");
    const asVendor = await rest<{ id: string; host_id: string }>(`inquiries?select=id,host_id&vendor_id=in.(${ids})`, vendor.token);
    expect(asVendor.count, "vendor should see their seeded inbox").toBeGreaterThan(0);

    const asHost = await rest<{ id: string; host_id: string }>(`inquiries?select=id,host_id&vendor_id=in.(${ids})`, host.token);
    expect(asHost.rows.every((r) => r.host_id === host.uid), "a host only ever sees inquiries they sent").toBe(true);
    expect(asHost.count ?? 0, "host must not see the vendor's whole inbox").toBeLessThan(asVendor.count ?? 0);

    const asAnon = await rest(`inquiries?select=id&vendor_id=in.(${ids})`);
    expect(asAnon.rows.length, "anon must not read inquiries").toBe(0);
  });

  test("cross-vendor: the test vendor cannot read another vendor's inquiries, invoices or payment links", async () => {
    for (const table of ["inquiries", "invoices", "payment_links"]) {
      const r = await rest(`${table}?select=id&vendor_id=eq.${otherVendorId}`, vendor.token);
      expect(r.rows.length, `vendor read another vendor's ${table}`).toBe(0);
    }
  });

  test("invoices and payment links: vendor sees own; host and anon see none", async () => {
    const ids = ownIds.join(",");
    for (const table of ["invoices", "payment_links"]) {
      const own = await rest(`${table}?select=id&vendor_id=in.(${ids})`, vendor.token);
      expect(own.count, `vendor should see their own ${table}`).toBeGreaterThan(0);
      const asHost = await rest(`${table}?select=id&vendor_id=in.(${ids})`, host.token);
      expect(asHost.rows.length, `host must not read ${table}`).toBe(0);
      const asAnon = await rest(`${table}?select=id&vendor_id=in.(${ids})`);
      expect(asAnon.rows.length, `anon must not read ${table}`).toBe(0);
    }
  });

  test("anon cannot see the non-approved test listing", async () => {
    const asAnon = await rest(`vendor_profiles?select=id&id=in.(${ownIds.join(",")})`);
    expect(asAnon.rows.length, "anon must not see a non-approved listing").toBe(0);
  });

  test("vendor_overview_analytics is scoped to the caller", async () => {
    // The RPC counts LEADS (distinct vendor+host pairs) created in the last 30
    // days on listings the caller OWNS. Recompute that from the vendor's own
    // readable rows and require an exact match, then require 0 for a host.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const owned = await rest<{ id: string }>(`vendor_profiles?select=id&user_id=eq.${vendor.uid}`, vendor.token);
    const recent = owned.rows.length
      ? await rest<{ vendor_id: string; host_id: string }>(
          `inquiries?select=vendor_id,host_id&vendor_id=in.(${owned.rows.map((r) => r.id).join(",")})&created_at=gte.${since}`,
          vendor.token,
        )
      : { rows: [] as { vendor_id: string; host_id: string }[] };
    const expected = new Set(recent.rows.map((r) => `${r.vendor_id}:${r.host_id}`)).size;
    const mine = await rpc<{ leads?: { total?: number } }>("vendor_overview_analytics", vendor.token);
    expect(mine?.leads?.total, "RPC lead total must equal the caller's own 30-day leads").toBe(expected);
    const hosts = await rpc<{ leads?: { total?: number } }>("vendor_overview_analytics", host.token);
    expect(hosts?.leads?.total ?? 0, "a host must not see the vendor's leads").toBe(0);
    test.info().annotations.push({ type: "data", description: `30-day leads for the test vendor: ${expected}` });
  });
});
