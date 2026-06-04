import { matchPath } from "react-router-dom";
import { lazyWithReload } from "@/lib/lazyWithReload";

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
// lazyWithReload wraps React.lazy with stale-chunk auto-heal. See
// lib/lazyWithReload.ts for the full reasoning.

// ---------------- Public ----------------
const importVendorBrowse = () => import("@/pages/VendorBrowsePage");
export const VendorBrowsePage = lazyWithReload(importVendorBrowse);

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

const importLiveWatch = () => import("@/pages/LiveWatchPage");
export const LiveWatchPage = lazyWithReload(importLiveWatch);

const importPublicGalleryShare = () => import("@/pages/PublicGallerySharePage");
export const PublicGallerySharePage = lazyWithReload(importPublicGalleryShare);

const importOAuthConsent = () => import("@/pages/oauth/OAuthConsentPage");
export const OAuthConsentPage = lazyWithReload(importOAuthConsent);


const importVendorDetail = () => import("@/pages/VendorDetailPage");
export const VendorDetailPage = lazyWithReload(importVendorDetail);

const importVendorCategory = () => import("@/pages/VendorCategoryPage");
export const VendorCategoryPage = lazyWithReload(importVendorCategory);

const importPrivacy = () => import("@/pages/PrivacyPage");
export const PrivacyPage = lazyWithReload(importPrivacy);

const importTerms = () => import("@/pages/TermsPage");
export const TermsPage = lazyWithReload(importTerms);

const importHelp = () => import("@/pages/HelpPage");
export const HelpPage = lazyWithReload(importHelp);

const importPayLinkCheckout = () => import("@/pages/public/PayLinkCheckoutPage");
export const PayLinkCheckoutPage = lazyWithReload(importPayLinkCheckout);

const importInvoiceCheckout = () => import("@/pages/public/InvoiceCheckoutPage");
export const InvoiceCheckoutPage = lazyWithReload(importInvoiceCheckout);

const importChangelog = () => import("@/pages/ChangelogPage");
export const ChangelogPage = lazyWithReload(importChangelog);

const importStatus = () => import("@/pages/StatusPage");
export const StatusPage = lazyWithReload(importStatus);

const importPress = () => import("@/pages/PressPage");
export const PressPage = lazyWithReload(importPress);

const importSuperAgents = () => import("@/pages/SuperAgentsPage");
export const SuperAgentsPage = lazyWithReload(importSuperAgents);

const importWebsiteBuilder = () => import("@/pages/WebsiteBuilderPage");
export const WebsiteBuilderPage = lazyWithReload(importWebsiteBuilder);

const importPublicAiSite = () => import("@/pages/PublicAiSitePage");
export const PublicAiSitePage = lazyWithReload(importPublicAiSite);

const importMySites = () => import("@/pages/MySitesPage");
export const MySitesPage = lazyWithReload(importMySites);

const importSiteRsvps = () => import("@/pages/SiteRsvpsPage");
export const SiteRsvpsPage = lazyWithReload(importSiteRsvps);

const importSettings = () => import("@/pages/SettingsPage");
export const SettingsPage = lazyWithReload(importSettings);

const importNotificationSettings = () =>
  import("@/pages/NotificationSettingsPage");
export const NotificationSettingsPage = lazyWithReload(
  importNotificationSettings,
);

const importNotFound = () => import("@/pages/NotFound");
export const NotFound = lazyWithReload(importNotFound);

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

const importHostAccount = () => import("@/pages/customer/HostAccountPage");
export const HostAccountPage = lazyWithReload(importHostAccount);

const importPublicEventRsvp = () => import("@/pages/PublicEventRsvpPage");
export const PublicEventRsvpPage = lazyWithReload(importPublicEventRsvp);

const importPublicExplore = () => import("@/pages/PublicExplorePage");
export const PublicExplorePage = lazyWithReload(importPublicExplore);

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

const importVendorIntegrations = () =>
  import("@/pages/vendor/VendorIntegrationsPage");
export const VendorIntegrationsPage = lazyWithReload(importVendorIntegrations);

const importVendorPayments = () => import("@/pages/vendor/VendorPaymentsPage");
export const VendorPaymentsPage = lazyWithReload(importVendorPayments);

const importMyVendora = () => import("@/pages/vendor/MyVendoraPage");
export const MyVendoraPage = lazyWithReload(importMyVendora);

const importVendorSubscription = () => import("@/pages/vendor/VendorSubscriptionPage");
export const VendorSubscriptionPage = lazyWithReload(importVendorSubscription);

const importVendorUsage = () => import("@/pages/vendor/VendorUsagePage");
export const VendorUsagePage = lazyWithReload(importVendorUsage);

const importVendorGallery = () => import("@/pages/vendor/VendorGalleryPage");
export const VendorGalleryPage = lazyWithReload(importVendorGallery);

const importVendorTemplates = () => import("@/pages/vendor/VendorTemplatesPage");
export const VendorTemplatesPage = lazyWithReload(importVendorTemplates);

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
  { pattern: "/help", importer: importHelp },
  { pattern: "/pay/link/:slug", importer: importPayLinkCheckout },
  { pattern: "/pay/invoice/:slug", importer: importInvoiceCheckout },
  { pattern: "/changelog", importer: importChangelog },
  { pattern: "/status", importer: importStatus },
  { pattern: "/press", importer: importPress },
  { pattern: "/super-agents", importer: importSuperAgents },
  { pattern: "/website-builder", importer: importWebsiteBuilder },
  { pattern: "/my-sites", importer: importMySites },
  { pattern: "/my-sites/:slug/rsvps", importer: importSiteRsvps },
  { pattern: "/s/:slug", importer: importPublicAiSite },
  { pattern: "/g/:token", importer: importPublicGalleryShare },
  { pattern: "/settings", importer: importSettings },
  { pattern: "/settings/notifications", importer: importNotificationSettings },
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
  // Customer — mirrors mobile host tabs (Explore / Inbox / Events / Profile + Settings)
  { pattern: "/customer/explore", importer: importCustomerExplore },
  { pattern: "/customer/inquiries", importer: importInquiries },
  { pattern: "/customer/inquiries/:inquiryId", importer: importHostInquiryDetail },
  { pattern: "/customer/events", importer: importHostEvents },
  { pattern: "/customer/profile", importer: importHostProfile },
  { pattern: "/customer/account", importer: importHostAccount },
  // Vendor
  { pattern: "/vendor/me", importer: importVendorMyProfile },
  { pattern: "/vendor/edit-profile", importer: importVendorEditProfile },
  { pattern: "/vendor/inbox", importer: importVendorInbox },
  { pattern: "/vendor/appointments", importer: importVendorAppointments },
  { pattern: "/vendor/partners", importer: importVendorPartners },
  { pattern: "/vendor/ai-superagents", importer: importVendorAiSuperagents },
  { pattern: "/vendor/integrations", importer: importVendorIntegrations },
  { pattern: "/vendor/payments", importer: importVendorPayments },
  { pattern: "/vendor/overview", importer: importMyVendora },
  { pattern: "/vendor/workspace", importer: importMyVendora },
  { pattern: "/vendor/subscription", importer: importVendorSubscription },
  { pattern: "/vendor/usage", importer: importVendorUsage },
  { pattern: "/vendor/gallery", importer: importVendorGallery },
  { pattern: "/vendor/templates", importer: importVendorTemplates },
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
