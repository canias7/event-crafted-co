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

const importEditorialArticle = () => import("@/pages/EditorialArticlePage");
export const EditorialArticlePage = lazyWithReload(importEditorialArticle);

const importClaimVendor = () => import("@/pages/ClaimVendorPage");
export const ClaimVendorPage = lazyWithReload(importClaimVendor);

const importPublicReview = () => import("@/pages/PublicReviewPage");
export const PublicReviewPage = lazyWithReload(importPublicReview);

const importProposalPrint = () => import("@/pages/ProposalPrintPage");
export const ProposalPrintPage = lazyWithReload(importProposalPrint);

const importPublicProposal = () => import("@/pages/PublicProposalPage");
export const PublicProposalPage = lazyWithReload(importPublicProposal);

const importPlanInFive = () => import("@/pages/PlanInFivePage");
export const PlanInFivePage = lazyWithReload(importPlanInFive);

const importVendorBlog = () => import("@/pages/vendor/VendorBlogPage");
export const VendorBlogPage = lazyWithReload(importVendorBlog);

const importVendorMap = () => import("@/pages/VendorMapPage");
export const VendorMapPage = lazyWithReload(importVendorMap);


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

const importSettings = () => import("@/pages/SettingsPage");
export const SettingsPage = lazyWithReload(importSettings);

const importVendorApply = () => import("@/pages/VendorApplyPage");
export const VendorApplyPage = lazyWithReload(importVendorApply);

const importVendorApplyThanks = () => import("@/pages/VendorApplyThanksPage");
export const VendorApplyThanksPage = lazyWithReload(importVendorApplyThanks);

const importNotFound = () => import("@/pages/NotFound");
export const NotFound = lazyWithReload(importNotFound);

const importComingSoon = () => import("@/pages/ComingSoonPage");
export const ComingSoonPage = lazyWithReload(importComingSoon);

const importRsvp = () => import("@/pages/RsvpPage");
export const RsvpPage = lazyWithReload(importRsvp);

const importMoodBoardShare = () => import("@/pages/MoodBoardSharePage");
export const MoodBoardSharePage = lazyWithReload(importMoodBoardShare);

const importGiftShare = () => import("@/pages/GiftSharePage");
export const GiftSharePage = lazyWithReload(importGiftShare);

const importRealEvents = () => import("@/pages/RealEventsPage");
export const RealEventsPage = lazyWithReload(importRealEvents);

const importRealEventDetail = () => import("@/pages/RealEventDetailPage");
export const RealEventDetailPage = lazyWithReload(importRealEventDetail);

const importAcceptPlanningInvite = () => import("@/pages/AcceptPlanningInvitePage");
export const AcceptPlanningInvitePage = lazyWithReload(importAcceptPlanningInvite);

const importAcceptTeamInvite = () => import("@/pages/AcceptTeamInvitePage");
export const AcceptTeamInvitePage = lazyWithReload(importAcceptTeamInvite);

// ---------------- Customer (host) ----------------
const importCustomerDashboard = () => import("@/pages/customer/CustomerDashboard");
export const CustomerDashboard = lazyWithReload(importCustomerDashboard);

const importCustomerVendorsBrowse = () => import("@/pages/customer/VendorsBrowsePage");
export const CustomerVendorsBrowsePage = lazyWithReload(importCustomerVendorsBrowse);

const importOnboarding = () => import("@/pages/customer/OnboardingPage");
export const OnboardingPage = lazyWithReload(importOnboarding);

const importInquiries = () => import("@/pages/customer/InquiriesPage");
export const InquiriesPage = lazyWithReload(importInquiries);

const importHostInquiryDetail = () => import("@/pages/customer/HostInquiryDetailPage");
export const HostInquiryDetailPage = lazyWithReload(importHostInquiryDetail);

const importFavorites = () => import("@/pages/customer/FavoritesPage");
export const FavoritesPage = lazyWithReload(importFavorites);

const importEventDetails = () => import("@/pages/customer/EventDetailsPage");
export const EventDetailsPage = lazyWithReload(importEventDetails);

const importHostEvents = () => import("@/pages/customer/HostEventsPage");
export const HostEventsPage = lazyWithReload(importHostEvents);

const importCustomerExplore = () => import("@/pages/customer/CustomerExplorePage");
export const CustomerExplorePage = lazyWithReload(importCustomerExplore);

const importGuests = () => import("@/pages/customer/GuestsPage");
export const GuestsPage = lazyWithReload(importGuests);

const importChecklist = () => import("@/pages/customer/ChecklistPage");
export const ChecklistPage = lazyWithReload(importChecklist);

const importTasks = () => import("@/pages/customer/TasksPage");
export const TasksPage = lazyWithReload(importTasks);

const importPayments = () => import("@/pages/customer/PaymentsPage");
export const PaymentsPage = lazyWithReload(importPayments);

const importInvitationBuilder = () => import("@/pages/customer/InvitationBuilder");
export const InvitationBuilder = lazyWithReload(importInvitationBuilder);

const importMoodBoards = () => import("@/pages/customer/MoodBoardsPage");
export const MoodBoardsPage = lazyWithReload(importMoodBoards);

const importMoodBoardDetail = () => import("@/pages/customer/MoodBoardDetailPage");
export const MoodBoardDetailPage = lazyWithReload(importMoodBoardDetail);

const importAppointments = () => import("@/pages/customer/AppointmentsPage");
export const AppointmentsPage = lazyWithReload(importAppointments);

const importSavedSearches = () => import("@/pages/customer/SavedSearchesPage");
export const SavedSearchesPage = lazyWithReload(importSavedSearches);

const importSeatingChart = () => import("@/pages/customer/SeatingChartPage");
export const SeatingChartPage = lazyWithReload(importSeatingChart);

const importEventTimeline = () => import("@/pages/customer/EventTimelinePage");
export const EventTimelinePage = lazyWithReload(importEventTimeline);

const importPlanningTeam = () => import("@/pages/customer/PlanningTeamPage");
export const PlanningTeamPage = lazyWithReload(importPlanningTeam);

const importRegistry = () => import("@/pages/customer/RegistryPage");
export const RegistryPage = lazyWithReload(importRegistry);

const importMessages = () => import("@/pages/customer/MessagesPage");
export const MessagesPage = lazyWithReload(importMessages);

const importInquiryBlast = () => import("@/pages/customer/InquiryBlastPage");
export const InquiryBlastPage = lazyWithReload(importInquiryBlast);

const importLiveDay = () => import("@/pages/customer/LiveDayPage");
export const LiveDayPage = lazyWithReload(importLiveDay);

const importGiftWishes = () => import("@/pages/customer/GiftWishesPage");
export const GiftWishesPage = lazyWithReload(importGiftWishes);

const importMicrositeEditor = () => import("@/pages/customer/MicrositeEditorPage");
export const MicrositeEditorPage = lazyWithReload(importMicrositeEditor);

const importEventMicrosite = () => import("@/pages/EventMicrositePage");
export const EventMicrositePage = lazyWithReload(importEventMicrosite);

const importPlannerWorkspace = () => import("@/pages/customer/PlannerWorkspacePage");
export const PlannerWorkspacePage = lazyWithReload(importPlannerWorkspace);

const importPartyHub = () => import("@/pages/PartyHubPage");
export const PartyHubPage = lazyWithReload(importPartyHub);

const importAcceptPartyInvite = () => import("@/pages/AcceptPartyInvitePage");
export const AcceptPartyInvitePage = lazyWithReload(importAcceptPartyInvite);

const importEventAlbum = () => import("@/pages/EventAlbumPage");
export const EventAlbumPage = lazyWithReload(importEventAlbum);

const importSupport = () => import("@/pages/SupportPage");
export const SupportPage = lazyWithReload(importSupport);

// ---------------- Vendor ----------------
const importVendorDashboard = () => import("@/pages/vendor/VendorDashboard");
export const VendorDashboard = lazyWithReload(importVendorDashboard);

const importVendorHome = () => import("@/pages/vendor/VendorHomePage");
export const VendorHomePage = lazyWithReload(importVendorHome);

const importVendorProfile = () => import("@/pages/vendor/VendorProfilePage");
export const VendorProfilePage = lazyWithReload(importVendorProfile);

const importVendorInbox = () => import("@/pages/vendor/VendorInboxPage");
export const VendorInboxPage = lazyWithReload(importVendorInbox);

const importVendorTeam = () => import("@/pages/vendor/VendorTeamPage");
export const VendorTeamPage = lazyWithReload(importVendorTeam);

const importVendorAppointments = () => import("@/pages/vendor/VendorAppointmentsPage");
export const VendorAppointmentsPage = lazyWithReload(importVendorAppointments);

const importVendorOnboarding = () => import("@/pages/vendor/VendorOnboardingPage");
export const VendorOnboardingPage = lazyWithReload(importVendorOnboarding);

const importVendorAnalytics = () => import("@/pages/vendor/VendorAnalyticsPage");
export const VendorAnalyticsPage = lazyWithReload(importVendorAnalytics);

const importVendorMessages = () => import("@/pages/vendor/VendorMessagesPage");
export const VendorMessagesPage = lazyWithReload(importVendorMessages);

const importVendorPartners = () => import("@/pages/vendor/VendorPartnersPage");
export const VendorPartnersPage = lazyWithReload(importVendorPartners);

const importVendorAiAgent = () => import("@/pages/vendor/VendorAiAgentPage");
export const VendorAiAgentPage = lazyWithReload(importVendorAiAgent);

const importVendorStudio = () => import("@/pages/vendor/VendorStudioPage");
export const VendorStudioPage = lazyWithReload(importVendorStudio);

const importInquiryDetail = () => import("@/pages/vendor/InquiryDetailPage");
export const InquiryDetailPage = lazyWithReload(importInquiryDetail);

const importAvailability = () => import("@/pages/vendor/AvailabilityPage");
export const AvailabilityPage = lazyWithReload(importAvailability);
// ---------------- path → importer registry ----------------
// Order matters for matchPath — more specific patterns first. Static
// strings are tried before dynamic ones via Map insertion order.
const ROUTE_IMPORTERS: Array<{ pattern: string; importer: () => Promise<unknown> }> = [
  // Static public
  { pattern: "/vendors", importer: importVendorBrowse },
  { pattern: "/vendors/locations", importer: importVendorLocations },
  { pattern: "/vendors/map", importer: importVendorMap },
  { pattern: "/privacy", importer: importPrivacy },
  { pattern: "/terms", importer: importTerms },
  { pattern: "/changelog", importer: importChangelog },
  { pattern: "/status", importer: importStatus },
  { pattern: "/press", importer: importPress },
  { pattern: "/settings", importer: importSettings },
  { pattern: "/vendor-apply", importer: importVendorApply },
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
  { pattern: "/rsvp/:token", importer: importRsvp },
  { pattern: "/board/:token", importer: importMoodBoardShare },
  { pattern: "/gift/:token", importer: importGiftShare },
  { pattern: "/real-events", importer: importRealEvents },
  { pattern: "/real-events/:slug", importer: importRealEventDetail },
  { pattern: "/accept-team-invite/:token", importer: importAcceptTeamInvite },
  { pattern: "/accept-planning-invite/:token", importer: importAcceptPlanningInvite },
  // Customer
  { pattern: "/customer/dashboard", importer: importCustomerDashboard },
  { pattern: "/customer/vendors", importer: importCustomerVendorsBrowse },
  { pattern: "/customer/onboarding", importer: importOnboarding },
  { pattern: "/customer/inquiries", importer: importInquiries },
  { pattern: "/customer/inquiries/:inquiryId", importer: importHostInquiryDetail },
  { pattern: "/customer/event", importer: importEventDetails },
  { pattern: "/customer/guests", importer: importGuests },
  { pattern: "/customer/seating", importer: importSeatingChart },
  { pattern: "/customer/timeline", importer: importEventTimeline },
  { pattern: "/customer/planning-team", importer: importPlanningTeam },
  { pattern: "/customer/registry", importer: importRegistry },
  { pattern: "/customer/messages", importer: importMessages },
  { pattern: "/customer/inquiry-blast", importer: importInquiryBlast },
  { pattern: "/customer/live", importer: importLiveDay },
  { pattern: "/customer/gifts", importer: importGiftWishes },
  { pattern: "/customer/microsite", importer: importMicrositeEditor },
  { pattern: "/planner", importer: importPlannerWorkspace },
  { pattern: "/party", importer: importPartyHub },
  { pattern: "/party/:eventId", importer: importPartyHub },
  { pattern: "/accept-party-invite/:token", importer: importAcceptPartyInvite },
  { pattern: "/e/:token", importer: importEventMicrosite },
  { pattern: "/album/:token", importer: importEventAlbum },
  { pattern: "/support", importer: importSupport },
  { pattern: "/customer/appointments", importer: importAppointments },
  { pattern: "/customer/favorites", importer: importFavorites },
  { pattern: "/customer/saved-searches", importer: importSavedSearches },
  { pattern: "/customer/checklist", importer: importChecklist },
  { pattern: "/customer/tasks", importer: importTasks },
  { pattern: "/customer/payments", importer: importPayments },
  { pattern: "/customer/invitations", importer: importInvitationBuilder },
  { pattern: "/customer/moodboards", importer: importMoodBoards },
  { pattern: "/customer/moodboards/:id", importer: importMoodBoardDetail },
  // Vendor
  { pattern: "/vendor/dashboard", importer: importVendorDashboard },
  { pattern: "/vendor/home", importer: importVendorHome },
  { pattern: "/vendor/profile", importer: importVendorProfile },
  { pattern: "/vendor/listing", importer: importVendorProfile },
  { pattern: "/vendor/inbox", importer: importVendorInbox },
  { pattern: "/vendor/team", importer: importVendorTeam },
  { pattern: "/vendor/onboarding", importer: importVendorOnboarding },
  { pattern: "/vendor/analytics", importer: importVendorAnalytics },
  { pattern: "/vendor/appointments", importer: importVendorAppointments },
  // Availability lives on the same page as Appointments now (merged
  // Calendar dashboard); both URLs resolve to the same chunk.
  { pattern: "/vendor/availability", importer: importVendorAppointments },
  { pattern: "/vendor/payments", importer: importComingSoon },
  { pattern: "/vendor/messages", importer: importVendorMessages },
  { pattern: "/vendor/partners", importer: importVendorPartners },
  { pattern: "/vendor/ai-agent", importer: importVendorAiAgent },
  { pattern: "/vendor/studio", importer: importVendorStudio },
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
