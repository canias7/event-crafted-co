import { test, expect, expectSettled, expectNoHorizontalOverflow } from "./fixtures";
import { ADMIN_URL, ALLOWED_LISTING_IDS, ALT_URLS, BASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// Public, unauthenticated journeys on the DEPLOYED site. Read-only: these
// tests click, search and navigate, but never submit a form that writes.

interface PublicVendor {
  id: string;
  business_name: string;
}

// The directory as an anonymous visitor's API key sees it — the source of
// truth the UI must agree with.
async function approvedVendors(): Promise<PublicVendor[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vendor_profiles?select=id,business_name&application_status=eq.approved`,
    { headers: { apikey: SUPABASE_ANON_KEY } },
  );
  expect(res.status, "anon vendor directory query").toBe(200);
  return res.json();
}

test.describe("public site", () => {
  test("landing page renders the hero and routes visitors to the directory", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/unforgettable/i, { timeout: 20_000 });
    await expectSettled(page);
    await expectNoHorizontalOverflow(page, "/");

    // The hero search sends visitors into the directory with their query.
    const heroSearch = page.getByPlaceholder("What are you planning?");
    await expect(heroSearch).toBeVisible();
    await heroSearch.fill("photographer");
    await heroSearch.press("Enter");
    await expect(page).toHaveURL(/\/vendors\?q=photographer/);
    const search = page.getByPlaceholder(/Search vendors or services/i);
    await expect(search, "directory search pre-filled from the hero").toHaveValue(/photographer/i, { timeout: 15_000 });
    testInfo.annotations.push({ type: "viewport", description: testInfo.project.name });
  });

  test("directory lists exactly the approved, public vendors", async ({ page }) => {
    const api = await approvedVendors();
    expect(api.length, "production should have at least one approved vendor").toBeGreaterThan(0);

    await page.goto("/vendors", { waitUntil: "domcontentloaded" });
    const cards = page.locator('a[href^="/vendors/"]').filter({ has: page.locator("text=/\\S/") });
    await expect
      .poll(async () => (await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")))).filter((h) => /^\/vendors\/[0-9a-f-]{36}$/.test(h ?? "")).length, {
        message: "vendor cards never rendered",
        timeout: 20_000,
      })
      .toBeGreaterThan(0);
    const uiIds = new Set(
      (await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? "")))
        .map((h) => h.match(/^\/vendors\/([0-9a-f-]{36})$/)?.[1])
        .filter(Boolean) as string[],
    );
    const apiIds = new Set(api.map((v) => v.id));
    // Every card must be a real approved listing (nothing pending/rejected
    // leaks into the directory) and every approved listing must be shown.
    for (const id of uiIds) expect(apiIds.has(id), `card ${id} is not an approved public listing`).toBe(true);
    // The directory renders every listing while the catalogue is small; once
    // it paginates, only the "nothing extra" direction is meaningful.
    if (apiIds.size <= 24) {
      for (const id of apiIds) expect(uiIds.has(id), `approved listing ${id} missing from the directory`).toBe(true);
    }
    await expect(cards.first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "/vendors");
  });

  test("search filters the directory and shows an empty state for nonsense", async ({ page }) => {
    const api = await approvedVendors();
    const target = api.find((v) => v.business_name.trim().length > 3)!;
    await page.goto("/vendors", { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder(/Search vendors or services/i);
    await expect(search).toBeVisible({ timeout: 20_000 });

    const word = target.business_name.split(/\s+/).find((w) => w.length > 3) ?? target.business_name;
    await search.fill(word);
    await expect(page.locator(`a[href="/vendors/${target.id}"]`).first(), `"${word}" should keep ${target.business_name}`).toBeVisible({
      timeout: 15_000,
    });

    await search.fill("zzqx-no-such-vendor-canary");
    await expect
      .poll(async () => page.locator('a[href^="/vendors/"]').evaluateAll((els) => els.filter((e) => /\/vendors\/[0-9a-f-]{36}$/.test(e.getAttribute("href") ?? "")).length), {
        timeout: 15_000,
      })
      .toBe(0);
  });

  test("vendor detail page shows the listing the card linked to", async ({ page }) => {
    const [vendor] = await approvedVendors();
    await page.goto("/vendors", { waitUntil: "domcontentloaded" });
    const card = page.locator(`a[href="/vendors/${vendor.id}"]`).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/vendors/${vendor.id}$`));
    await expect(page.getByText(vendor.business_name, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    // The availability calendar is part of the public listing.
    await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
    await expectSettled(page);
    await expectNoHorizontalOverflow(page, "vendor detail");
  });

  test("no synthetic/test listings on public surfaces", async ({ page }) => {
    // Content check: test fixtures must not be shown to real visitors.
    const SYNTHETIC = /\b(test|testing|e2e|dummy|lorem)\b/i;
    const api = await approvedVendors();
    // Listings the owner confirmed as intentional (workflow input
    // allowed_listings) are reported, not failed.
    const allowed = api.filter((v) => ALLOWED_LISTING_IDS.has(v.id));
    if (allowed.length) {
      test.info().annotations.push({
        type: "allowed",
        description: `allowed by the owner: ${allowed.map((v) => `${v.business_name} (${v.id})`).join(", ")}`,
      });
    }
    const leaked = api
      .filter((v) => SYNTHETIC.test(v.business_name) && !ALLOWED_LISTING_IDS.has(v.id))
      .map((v) => `${v.business_name} (${v.id})`);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectSettled(page);
    const featured = page.getByText("Featured vendor", { exact: false }).first();
    let featuredText = "";
    if (await featured.count()) {
      featuredText = (await featured.locator("xpath=ancestor::*[3]").innerText()).replace(/\s+/g, " ").trim();
    }
    const featuredIsAllowed = allowed.some((v) => featuredText.includes(v.business_name));
    expect.soft(SYNTHETIC.test(featuredText) && !featuredIsAllowed ? featuredText : "", "homepage features a test listing").toBe("");
    expect(leaked, "approved public listings that look like test data").toEqual([]);
  });

  test("login: role chooser leads to a usable vendor sign-in form", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(/Sign in/i, { timeout: 20_000 });
    await page.locator('a[href="/login/vendor"]').first().click();
    await expect(page).toHaveURL(/\/login\/vendor$/);
    const email = page.locator('input[type="email"]');
    const password = page.locator('input[type="password"]');
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    // Submitting an empty form must not leave the page or call auth. We do NOT
    // attempt a real sign-in: production requires an emailed 6-digit code.
    let authCalls = 0;
    page.on("request", (r) => {
      if (/\/auth\/v1\/(token|otp)|signin-2fa/.test(r.url())) authCalls++;
    });
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(/\/login\/vendor$/);
    expect(authCalls, "empty submit must not reach the auth API").toBe(0);
    await expectNoHorizontalOverflow(page, "/login/vendor");
  });

  test("unknown routes render the 404 page", async ({ page }, testInfo) => {
    // NotFound deliberately console.errors the bad path.
    testInfo.annotations.push({ type: "guard:off", description: "NotFound logs the missing route by design" });
    await page.goto("/canary-route-that-does-not-exist", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Page not found")).toBeVisible();
    await page.getByRole("link", { name: /Return to Home/i }).click();
    await expect(page).toHaveURL(`${BASE_URL}/`);
  });

  test("legal pages render their documents", async ({ page }) => {
    for (const [path, heading] of [
      ["/privacy", /privacy/i],
      ["/terms", /terms/i],
    ] as const) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(heading, { timeout: 20_000 });
      await expectSettled(page);
    }
  });

  test("public checkout pages render the synthetic e2e pay link and invoice", async ({ page }) => {
    await page.goto("/pay/link/e2e-pay-link", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("E2E Test — Event Deposit", { timeout: 20_000 });
    await expect(page.locator("body")).toContainText("$250.00");
    await page.goto("/pay/invoice/e2e-invoice", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("INV-E2E-0001", { timeout: 20_000 });
    await expect(page.locator("body")).toContainText("$1,299.00");
    await page.goto("/pay/link/canary-unknown-slug", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Link not found", { timeout: 20_000 });
  });
});

// Every RequireRole-wrapped route must send a signed-out visitor to /login.
// Mirrors App.tsx (including the routes smoke.spec.ts doesn't list).
const GATED = [
  "/vendor/me",
  "/vendor/edit-profile",
  "/vendor/inbox",
  "/vendor/inbox/00000000-0000-0000-0000-000000000000",
  "/vendor/appointments",
  "/vendor/overview",
  "/vendor/gallery",
  "/vendor/crm",
  "/vendor/scheduling",
  "/vendor/verification",
  "/vendor/team",
  "/vendor/subscription",
  "/customer/inquiries",
  "/customer/events",
  "/settings",
];

test.describe("protected routes (signed out)", () => {
  for (const path of GATED) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
      await expect(page.locator('a[href="/login/vendor"]').first()).toBeVisible();
    });
  }
});

test.describe("other deployed hosts", () => {
  for (const url of ALT_URLS) {
    test(`${url} serves the same app`, async ({ page }) => {
      await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/unforgettable/i, { timeout: 20_000 });
    });
  }

  test("admin host renders its PIN gate", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Admin access" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/4-digit PIN/i)).toBeVisible();
  });
});

