import { lazy, type ComponentType } from "react";
import { matchPath } from "react-router-dom";

// Centralized lazy-route registry. Keeping the import factory and the
// lazy-wrapped component side-by-side lets PrefetchLink warm the chunk
// on hover/visibility before the user actually clicks.
//
// To add a new route:
//   1. Add `const importFoo = () => import("@/pages/Foo")` then
//      `export const FooPage = lazyWithReload(importFoo)` below.
//   2. Add the path → importer entry to ROUTE_IMPORTERS at the bottom.
//
// Static routes match exactly; dynamic routes use react-router-dom's
// matchPath (so `/vendors/:id` matches `/vendors/abc-123`).
//
// `lazyWithReload` is a thin wrapper around React.lazy that catches
// the stale-chunk error a user gets when they have a cached index.html
// from a previous deploy that references hashed JS chunks the new
// deploy no longer has. In that case Vercel's SPA fallback returns
// index.html for the missing chunk URL, the browser rejects it with
// "Failed to fetch dynamically imported module" / MIME mismatch, and
// the page is dead. We auto-reload once to pick up the fresh
// index.html. Reload is rate-limited to once per 60s so a genuinely
// broken deploy doesn't put the user in an infinite loop.

function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const msg = String((err as { message?: string })?.message ?? err);
      const isChunkError =
        /Failed to fetch dynamically imported module|ChunkLoadError|Loading chunk|Importing a module script failed|MIME type/i.test(
          msg,
        );
      if (isChunkError && typeof window !== "undefined") {
        const key = "vendora.lastChunkReload";
        const last = window.sessionStorage.getItem(key);
        const now = Date.now();
        if (!last || now - Number(last) > 60_000) {
          window.sessionStorage.setItem(key, String(now));
          window.location.reload();
        }
      }
      throw err;
    }),
  );
}

// ---------------- Public ----------------
const importVendorBrowse = () => import("@/pages/VendorBrowsePage");
export const VendorBrowsePage = lazyWithReload(importVendorBrowse);

const importCompareVendors = () => import("@/pages/CompareVendorsPage");
export const CompareVendorsPage = lazyWithReload(importCompareVendors);

const importVendorLocations = () => import("@/pages/VendorLocationsPage");
export const VendorLocationsPage = lazyWithReload(importVendorLocations);

const importVendorCity = () => import("@/pages/VendorCityPage");
export const VendorCityPage = lazyWithReload(importVendorCity);

const importVendorCityCategory = () => import("@/pages/VendorCityCategoryPage");
export const VendorCityCategoryPage = lazyWithReload(importVendorCityCategory);

const importVendorEventTypeCity = () =>
  import("@/pages/VendorEventTypeCityPage");
export const VendorEventTypeCityPage = lazyWithReload(importVendorEventTypeCity);

const importClaimVendor = () => import("@/pages/ClaimVendorPage");
export const ClaimVendorPage = lazyWithReload(importClaimVendor);

const importPublicReview = () => import("@/pages/PublicReviewPage");
export const PublicReviewPage = lazyWithReload(importPublicReview);

const importProposalPrint = () => import("@/pages/ProposalPrintPage");
export const ProposalPrintPage = lazyWithReload(importProposalPrint);

const importPublicProposal = () => import("@/pages/PublicProposalPage");
export const PublicProposalPage = lazyWithReload(importPublicProposal);


const importVendorDetail = () => import("@/pages/VendorDetailPage");
export const VendorDetailPage = lazyWithReload(importVendorDetail);

const importVendorCategory = () => import("@/pages/VendorCategoryPage");
export const VendorCategoryPage = lazyWithReload(importVendorCategory);

const importPrivacy = () => import("@/pages/PrivacyPage");
export const PrivacyPage = lazyWithReload(importPrivacy);

const importTerms = () => import("@/pages/TermsPage");
export const TermsPage = lazyWithReload(importTerms);

const importChangelog = () => import("@/pages/ChangelogPage");
export const ChangelogPage = lazyWithReload(importChangelog);

const importStatus = () => import("@/pages/StatusPage");
export const StatusPage = lazyWithReload(importStatus);

const importPress = () => import("@/pages/PressPage");
export const PressPage = lazyWithReload(importPress);

const importSuperAgents = () => import("@/pages/SuperAgentsPage");
export const SuperAgentsPage = lazyWithReload(importSuperAgents);

const importSettings = () => import("@/pages/SettingsPage");
export const SettingsPage = lazyWithReload(importSettings);

const importNotFound = () => import("@/pages/NotFound");
export const NotFound = lazyWithReload(importNotFound);

const importAcceptTeamInvite = () => import("@/pages/AcceptTeamInvitePage");
export const AcceptTeamInvitePage = lazyWithReload(importAcceptTeamInvite);

// ---------------- Customer (host) — mirrors mobile host tabs ----------------
const importInquiries = () => import("@/pages/customer/InquiriesPage");
export const InquiriesPage = lazyWithReload(importInquiries);

const importHostInquiryDetail = () => import("@/pages/customer/HostInquiryDetailPage");
export const HostInquiryDetailPage = lazyWithReload(importHostInquiryDetail);

const importHostEvents = () => import("@/pages/customer/HostEventsPage");
export const HostEventsPage = lazyWithReload(importHostEvents);

const importCustomerExplore = () => import("@/pages/customer/CustomerExplorePage");
export const CustomerExplorePage = lazyWithReload(importCustomerExplore);

const importHostProfile = () => import("@/pages/customer/HostProfilePage");
export const HostProfilePage = lazyWithReload(importHostProfile);

// ---------------- Vendor ----------------
// VendorHomePage deleted — /vendor/me is the landing surface for
// vendors. /vendor/home redirects to /vendor/me in App.tsx so any
// stale bookmarks still resolve.

const importVendorMyProfile = () => import("@/pages/vendor/VendorMyProfilePage");
export const VendorMyProfilePage = lazyWithReload(importVendorMyProfile);

const importVendorEditProfile = () => import("@/pages/vendor/VendorEditProfilePage");
export const VendorEditProfilePage = lazyWithReload(importVendorEditProfile);

const importVendorInbox = () => import("@/pages/vendor/VendorInboxPage");
export const VendorInboxPage = lazyWithReload(importVendorInbox);

const importVendorAppointments = () => import("@/pages/vendor/VendorAppointmentsPage");
export const VendorAppointmentsPage = lazyWithReload(importVendorAppointments);

const importVendorPartners = () => import("@/pages/vendor/VendorPartnersPage");
export const VendorPartnersPage = lazyWithReload(importVendorPartners);

const importVendorAiSuperagents = () =>
  import("@/pages/vendor/VendorAiSuperagentsPage");
export const VendorAiSuperagentsPage = lazyWithReload(importVendorAiSuperagents);

const importVendorPay = () => import("@/pages/vendor/VendorPayPage");
export const VendorPayPage = lazyWithReload(importVendorPay);

const importVendorGallery = () => import("@/pages/vendor/VendorGalleryPage");
export const VendorGalleryPage = lazyWithReload(importVendorGallery);

const importInquiryDetail = () => import("@/pages/vendor/InquiryDetailPage");
export const InquiryDetailPage = lazyWithReload(importInquiryDetail);

// ---------------- path → importer registry ----------------
// Order matters for matchPath — more specific patterns first. Static
// strings are tried before dynamic ones via Map insertion order.
const ROUTE_IMPORTERS: Array<{ pattern: string; importer: () => Promise<unknown> }> = [
  // Static public
  { pattern: "/vendors", importer: importVendorBrowse },
  { pattern: "/vendors/locations", importer: importVendorLocations },
  { pattern: "/privacy", importer: importPrivacy },
  { pattern: "/terms", importer: importTerms },
  { pattern: "/changelog", importer: importChangelog },
  { pattern: "/status", importer: importStatus },
  { pattern: "/press", importer: importPress },
  { pattern: "/super-agents", importer: importSuperAgents },
  { pattern: "/settings", importer: importSettings },
  // Dynamic public
  { pattern: "/vendors/in/:citySlug", importer: importVendorCity },
  { pattern: "/vendors/category/:slug", importer: importVendorCategory },
  // Programmatic SEO: city × category cross-product.
  {
    pattern: "/vendors/:categorySlug/in/:citySlug",
    importer: importVendorCityCategory,
  },
  // Programmatic SEO: event-type × city.
  {
    pattern: "/:eventTypeSlug-vendors/:citySlug",
    importer: importVendorEventTypeCity,
  },
  { pattern: "/vendors/:id", importer: importVendorDetail },
  { pattern: "/v/:slug", importer: importVendorDetail },
  { pattern: "/accept-team-invite/:token", importer: importAcceptTeamInvite },
  // Customer — mirrors mobile host tabs (Explore / Inbox / Events / Profile + Settings)
  { pattern: "/customer/explore", importer: importCustomerExplore },
  { pattern: "/customer/inquiries", importer: importInquiries },
  { pattern: "/customer/inquiries/:inquiryId", importer: importHostInquiryDetail },
  { pattern: "/customer/events", importer: importHostEvents },
  { pattern: "/customer/profile", importer: importHostProfile },
  // Vendor
  { pattern: "/vendor/me", importer: importVendorMyProfile },
  { pattern: "/vendor/edit-profile", importer: importVendorEditProfile },
  { pattern: "/vendor/inbox", importer: importVendorInbox },
  { pattern: "/vendor/appointments", importer: importVendorAppointments },
  { pattern: "/vendor/partners", importer: importVendorPartners },
  { pattern: "/vendor/ai-superagents", importer: importVendorAiSuperagents },
  { pattern: "/vendor/pay", importer: importVendorPay },
  { pattern: "/vendor/gallery", importer: importVendorGallery },
  { pattern: "/vendor/inbox/:inquiryId", importer: importInquiryDetail },
];

// Resolve a path string ("/vendors/abc-123") to an importer factory if
// any registered route pattern matches.
export function resolveRouteImporter(
  path: string,
): (() => Promise<unknown>) | undefined {
  // Strip query + hash.
  const clean = path.split("?")[0].split("#")[0] || "/";
  for (const { pattern, importer } of ROUTE_IMPORTERS) {
    if (matchPath({ path: pattern, end: true }, clean)) {
      return importer;
    }
  }
  return undefined;
}
