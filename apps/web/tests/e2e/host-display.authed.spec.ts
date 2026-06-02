import { test, expect } from "@playwright/test";

// Authenticated host (customer) dashboard DISPLAY smoke tests — the host-side
// mirror of vendor-display.authed.spec.ts. Requires the seeded e2e-host-1
// account; skips when the E2E creds aren't configured.
const HAS_CREDS = Boolean(process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);

// The real host dashboard routes (everything else under /customer/* is a
// legacy redirect — see App.tsx).
const HOST_ROUTES = [
  "/customer/explore",
  "/customer/inquiries",
  "/customer/events",
  "/customer/profile",
  "/customer/account",
];

test.describe("host dashboard display (authenticated)", () => {
  test.skip(!HAS_CREDS, "E2E_SUPABASE_SERVICE_ROLE_KEY not configured");

  for (const route of HOST_ROUTES) {
    test(`${route} renders for a signed-in host without errors or overflow`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto(route, { waitUntil: "domcontentloaded" });

      // Must NOT bounce to /login — proves the injected host session authed us.
      await expect(page).toHaveURL(new RegExp(route.replace(/\//g, "\\/")), {
        timeout: 15_000,
      });

      // Some content rendered (not a blank error page).
      await expect(page.locator("body")).not.toBeEmpty();

      // No uncaught runtime errors.
      expect(pageErrors, `Uncaught errors on ${route}`).toEqual([]);

      // No horizontal overflow at this (mobile) viewport.
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(2);
    });
  }
});
