import { test, expect } from "@playwright/test";

// Smoke tests — sanity-check that key public routes render without runtime
// errors and that protected routes correctly redirect to /login. Covers
// every public surface shipped through the engine session, so future
// regressions blow up here instead of in production.

// Public routes that should render a real page (or a real error state).
// Redirect-only paths (/vendor-apply, /board/:token,
// /accept-planning-invite/:token) and removed routes (/vendors/map) are
// intentionally excluded — their redirect behavior, where relevant, is
// covered elsewhere.
const publicRoutes = [
  // Marketing / discovery
  "/",
  "/vendors",
  "/vendors/locations",
  "/vendors/category/media",
  // Auth
  "/login",
  "/signup",
  "/forgot-password",
  // Legal
  "/privacy",
  "/terms",
  // Token-gated routes — an invalid token renders an explicit error
  // state, which is its own form of correct rendering.
  "/rsvp/invalid-token-test",
  "/accept-team-invite/invalid-token",
];

for (const path of publicRoutes) {
  test(`public ${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // `domcontentloaded` (not `networkidle`) — some pages hold long-lived
    // Supabase realtime/fetch connections that never let the network idle.
    await page.goto(path, { waitUntil: "domcontentloaded" });

    // Assert the app shell hydrated and rendered meaningful content — a
    // blank body or a crash fails here. We check that content rendered
    // rather than specific marketing copy (which drifts) or full data-loaded
    // content (data-heavy directory pages can take a while on a cold CI
    // runner — the nav/shell at ~30+ chars is enough to prove no crash).
    await expect
      .poll(
        async () => (await page.locator("body").innerText()).trim().length,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(20);

    expect(errors, `Page errors on ${path}`).toEqual([]);
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
  // Wait for hydration so the global keydown listener is attached before
  // we press — otherwise the shortcut is a no-op against a static shell.
  await expect(page.locator("body")).toContainText("Vendora", {
    timeout: 10_000,
  });
  await page.keyboard.press("Meta+K");
  await expect(
    page.getByPlaceholder("Search vendors, pages…"),
  ).toBeVisible({ timeout: 5_000 });
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

// Vendor browse filter — the search box should render and accept input
// without crashing. (Asserting specific result content is data-dependent
// and flaky, so we verify the interaction itself, not the live directory.)
test("vendor search box renders and accepts input", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/vendors", { waitUntil: "domcontentloaded" });
  const searchBox = page.getByPlaceholder(
    /Search vendors, categories, or keywords/i,
  );
  await expect(searchBox).toBeVisible({ timeout: 10_000 });
  await searchBox.fill("photographer");
  await expect(searchBox).toHaveValue("photographer");
  // Give the filter useMemo a tick to recompute (purely client-side).
  await page.waitForTimeout(200);
  expect(errors, "Page errors after filtering").toEqual([]);
});

