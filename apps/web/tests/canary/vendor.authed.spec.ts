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
    // The edit page reads the brand from `profiles` (a trigger mirrors it onto
    // listings), so that row — not the listing — is the source of truth here.
    const prof = await rest<{ business_name: string | null }>(`profiles?select=business_name&id=eq.${me.uid}`, me.token);
    const saved = prof.rows[0]?.business_name ?? "";
    if (!saved) {
      test.info().annotations.push({
        type: "data",
        description: "fixture: profiles.business_name is empty for the test vendor (listing has a name) — form is expected to be empty",
      });
    }
    await page.goto("/vendor/edit-profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Edit profile" })).toBeVisible({ timeout: 20_000 });
    const field = page.getByRole("textbox", { name: "Business name" });
    await expect(field).toBeVisible({ timeout: 20_000 });
    await expect(field, "Business name field shows the saved profile value").toHaveValue(saved, { timeout: 20_000 });
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

    const hostRes = await rest<{ host: { display_name: string | null } | null }>(
      `inquiries?select=host:profiles!inquiries_host_id_fkey(display_name)&id=eq.${id}`,
      me.token,
    );
    const hostName = hostRes.rows[0]?.host?.display_name ?? "";

    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`/vendor/inbox/${id}$`));
    await expect(page.getByRole("link", { name: "Back to inbox" })).toBeVisible({ timeout: 20_000 });
    if (hostName) {
      await expect(page.getByText(hostName, { exact: true }).first(), "thread header names the host from the API").toBeVisible();
    }
    // The reply composer is present (we never type into it or send).
    await expect(page.getByRole("textbox", { name: /^Message / })).toBeVisible();
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

  test("retired Workspace / My Space links land on Overview", async ({ page }) => {
    // The Workspace (invoices, pay links, files, contacts) and My Space
    // screens were removed; old bookmarks redirect to the Overview.
    for (const path of ["/vendor/workspace", "/vendor/payments", "/vendor/ai-superagents"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page, path).toHaveURL(/\/vendor\/overview$/, { timeout: 20_000 });
    }
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 20_000 });
    await expectNoHorizontalOverflow(page, "/vendor/overview");
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
