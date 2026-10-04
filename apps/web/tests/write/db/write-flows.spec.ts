import { test, expect } from "@playwright/test";
import { admin, as, LOCAL_BLOCKED_REASON, LOCAL_READY, seedHost, seedVendor } from "./local";

// Create / update / delete flows against an ISOLATED local Supabase stack.
// Fixtures are created with the local service role; every assertion runs as
// an ordinary signed-in user so RLS + triggers are what's being tested.
// Nothing here can reach production (local.ts refuses non-local URLs) and no
// external provider is called.

test.describe("write flows (local stack)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!LOCAL_READY, LOCAL_BLOCKED_REASON);

  let vendorA: Awaited<ReturnType<typeof seedVendor>>;
  let vendorB: Awaited<ReturnType<typeof seedVendor>>;
  let host: Awaited<ReturnType<typeof seedHost>>;
  let inquiryId: string;

  test.beforeAll(async () => {
    if (!LOCAL_READY) return;
    vendorA = await seedVendor("a");
    vendorB = await seedVendor("b");
    host = await seedHost("h");
    const inq = await as(host.session).post("inquiries", {
      host_id: host.id,
      vendor_id: vendorA.listingId,
      event_type: "wedding",
      status: "new",
    });
    expect(inq.status, `host creates an inquiry: ${JSON.stringify(inq.data).slice(0, 200)}`).toBe(201);
    inquiryId = (inq.data as { id: string }[])[0].id;
  });

  test("profile: a vendor's edit persists", async () => {
    const r = await as(vendorA.session).patch(`vendor_profiles?id=eq.${vendorA.listingId}`, { business_name: "Canary Vendor A (edited)" });
    expect(r.status).toBe(200);
    const back = await as(vendorA.session).get(`vendor_profiles?select=business_name&id=eq.${vendorA.listingId}`);
    expect((back.data as { business_name: string }[])[0].business_name).toBe("Canary Vendor A (edited)");
  });

  test("profile: a vendor cannot edit another vendor's listing", async () => {
    const r = await as(vendorB.session).patch(`vendor_profiles?id=eq.${vendorA.listingId}`, { business_name: "hijacked" });
    expect((r.data as unknown[] | null)?.length ?? 0, "RLS must filter the row out of the UPDATE").toBe(0);
    const truth = await admin.rest("GET", `vendor_profiles?select=business_name&id=eq.${vendorA.listingId}`);
    expect((truth.data as { business_name: string }[])[0].business_name).toBe("Canary Vendor A (edited)");
  });

  test("inquiry: the vendor can move status new → replied", async () => {
    const r = await as(vendorA.session).patch(`inquiries?id=eq.${inquiryId}`, { status: "replied" });
    expect(r.status, JSON.stringify(r.data).slice(0, 200)).toBe(200);
    const back = await admin.rest("GET", `inquiries?select=status&id=eq.${inquiryId}`);
    expect((back.data as { status: string }[])[0].status).toBe("replied");
  });

  test("inquiry: another vendor cannot change it", async () => {
    const r = await as(vendorB.session).patch(`inquiries?id=eq.${inquiryId}`, { status: "lost" });
    expect((r.data as unknown[] | null)?.length ?? 0).toBe(0);
    const back = await admin.rest("GET", `inquiries?select=status&id=eq.${inquiryId}`);
    expect((back.data as { status: string }[])[0].status).toBe("replied");
  });

  test("inquiry: the host cannot mark it won or move it to another vendor", async () => {
    const won = await as(host.session).patch(`inquiries?id=eq.${inquiryId}`, { status: "won" });
    expect(won.status, "hosts cannot set won").toBeGreaterThanOrEqual(400);
    const moved = await as(host.session).patch(`inquiries?id=eq.${inquiryId}`, { vendor_id: vendorB.listingId });
    expect(moved.status, "vendor_id is immutable").toBeGreaterThanOrEqual(400);
  });

  test("calendar: a vendor blocks and unblocks a date", async () => {
    const date = "2031-06-14";
    const ins = await as(vendorA.session).post("vendor_unavailable_dates", { vendor_id: vendorA.listingId, date, reason: "Canary" });
    expect(ins.status, JSON.stringify(ins.data).slice(0, 200)).toBe(201);
    let rows = await as(vendorA.session).get(`vendor_unavailable_dates?select=date&vendor_id=eq.${vendorA.listingId}&date=eq.${date}`);
    expect((rows.data as unknown[]).length).toBe(1);
    const del = await as(vendorA.session).del(`vendor_unavailable_dates?vendor_id=eq.${vendorA.listingId}&date=eq.${date}`);
    expect(del.status).toBe(200);
    rows = await as(vendorA.session).get(`vendor_unavailable_dates?select=date&vendor_id=eq.${vendorA.listingId}&date=eq.${date}`);
    expect((rows.data as unknown[]).length).toBe(0);
  });

  test("calendar: a vendor cannot block another vendor's dates", async () => {
    const r = await as(vendorB.session).post("vendor_unavailable_dates", { vendor_id: vendorA.listingId, date: "2031-06-15" });
    expect(r.status, "RLS insert check").toBeGreaterThanOrEqual(400);
  });

  test("payments: creating an invoice and a payment link stores the right fields", async () => {
    const inv = await as(vendorA.session).post("invoices", {
      vendor_id: vendorA.listingId,
      invoice_number: "INV-CANARY-1",
      created_by: vendorA.id,
      bill_to_name: "Canary Buyer",
      line_items: [{ description: "Synthetic package", quantity: 1, unit_cents: 125000 }],
      subtotal_cents: 125000,
      total_cents: 125000,
    });
    expect(inv.status, JSON.stringify(inv.data).slice(0, 300)).toBe(201);
    const invRow = (inv.data as Record<string, unknown>[])[0];
    expect(invRow.vendor_id).toBe(vendorA.listingId);
    expect(invRow.created_by).toBe(vendorA.id);
    expect(invRow.total_cents).toBe(125000);

    const link = await as(vendorA.session).post("payment_links", {
      vendor_id: vendorA.listingId,
      title: "Canary deposit",
      amount_cents: 25000,
      created_by: vendorA.id,
    });
    expect(link.status, JSON.stringify(link.data).slice(0, 300)).toBe(201);
    const linkRow = (link.data as Record<string, unknown>[])[0];
    expect(linkRow.amount_cents).toBe(25000);
    expect(String(linkRow.slug ?? ""), "a payment link gets a public slug").not.toBe("");
  });

  test("payments: a vendor cannot create invoices/links for, or read those of, another vendor", async () => {
    const forged = await as(vendorB.session).post("invoices", {
      vendor_id: vendorA.listingId,
      invoice_number: "INV-FORGED",
      created_by: vendorB.id,
    });
    expect(forged.status).toBeGreaterThanOrEqual(400);
    const spoofCreator = await as(vendorA.session).post("payment_links", {
      vendor_id: vendorA.listingId,
      title: "spoofed creator",
      amount_cents: 100,
      created_by: vendorB.id,
    });
    expect(spoofCreator.status, "created_by must be the caller").toBeGreaterThanOrEqual(400);
    for (const t of ["invoices", "payment_links"]) {
      const r = await as(vendorB.session).get(`${t}?select=id&vendor_id=eq.${vendorA.listingId}`);
      expect((r.data as unknown[]).length, `vendor B read vendor A's ${t}`).toBe(0);
    }
  });

  test("host reply: My Space's send_host_reply confirmation gate", async ({}, testInfo) => {
    // The gate lives in supabase/functions/my-space-chat (first identical call
    // returns confirmation_required and sends nothing). Exercising it needs
    // the functions runtime plus a stubbed Anthropic endpoint; the function
    // calls api.anthropic.com directly, so there's no override to point at a
    // stub without changing application code.
    testInfo.annotations.push({ type: "untested", description: "send_host_reply confirmation gate (needs an LLM base-URL override in my-space-chat)" });
    test.skip(true, "BLOCKED: my-space-chat has no configurable LLM endpoint to stub; gate not exercised");
  });
});
