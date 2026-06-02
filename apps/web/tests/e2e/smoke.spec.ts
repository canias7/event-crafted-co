import { test, expect } from "@playwright/test";

// Smoke tests — sanity-check that key public routes render without runtime
// errors and that protected routes correctly redirect to /login. Covers
// every public surface shipped through the engine session, so future
// regressions blow up here instead of in production.

const publicRoutes = [
  // Marketing / discovery
  { path: "/", contains: "Vendora" },
  { path: "/vendors", contains: "Find your" },
  { path: "/vendors/locations", contains: "VENDORS BY LOCATION" },
  { path: "/vendors/map", contains: "VENDOR MAP" },
  { path: "/vendors/category/media", contains: "Media" },
  // Auth
  { path: "/vendor-apply", contains: "Become a" },
  { path: "/login", contains: "Host sign in" },
  { path: "/signup", contains: "Create an account" },
  { path: "/forgot-password", contains: "Forgot password" },
  // Legal
  { path: "/privacy", contains: "Privacy" },
  { path: "/terms", contains: "Terms of service" },
  // Token-gated routes — invalid tokens render an explicit error state,
  // which is its own form of correct rendering
  { path: "/rsvp/invalid-token-test", contains: "Invitation not found" },
  { path: "/board/invalid-token-test", contains: "Board not found" },
  { path: "/accept-team-invite/invalid-token", contains: "Invite not found" },
  { path: "/accept-planning-invite/invalid-token", contains: "Invite not found" },
];

for (const r of publicRoutes) {
  test(`public ${r.path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Use `domcontentloaded` instead of `networkidle` because some pages
    // hold long-lived Supabase realtime / fetch connections that never
    // let the network go idle in CI (no Supabase reachable). The
    // toContainText timeout below still gives hydration time to render.
    await page.goto(r.path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(r.contains, {
      timeout: 10_000,
    });
    expect(errors, `Page errors on ${r.path}`).toEqual([]);
  });
}

// Every gated portal route — host and vendor — should redirect to
// /login when accessed without auth. Catches accidental drops of the
// RequireRole wrapper.
const gatedRoutes = [
  // Customer
  "/customer/dashboard",
  "/customer/onboarding",
  "/customer/inquiries",
  "/customer/event",
  "/customer/guests",
  "/customer/seating",
  "/customer/timeline",
  "/customer/appointments",
  "/customer/invitations",
  "/customer/checklist",
  "/customer/tasks",
  "/customer/payments",
  "/customer/favorites",
  "/customer/saved-searches",
  "/customer/moodboards",
  "/customer/registry",
  "/customer/planning-team",
  // Vendor — current dashboard routes (see App.tsx). All wrapped in
  // RequireRole role="vendor"; unauthenticated access must land on /login.
  "/vendor/me",
  "/vendor/edit-profile",
  "/vendor/inbox",
  "/vendor/overview",
  "/vendor/workspace",
  "/vendor/partners",
  "/vendor/ai-superagents",
  "/vendor/integrations",
  "/vendor/subscription",
  "/vendor/usage",
  "/vendor/gallery",
  "/vendor/templates",
  // Account
  "/settings",
];

for (const path of gatedRoutes) {
  test(`gated ${path} redirects to /login`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
  });
}

// Cmd-K command palette is mounted globally — it should open on any
// page when the user hits the keyboard shortcut. Exercises the cross-
// cutting wiring (provider mounted, document.addEventListener).
test("Cmd-K opens the command palette from the landing page", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Meta+K");
  await expect(
    page.getByPlaceholder("Search vendors, pages…"),
  ).toBeVisible({ timeout: 2_000 });
});

// 404 fallback renders for unknown routes.
test("/some-bogus-route renders the 404 page", async ({ page }) => {
  await page.goto("/some-bogus-route-that-doesnt-exist", {
    waitUntil: "domcontentloaded",
  });
  // The NotFound component should produce some text — content can vary,
  // but an empty body would be a regression.
  const body = await page.locator("body").innerText();
  expect(body.length).toBeGreaterThan(10);
});

// Vendor browse filter — typing in the search box should narrow results.
// Doesn't require auth; uses sample vendors that always render.
test("vendor search filter narrows the directory", async ({ page }) => {
  await page.goto("/vendors", { waitUntil: "domcontentloaded" });
  const searchBox = page.getByPlaceholder(
    /Search vendors, categories, or keywords/i,
  );
  await searchBox.fill("photographer");
  // Give the filter useMemo a tick to recompute. networkidle isn't
  // useful here since filtering is purely client-side.
  await page.waitForTimeout(200);
  // At least one result should be visible after filtering
  await expect(page.locator("body")).toContainText(/photo/i);
});

