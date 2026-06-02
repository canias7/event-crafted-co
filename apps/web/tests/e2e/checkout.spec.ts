import { test, expect } from "@playwright/test";

// Public payment-checkout pages — /pay/link/:slug and /pay/invoice/:slug.
// No auth: they load via anon-callable SECURITY DEFINER RPCs
// (get_payment_link_for_checkout / get_invoice_for_checkout). The valid-slug
// cases use the seeded e2e fixtures (e2e-pay-link / e2e-invoice); the
// unknown-slug cases need no data. We assert the page renders the right
// details (and a clean not-found state) — not the Stripe payment step, which
// needs a connected account and is out of scope for a render smoke test.

test.describe("payment checkout pages", () => {
  test("pay link — valid slug renders the link title + amount", async ({ page }) => {
    await page.goto("/pay/link/e2e-pay-link", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("E2E Test — Event Deposit", {
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText("$250.00", { timeout: 15_000 });
  });

  test("pay link — unknown slug renders a clean not-found", async ({ page }) => {
    await page.goto("/pay/link/e2e-does-not-exist-xyz", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Link not found", { timeout: 15_000 });
  });

  test("invoice — valid slug renders the invoice + total due", async ({ page }) => {
    await page.goto("/pay/invoice/e2e-invoice", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("$1,299.00", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText("Wedding photography package", {
      timeout: 15_000,
    });
  });

  test("invoice — unknown slug renders a clean not-found", async ({ page }) => {
    await page.goto("/pay/invoice/e2e-does-not-exist-xyz", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("Invoice not found", { timeout: 15_000 });
  });
});
