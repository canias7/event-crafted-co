import { test, expect } from "@playwright/test";

// Smoke tests — sanity-check that key public routes render without runtime
// errors and that protected routes correctly redirect to /login.

const publicRoutes = [
  { path: "/", contains: "Vendora" },
  { path: "/vendors", contains: "Find your" },
  { path: "/vendors/1", contains: "Luminara Photography" },
  { path: "/vendors/category/photographers", contains: "Photographers" },
  { path: "/inspiration", contains: "Real events" },
  { path: "/inspiration/hudson-valley-garden-wedding", contains: "Hudson Valley" },
  { path: "/vendor-apply", contains: "Become a" },
  { path: "/login", contains: "Sign in" },
  { path: "/signup", contains: "Create your account" },
  { path: "/forgot-password", contains: "Forgot password" },
  { path: "/privacy", contains: "Privacy" },
  { path: "/terms", contains: "Terms of service" },
  { path: "/rsvp/invalid-token-test", contains: "Invitation not found" },
];

for (const r of publicRoutes) {
  test(`public ${r.path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(r.path, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(r.contains, {
      timeout: 5_000,
    });
    expect(errors, `Page errors on ${r.path}`).toEqual([]);
  });
}

const gatedRoutes = [
  "/customer/dashboard",
  "/customer/inquiries",
  "/customer/event",
  "/customer/guests",
  "/customer/checklist",
  "/customer/tasks",
  "/customer/payments",
  "/customer/favorites",
  "/vendor/dashboard",
  "/vendor/profile",
  "/vendor/inbox",
  "/vendor/availability",
  "/vendor/templates",
  "/admin/dashboard",
  "/admin/vendors",
  "/admin/reviews",
  "/settings",
];

for (const path of gatedRoutes) {
  test(`gated ${path} redirects to /login`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login$/);
  });
}
