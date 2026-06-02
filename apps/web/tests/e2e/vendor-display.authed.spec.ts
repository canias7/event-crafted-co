import { test, expect } from "@playwright/test";

// Authenticated vendor-dashboard DISPLAY smoke tests. These require a
// throwaway approved-vendor account, provided via env (see auth.setup.ts):
//   E2E_VENDOR_EMAIL, E2E_VENDOR_PASSWORD
//   E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY (default to the VITE_* vars)
// When those aren't set the whole file skips, so CI stays green until a
// test account is wired up.
const HAS_CREDS = Boolean(
  process.env.E2E_VENDOR_EMAIL && process.env.E2E_VENDOR_PASSWORD,
);

// The current vendor dashboard routes (mirror App.tsx / smoke.spec.ts).
const VENDOR_ROUTES = [
  "/vendor/overview",
  "/vendor/workspace",
  "/vendor/inbox",
  "/vendor/me",
  "/vendor/edit-profile",
  "/vendor/partners",
  "/vendor/ai-superagents",
  "/vendor/integrations",
  "/vendor/subscription",
  "/vendor/usage",
  "/vendor/gallery",
  "/vendor/templates",
];

test.describe("vendor dashboard display (authenticated)", () => {
  test.skip(!HAS_CREDS, "E2E_VENDOR_EMAIL/PASSWORD not configured");

  for (const route of VENDOR_ROUTES) {
    test(`${route} renders for a signed-in vendor without errors or overflow`, async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto(route, { waitUntil: "domcontentloaded" });

      // Must NOT bounce to /login — proves the injected session authed us.
      await expect(page).toHaveURL(new RegExp(route.replace(/\//g, "\\/")), {
        timeout: 15_000,
      });

      // Some content rendered (not a blank error page).
      await expect(page.locator("body")).not.toBeEmpty();

      // No uncaught runtime errors.
      expect(pageErrors, `Uncaught errors on ${route}`).toEqual([]);

      // No horizontal overflow at this (mobile) viewport — guards the
      // bottom-nav clearance / table / grid display fixes. Allow a 2px
      // tolerance for sub-pixel rounding.
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(2);
    });
  }
});
