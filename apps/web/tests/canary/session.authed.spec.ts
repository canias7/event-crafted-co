import fs from "node:fs";
import { test, expect, expectSettled } from "./fixtures";
import { AUTH_CONFIGURED, BASE_URL, BLOCKED_REASON, SUPABASE_REF } from "./env";
import { CANARY_HOST_STATE, CANARY_VENDOR_STATE } from "./paths";

// Session handling and UI-level authorization. All client-side: sign-out is
// simulated by clearing the stored session (a real "Log out" revokes every
// session for the account and would break the parallel tests).

const KEY = `sb-${SUPABASE_REF}-auth-token`;

function storedSession(file: string) {
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const item = state.origins[0].localStorage.find((i: { name: string }) => i.name === KEY);
  return JSON.parse(item.value);
}

function stateWith(session: unknown) {
  return {
    cookies: [],
    origins: [{ origin: new URL(BASE_URL).origin, localStorage: [{ name: KEY, value: JSON.stringify(session) }] }],
  };
}

test.describe("session handling", () => {
  test.skip(!AUTH_CONFIGURED, BLOCKED_REASON);

  // The project's default storage state is the seeded vendor session.
  test("vendor session survives a reload", async ({ page }) => {
    await page.goto("/vendor/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Inbox", { timeout: 20_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/vendor\/inbox$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Inbox", { timeout: 20_000 });
  });

  test("clearing the session sends protected routes back to /login", async ({ page }) => {
    await page.goto("/vendor/overview", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 20_000 });
    await page.evaluate((k) => localStorage.removeItem(k), KEY);
    await page.goto("/vendor/overview", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  });

  test("an expired session with an unusable refresh token ends at /login", async ({ browser }, testInfo) => {
    // The client tries (and fails) to refresh — a 400 from /token is expected.
    testInfo.annotations.push({ type: "guard:off", description: "refresh failure is the point of this test" });
    const s = storedSession(CANARY_VENDOR_STATE);
    const expired = { ...s, expires_at: Math.floor(Date.now() / 1000) - 3600, refresh_token: "canary-invalid-refresh" };
    const ctx = await browser.newContext({ storageState: stateWith(expired) });
    const page = await ctx.newPage();
    await page.goto("/vendor/inbox", { waitUntil: "domcontentloaded" });
    await expect(page, "expired session must not grant access").toHaveURL(/\/login$/, { timeout: 30_000 });
    await ctx.close();
  });

  test("a tampered access token is not trusted and does not hang the app", async ({ browser }, testInfo) => {
    testInfo.annotations.push({ type: "guard:off", description: "401s from the API are the point of this test" });
    const s = storedSession(CANARY_VENDOR_STATE);
    const [h, p] = s.access_token.split(".");
    const forged = { ...s, access_token: `${h}.${p}.invalidsignatureinvalidsignature`, refresh_token: "canary-invalid-refresh" };
    const ctx = await browser.newContext({ storageState: stateWith(forged) });
    const page = await ctx.newPage();
    await page.goto("/vendor/inbox", { waitUntil: "domcontentloaded" });
    // Acceptable outcomes: bounced to /login, or the page renders with no
    // vendor data. Not acceptable: showing the inbox, or an endless spinner.
    await page.waitForTimeout(8_000);
    const url = page.url();
    if (!/\/login$/.test(url)) {
      await expect(page.getByText("Loading…", { exact: true }), "app hangs on Loading… with a rejected token").toHaveCount(0, {
        timeout: 15_000,
      });
      await expect(page.locator('a[href^="/vendor/inbox/"]'), "a forged token must not reveal inquiries").toHaveCount(0);
    }
    await ctx.close();
  });

  test.describe("as the dedicated host", () => {
    test.use({ storageState: CANARY_HOST_STATE });

    test("a host session cannot open vendor pages", async ({ page }) => {
      await page.goto("/vendor/inbox", { waitUntil: "domcontentloaded" });
      // RequireRole sends a signed-in non-vendor to the home page.
      await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 20_000 });
      await expect(page.locator('a[href^="/vendor/inbox/"]')).toHaveCount(0);
    });

    test("a host session reaches its own inquiries", async ({ page }) => {
      await page.goto("/customer/inquiries", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/customer\/inquiries$/, { timeout: 20_000 });
      await expectSettled(page);
    });
  });
});
