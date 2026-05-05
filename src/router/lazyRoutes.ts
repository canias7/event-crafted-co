import { lazy } from "react";
import { matchPath } from "react-router-dom";

// Centralized lazy-route registry. Keeping the import factory and the
// lazy-wrapped component side-by-side lets PrefetchLink warm the chunk
// on hover/visibility before the user actually clicks.
//
// To add a new route:
//   1. Add `const importFoo = () => import("@/pages/Foo")` then
//      `export const FooPage = lazy(importFoo)` below.
//   2. Add the path → importer entry to ROUTE_IMPORTERS at the bottom.
//
// Static routes match exactly; dynamic routes use react-router-dom's
// matchPath (so `/vendors/:id` matches `/vendors/abc-123`).

// ---------------- Public ----------------
const importHowItWorks = () => import("@/pages/HowItWorksPage");
export const HowItWorksPage = lazy(importHowItWorks);

const importVendorBrowse = () => import("@/pages/VendorBrowsePage");
export const VendorBrowsePage = lazy(importVendorBrowse);

const importCompareVendors = () => import("@/pages/CompareVendorsPage");
export const CompareVendorsPage = lazy(importCompareVendors);

const importStaffing = () => import("@/pages/StaffingPage");
export const StaffingPage = lazy(importStaffing);

const importVendorLocations = () => import("@/pages/VendorLocationsPage");
export const VendorLocationsPage = lazy(importVendorLocations);

const importVendorCity = () => import("@/pages/VendorCityPage");
export const VendorCityPage = lazy(importVendorCity);

const importVendorCityCategory = () => import("@/pages/VendorCityCategoryPage");
export const VendorCityCategoryPage = lazy(importVendorCityCategory);

const importVendorEventTypeCity = () =>
  import("@/pages/VendorEventTypeCityPage");
export const VendorEventTypeCityPage = lazy(importVendorEventTypeCity);

const importEditorialArticle = () => import("@/pages/EditorialArticlePage");
export const EditorialArticlePage = lazy(importEditorialArticle);

const importAdminEditorial = () => import("@/pages/admin/AdminEditorialPage");
export const AdminEditorialPage = lazy(importAdminEditorial);

const importClaimVendor = () => import("@/pages/ClaimVendorPage");
export const ClaimVendorPage = lazy(importClaimVendor);

const importAdminClaims = () => import("@/pages/admin/AdminClaimsPage");
export const AdminClaimsPage = lazy(importAdminClaims);

const importAdminReports = () => import("@/pages/admin/AdminReportsPage");
export const AdminReportsPage = lazy(importAdminReports);

const importPublicReview = () => import("@/pages/PublicReviewPage");
export const PublicReviewPage = lazy(importPublicReview);

const importProposalPrint = () => import("@/pages/ProposalPrintPage");
export const ProposalPrintPage = lazy(importProposalPrint);

const importPublicProposal = () => import("@/pages/PublicProposalPage");
export const PublicProposalPage = lazy(importPublicProposal);

const importPlanInFive = () => import("@/pages/PlanInFivePage");
export const PlanInFivePage = lazy(importPlanInFive);

const importVendorBlog = () => import("@/pages/vendor/VendorBlogPage");
export const VendorBlogPage = lazy(importVendorBlog);

const importVendorMap = () => import("@/pages/VendorMapPage");
export const VendorMapPage = lazy(importVendorMap);

const importVendorQuiz = () => import("@/pages/VendorQuizPage");
export const VendorQuizPage = lazy(importVendorQuiz);

const importVendorDetail = () => import("@/pages/VendorDetailPage");
export const VendorDetailPage = lazy(importVendorDetail);

const importVendorCategory = () => import("@/pages/VendorCategoryPage");
export const VendorCategoryPage = lazy(importVendorCategory);

const importInspiration = () => import("@/pages/InspirationPage");
export const InspirationPage = lazy(importInspiration);

const importInspirationDetail = () => import("@/pages/InspirationDetailPage");
export const InspirationDetailPage = lazy(importInspirationDetail);

const importPrivacy = () => import("@/pages/PrivacyPage");
export const PrivacyPage = lazy(importPrivacy);

const importTerms = () => import("@/pages/TermsPage");
export const TermsPage = lazy(importTerms);

const importChangelog = () => import("@/pages/ChangelogPage");
export const ChangelogPage = lazy(importChangelog);

const importStatus = () => import("@/pages/StatusPage");
export const StatusPage = lazy(importStatus);

const importPress = () => import("@/pages/PressPage");
export const PressPage = lazy(importPress);

const importSettings = () => import("@/pages/SettingsPage");
export const SettingsPage = lazy(importSettings);

const importVendorApply = () => import("@/pages/VendorApplyPage");
export const VendorApplyPage = lazy(importVendorApply);

const importNotFound = () => import("@/pages/NotFound");
export const NotFound = lazy(importNotFound);

const importComingSoon = () => import("@/pages/ComingSoonPage");
export const ComingSoonPage = lazy(importComingSoon);

const importRsvp = () => import("@/pages/RsvpPage");
export const RsvpPage = lazy(importRsvp);

const importMoodBoardShare = () => import("@/pages/MoodBoardSharePage");
export const MoodBoardSharePage = lazy(importMoodBoardShare);

const importGiftShare = () => import("@/pages/GiftSharePage");
export const GiftSharePage = lazy(importGiftShare);

const importRealEvents = () => import("@/pages/RealEventsPage");
export const RealEventsPage = lazy(importRealEvents);

const importRealEventDetail = () => import("@/pages/RealEventDetailPage");
export const RealEventDetailPage = lazy(importRealEventDetail);

const importAcceptPlanningInvite = () => import("@/pages/AcceptPlanningInvitePage");
export const AcceptPlanningInvitePage = lazy(importAcceptPlanningInvite);

const importAcceptTeamInvite = () => import("@/pages/AcceptTeamInvitePage");
export const AcceptTeamInvitePage = lazy(importAcceptTeamInvite);

// ---------------- Customer (host) ----------------
const importCustomerDashboard = () => import("@/pages/customer/CustomerDashboard");
export const CustomerDashboard = lazy(importCustomerDashboard);

const importCustomerVendorsBrowse = () => import("@/pages/customer/VendorsBrowsePage");
export const CustomerVendorsBrowsePage = lazy(importCustomerVendorsBrowse);

const importOnboarding = () => import("@/pages/customer/OnboardingPage");
export const OnboardingPage = lazy(importOnboarding);

const importInquiries = () => import("@/pages/customer/InquiriesPage");
export const InquiriesPage = lazy(importInquiries);

const importHostInquiryDetail = () => import("@/pages/customer/HostInquiryDetailPage");
export const HostInquiryDetailPage = lazy(importHostInquiryDetail);

const importFavorites = () => import("@/pages/customer/FavoritesPage");
export const FavoritesPage = lazy(importFavorites);

const importEventDetails = () => import("@/pages/customer/EventDetailsPage");
export const EventDetailsPage = lazy(importEventDetails);

const importGuests = () => import("@/pages/customer/GuestsPage");
export const GuestsPage = lazy(importGuests);

const importChecklist = () => import("@/pages/customer/ChecklistPage");
export const ChecklistPage = lazy(importChecklist);

const importTasks = () => import("@/pages/customer/TasksPage");
export const TasksPage = lazy(importTasks);

const importPayments = () => import("@/pages/customer/PaymentsPage");
export const PaymentsPage = lazy(importPayments);

const importInvitationBuilder = () => import("@/pages/customer/InvitationBuilder");
export const InvitationBuilder = lazy(importInvitationBuilder);

const importMoodBoards = () => import("@/pages/customer/MoodBoardsPage");
export const MoodBoardsPage = lazy(importMoodBoards);

const importMoodBoardDetail = () => import("@/pages/customer/MoodBoardDetailPage");
export const MoodBoardDetailPage = lazy(importMoodBoardDetail);

const importAppointments = () => import("@/pages/customer/AppointmentsPage");
export const AppointmentsPage = lazy(importAppointments);

const importSavedSearches = () => import("@/pages/customer/SavedSearchesPage");
export const SavedSearchesPage = lazy(importSavedSearches);

const importSeatingChart = () => import("@/pages/customer/SeatingChartPage");
export const SeatingChartPage = lazy(importSeatingChart);

const importEventTimeline = () => import("@/pages/customer/EventTimelinePage");
export const EventTimelinePage = lazy(importEventTimeline);

const importPlanningTeam = () => import("@/pages/customer/PlanningTeamPage");
export const PlanningTeamPage = lazy(importPlanningTeam);

const importRegistry = () => import("@/pages/customer/RegistryPage");
export const RegistryPage = lazy(importRegistry);

const importMessages = () => import("@/pages/customer/MessagesPage");
export const MessagesPage = lazy(importMessages);

const importInquiryBlast = () => import("@/pages/customer/InquiryBlastPage");
export const InquiryBlastPage = lazy(importInquiryBlast);

const importLiveDay = () => import("@/pages/customer/LiveDayPage");
export const LiveDayPage = lazy(importLiveDay);

const importGiftWishes = () => import("@/pages/customer/GiftWishesPage");
export const GiftWishesPage = lazy(importGiftWishes);

const importMicrositeEditor = () => import("@/pages/customer/MicrositeEditorPage");
export const MicrositeEditorPage = lazy(importMicrositeEditor);

const importEventMicrosite = () => import("@/pages/EventMicrositePage");
export const EventMicrositePage = lazy(importEventMicrosite);

const importPlannerWorkspace = () => import("@/pages/customer/PlannerWorkspacePage");
export const PlannerWorkspacePage = lazy(importPlannerWorkspace);

const importPartyHub = () => import("@/pages/PartyHubPage");
export const PartyHubPage = lazy(importPartyHub);

const importAcceptPartyInvite = () => import("@/pages/AcceptPartyInvitePage");
export const AcceptPartyInvitePage = lazy(importAcceptPartyInvite);

const importEventAlbum = () => import("@/pages/EventAlbumPage");
export const EventAlbumPage = lazy(importEventAlbum);

const importSupport = () => import("@/pages/SupportPage");
export const SupportPage = lazy(importSupport);

const importAdminSupport = () => import("@/pages/admin/AdminSupportPage");
export const AdminSupportPage = lazy(importAdminSupport);

const importAdminAudit = () => import("@/pages/admin/AdminAuditPage");
export const AdminAuditPage = lazy(importAdminAudit);

const importAdminEmail = () => import("@/pages/admin/AdminEmailDeliverabilityPage");
export const AdminEmailDeliverabilityPage = lazy(importAdminEmail);

// ---------------- Vendor ----------------
const importVendorDashboard = () => import("@/pages/vendor/VendorDashboard");
export const VendorDashboard = lazy(importVendorDashboard);

const importVendorProfile = () => import("@/pages/vendor/VendorProfilePage");
export const VendorProfilePage = lazy(importVendorProfile);

const importVendorTemplates = () => import("@/pages/vendor/VendorTemplatesPage");
export const VendorTemplatesPage = lazy(importVendorTemplates);

const importVendorInbox = () => import("@/pages/vendor/VendorInboxPage");
export const VendorInboxPage = lazy(importVendorInbox);

const importVendorTeam = () => import("@/pages/vendor/VendorTeamPage");
export const VendorTeamPage = lazy(importVendorTeam);

const importVendorAppointments = () => import("@/pages/vendor/VendorAppointmentsPage");
export const VendorAppointmentsPage = lazy(importVendorAppointments);

const importVendorOnboarding = () => import("@/pages/vendor/VendorOnboardingPage");
export const VendorOnboardingPage = lazy(importVendorOnboarding);

const importVendorAnalytics = () => import("@/pages/vendor/VendorAnalyticsPage");
export const VendorAnalyticsPage = lazy(importVendorAnalytics);

const importVendorContracts = () => import("@/pages/vendor/VendorContractsPage");
export const VendorContractsPage = lazy(importVendorContracts);

const importVendorMessages = () => import("@/pages/vendor/VendorMessagesPage");
export const VendorMessagesPage = lazy(importVendorMessages);

const importVendorPartners = () => import("@/pages/vendor/VendorPartnersPage");
export const VendorPartnersPage = lazy(importVendorPartners);

const importInquiryDetail = () => import("@/pages/vendor/InquiryDetailPage");
export const InquiryDetailPage = lazy(importInquiryDetail);

const importAvailability = () => import("@/pages/vendor/AvailabilityPage");
export const AvailabilityPage = lazy(importAvailability);

// ---------------- Admin ----------------
const importAdminDashboard = () => import("@/pages/admin/AdminDashboard");
export const AdminDashboard = lazy(importAdminDashboard);

const importAdminVendors = () => import("@/pages/admin/AdminVendorsPage");
export const AdminVendorsPage = lazy(importAdminVendors);

const importAdminReviews = () => import("@/pages/admin/AdminReviewsPage");
export const AdminReviewsPage = lazy(importAdminReviews);

const importAdminInquiries = () => import("@/pages/admin/AdminInquiriesPage");
export const AdminInquiriesPage = lazy(importAdminInquiries);

const importAdminInspiration = () => import("@/pages/admin/AdminInspirationPage");
export const AdminInspirationPage = lazy(importAdminInspiration);

const importAdminVerifications = () => import("@/pages/admin/AdminVerificationsPage");
export const AdminVerificationsPage = lazy(importAdminVerifications);

// ---------------- path → importer registry ----------------
// Order matters for matchPath — more specific patterns first. Static
// strings are tried before dynamic ones via Map insertion order.
const ROUTE_IMPORTERS: Array<{ pattern: string; importer: () => Promise<unknown> }> = [
  // Static public
  { pattern: "/how-it-works", importer: importHowItWorks },
  { pattern: "/vendors", importer: importVendorBrowse },
  { pattern: "/staffing", importer: importStaffing },
  { pattern: "/vendors/locations", importer: importVendorLocations },
  { pattern: "/vendors/map", importer: importVendorMap },
  { pattern: "/vendors/quiz", importer: importVendorQuiz },
  { pattern: "/inspiration", importer: importInspiration },
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
  { pattern: "/inspiration/:slug", importer: importInspirationDetail },
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
  { pattern: "/admin/support", importer: importAdminSupport },
  { pattern: "/admin/audit", importer: importAdminAudit },
  { pattern: "/admin/email-deliverability", importer: importAdminEmail },
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
  { pattern: "/vendor/profile", importer: importVendorProfile },
  { pattern: "/vendor/templates", importer: importVendorTemplates },
  { pattern: "/vendor/inbox", importer: importVendorInbox },
  { pattern: "/vendor/team", importer: importVendorTeam },
  { pattern: "/vendor/onboarding", importer: importVendorOnboarding },
  { pattern: "/vendor/analytics", importer: importVendorAnalytics },
  { pattern: "/vendor/appointments", importer: importVendorAppointments },
  { pattern: "/vendor/availability", importer: importAvailability },
  { pattern: "/vendor/payments", importer: importComingSoon },
  { pattern: "/vendor/contracts", importer: importVendorContracts },
  { pattern: "/vendor/messages", importer: importVendorMessages },
  { pattern: "/vendor/partners", importer: importVendorPartners },
  { pattern: "/vendor/inbox/:inquiryId", importer: importInquiryDetail },
  // Admin
  { pattern: "/admin/dashboard", importer: importAdminDashboard },
  { pattern: "/admin/vendors", importer: importAdminVendors },
  { pattern: "/admin/inquiries", importer: importAdminInquiries },
  { pattern: "/admin/reviews", importer: importAdminReviews },
  { pattern: "/admin/inspiration", importer: importAdminInspiration },
  { pattern: "/admin/verifications", importer: importAdminVerifications },
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
