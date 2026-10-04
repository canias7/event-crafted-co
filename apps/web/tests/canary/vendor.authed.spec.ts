import { test, expect, expectSettled, expectNoHorizontalOverflow } from "./fixtures";
import { accessibleVendorIds, rest, vendorActor, type Actor } from "./api";
import { AUTH_CONFIGURED, BLOCKED_REASON } from "./env";

// Vendor journeys on the deployed site, signed in as the dedicated synthetic
// vendor via a SEEDED session. Strictly read-only: forms are inspected but
// never saved; nothing is created, sent, blocked or deleted.
//
// Each check compares what the UI shows with what the vendor's own token
// returns from the API, so "the page rendered" isn't mistaken for "the page
// shows the right data".

interface Listing {
  id: string;
  business_name: string;
}

test.describe("vendor journeys (seeded session)", () => {
  test.skip(!AUTH_CONFIGURED, BLOCKED_REASON);

  let me: Actor;
  let listing: Listing;
  let vendorIds: string[];
  let inboxTotal: number;

  test.beforeAll(async () => {
    if (!AUTH_CONFIGURED) return;
    me = vendorActor();
    const own = await rest<Listing>(`vendor_profiles?select=id,business_name&user_id=eq.${me.uid}&limit=1`, me.token);
    expect(own.rows.length, "the dedicated test vendor must own a listing").toBe(1);
    listing = own.rows[0];
    vendorIds = await accessibleVendorIds(me);
    const inbox = await rest(`inquiries?select=id&vendor_id=in.(${vendorIds.join(",")})&limit=1`, me.token);
    inboxTotal = inbox.count ?? 0;
  });

  test("dashboard: overview loads for the signed-in vendor", async ({ page }) => {
    await page.goto("/vendor/overview", { waitUntil: "domcontentloaded" });
    await expect(page, "seeded session must not bounce to /login").toHaveURL(/\/vendor\/overview$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 20_000 });
    await expectSettled(page);
    await expectNoHorizontalOverflow(page, "/vendor/overview");
  });

  test("profile: My Profile shows the vendor's own business", async ({ page }) => {
    await page.goto("/vendor/me", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "My Profile" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(listing.business_name, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expectSettled(page);
    await expectNoHorizontalOverflow(page, "/vendor/me");
  });

  test("profile: edit form is pre-filled with the saved data (not saved)", async ({ page }) => {
    await page.goto("/vendor/edit-profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Edit profile" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder("Your brand"), "brand field shows the saved business name").toHaveValue(
      listing.business_name,
      { timeout: 20_000 },
    );
    await expectNoHorizontalOverflow(page, "/vendor/edit-profile");
  });

  test("portfolio: gallery loads", async ({ page }) => {
    const photos = await rest(`vendor_portfolio_images?select=id&vendor_id=eq.${listing.id}&limit=1`, me.token);
    await page.goto("/vendor/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Gallery" })).toBeVisible({ timeout: 20_000 });
    await expectSettled(page);
    test.info().annotations.push({ type: "data", description: `portfolio photos via API: ${photos.count ?? "?"}` });
    await expectNoHorizontalOverflow(page, "/vendor/gallery");
  });

  test("inquiries: inbox total matches the API and rows open the thread", async ({ page }) => {
    expect(inboxTotal, "the test vendor's seeded inbox should not be empty").toBeGreaterThan(0);
    await page.goto("/vendor/inbox", { waitUntil: "domcontentloaded" });
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText("Inbox", { timeout: 20_000 });
    await expect(h1, "inbox header count must equal the API's exact count").toContainText(String(inboxTotal), {
      timeout: 20_000,
    });

    const rows = page.locator('a[href^="/vendor/inbox/"]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const href = await rows.first().getAttribute("href");
    const id = href!.split("/").pop()!;
    const owned = await rest(`inquiries?select=id&id=eq.${id}&vendor_id=in.(${vendorIds.join(",")})`, me.token);
    expect(owned.rows.length, "the first row must be one of this vendor's inquiries").toBe(1);

    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`/vendor/inbox/${id}$`));
    await expect(page.getByRole("heading", { level: 2 }).first(), "thread header (host name)").not.toBeEmpty({ timeout: 20_000 });
    await expectSettled(page);
    await expectNoHorizontalOverflow(page, "inquiry thread");
  });

  test("inquiries: search narrows the inbox to an empty state", async ({ page }) => {
    await page.goto("/vendor/inbox", { waitUntil: "domcontentloaded" });
    const rows = page.locator('a[href^="/vendor/inbox/"]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder(/Search by host, event type, location, or date/).fill("zzqx-canary-no-match");
    await expect(rows).toHaveCount(0, { timeout: 15_000 });
  });

  test("calendar: month grid renders, navigates, and shows availability controls", async ({ page }) => {
    const label = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const blocked = await rest(`vendor_unavailable_dates?select=date&vendor_id=in.(${vendorIds.join(",")})&limit=1`, me.token);
    test.info().annotations.push({ type: "data", description: `blocked dates via API: ${blocked.count ?? "?"}` });

    await page.goto("/vendor/appointments", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 2, name: label(now) })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("heading", { level: 2, name: label(next) })).toBeVisible();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page.getByRole("heading", { level: 2, name: label(now) })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recurring blocks" })).toBeVisible();
    await expectSettled(page);
    await expectNoHorizontalOverflow(page, "/vendor/appointments");
  });

  test("payments: workspace (invoices / payment links) state", async ({ page }) => {
    // The invoice + payment-link screens live in the Workspace, which is
    // currently switched off in MyVendoraPage.tsx. Record that honestly
    // rather than reporting invoice UI coverage that doesn't exist.
    const invoices = await rest(`invoices?select=id&vendor_id=in.(${vendorIds.join(",")})&limit=1`, me.token);
    const links = await rest(`payment_links?select=id&vendor_id=in.(${vendorIds.join(",")})&limit=1`, me.token);
    test.info().annotations.push({
      type: "untested",
      description: `invoice/payment-link vendor UI is "under construction" on web; API shows ${invoices.count} invoice(s), ${links.count} link(s)`,
    });
    await page.goto("/vendor/workspace", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Workspace — under construction/ })).toBeVisible({ timeout: 20_000 });
  });

  for (const path of [
    "/vendor/scheduling",
    "/vendor/crm",
    "/vendor/team",
    "/vendor/verification",
    "/vendor/subscription",
    "/vendor/partners",
    "/vendor/integrations",
  ]) {
    test(`secondary page ${path} renders`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
      await expectSettled(page);
      await expectNoHorizontalOverflow(page, path);
    });
  }
});
