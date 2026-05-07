import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import LoginRoleChooserPage from "./pages/auth/LoginRoleChooserPage";
import SignupPage from "./pages/auth/SignupPage";
import SignupRoleChooserPage from "./pages/auth/SignupRoleChooserPage";
import CheckEmailPage from "./pages/auth/CheckEmailPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import { AuthProvider } from "./hooks/useAuth";
import { RealtimeProvider } from "./lib/realtime";
import { ThemeProvider } from "./hooks/useTheme";
import { RequireRole } from "./components/auth/RequireRole";
import { CommandPaletteLauncher } from "./components/CommandPaletteLauncher";
import { SkipLink } from "./components/SkipLink";
import { EmailVerificationBanner } from "./components/auth/EmailVerificationBanner";
import { MobilePortalBell } from "./components/notifications/MobilePortalBell";

// Both ship-on-mount components are lazy: CookieBanner only renders
// once for users who haven't accepted, OnboardingTour only renders for
// fresh users — most page loads see neither, so deferring the chunks
// shaves the initial JS budget.
const CookieBanner = lazy(() =>
  import("./components/CookieBanner").then((m) => ({ default: m.CookieBanner })),
);
const OnboardingTour = lazy(() =>
  import("@/components/shared/OnboardingTour").then((m) => ({
    default: m.OnboardingTour,
  })),
);
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { RouteFallback } from "@/components/shared/RouteFallback";
// All lazy-loaded pages live in @/router/lazyRoutes — keeps the lazy
// factories paired with a path → importer registry that PrefetchLink
// uses to warm chunks on hover/visibility.
import {
  VendorBrowsePage,
  CompareVendorsPage,
  VendorLocationsPage,
  VendorCityPage,
  VendorCityCategoryPage,
  VendorEventTypeCityPage,
  VendorMapPage,
  VendorDetailPage,
  VendorCategoryPage,
  PrivacyPage,
  TermsPage,
  ChangelogPage,
  StatusPage,
  PressPage,
  SettingsPage,
  VendorApplyPage,
  VendorApplyThanksPage,
  NotFound,
  ComingSoonPage,
  CustomerDashboard,
  CustomerVendorsBrowsePage,
  OnboardingPage,
  InquiriesPage,
  HostInquiryDetailPage,
  FavoritesPage,
  EventDetailsPage,
  GuestsPage,
  RsvpPage,
  ChecklistPage,
  TasksPage,
  PaymentsPage,
  InvitationBuilder,
  MoodBoardsPage,
  MoodBoardDetailPage,
  MoodBoardSharePage,
  AppointmentsPage,
  SavedSearchesPage,
  SeatingChartPage,
  EventTimelinePage,
  PlanningTeamPage,
  RegistryPage,
  MessagesPage,
  InquiryBlastPage,
  LiveDayPage,
  GiftWishesPage,
  GiftSharePage,
  MicrositeEditorPage,
  EventMicrositePage,
  PlannerWorkspacePage,
  PartyHubPage,
  AcceptPartyInvitePage,
  EventAlbumPage,
  SupportPage,
  RealEventsPage,
  RealEventDetailPage,
  AcceptPlanningInvitePage,
  VendorDashboard,
  VendorProfilePage,
  VendorInboxPage,
  VendorTeamPage,
  VendorAppointmentsPage,
  VendorOnboardingPage,
  VendorMessagesPage,
  VendorPartnersPage,
  VendorAiAgentPage,
  VendorStudioPage,
  InquiryDetailPage,
  AcceptTeamInvitePage,
  EditorialArticlePage,
  ClaimVendorPage,
  PublicReviewPage,
  ProposalPrintPage,
  PublicProposalPage,
  PlanInFivePage,
  VendorBlogPage,
} from "@/router/lazyRoutes";

const App = () => (
  <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RealtimeProvider>
          <SkipLink />
          <EmailVerificationBanner />
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/vendors" element={<VendorBrowsePage />} />
              <Route path="/compare" element={<CompareVendorsPage />} />
              <Route path="/vendors/locations" element={<VendorLocationsPage />} />
              <Route path="/vendors/in/:citySlug" element={<VendorCityPage />} />
              <Route path="/vendors/map" element={<VendorMapPage />} />
              <Route path="/vendors/category/:slug" element={<VendorCategoryPage />} />
              {/* Programmatic SEO: city × category cross-product. */}
              <Route
                path="/vendors/:categorySlug/in/:citySlug"
                element={<VendorCityCategoryPage />}
              />
              {/* Programmatic SEO: event-type × city. Multi-event play. */}
              <Route
                path="/:eventTypeSlug-vendors/:citySlug"
                element={<VendorEventTypeCityPage />}
              />
              <Route path="/vendors/:id" element={<VendorDetailPage />} />
              <Route path="/v/:slug" element={<VendorDetailPage />} />
              {/* Editorial article reader (long-form CMS guides). */}
              <Route path="/guides/:slug" element={<EditorialArticlePage />} />
              {/* Vendor claim-listing flow — public, auth-gated to claim. */}
              <Route path="/claim/:token" element={<ClaimVendorPage />} />
              {/* Plan-in-5 wizard — 6-question conversion lever. */}
              <Route path="/plan-in-5" element={<PlanInFivePage />} />
              <Route path="/real-events" element={<RealEventsPage />} />
              <Route path="/real-events/:slug" element={<RealEventDetailPage />} />
              <Route path="/rsvp/:token" element={<RsvpPage />} />
              <Route path="/review/:token" element={<PublicReviewPage />} />
              <Route path="/proposals/:id/print" element={<ProposalPrintPage />} />
              <Route path="/p/:token" element={<PublicProposalPage />} />
              <Route path="/board/:token" element={<MoodBoardSharePage />} />
              <Route path="/accept-team-invite/:token" element={<AcceptTeamInvitePage />} />
              <Route path="/accept-planning-invite/:token" element={<AcceptPlanningInvitePage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/press" element={<PressPage />} />
              <Route path="/vendor-apply" element={<VendorApplyPage />} />
              <Route path="/vendor-apply/thanks" element={<VendorApplyThanksPage />} />
              <Route path="/login" element={<LoginRoleChooserPage />} />
              <Route path="/login/host" element={<LoginPage role="host" />} />
              <Route path="/login/vendor" element={<LoginPage role="vendor" />} />
              <Route path="/signup" element={<SignupRoleChooserPage />} />
              <Route path="/signup/host" element={<SignupPage />} />
              <Route path="/check-email" element={<CheckEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/settings" element={<RequireRole role={["host", "vendor"]}><SettingsPage /></RequireRole>} />

              {/* Customer */}
              <Route path="/customer/dashboard" element={<RequireRole role="host"><CustomerDashboard /></RequireRole>} />
              <Route path="/customer/vendors" element={<RequireRole role="host"><CustomerVendorsBrowsePage /></RequireRole>} />
              <Route path="/customer/onboarding" element={<RequireRole role="host"><OnboardingPage /></RequireRole>} />
              <Route path="/customer/inquiries" element={<RequireRole role="host"><InquiriesPage /></RequireRole>} />
              <Route path="/customer/inquiries/:inquiryId" element={<RequireRole role="host"><HostInquiryDetailPage /></RequireRole>} />
              <Route path="/customer/event" element={<RequireRole role="host"><EventDetailsPage /></RequireRole>} />
              <Route path="/customer/guests" element={<RequireRole role="host"><GuestsPage /></RequireRole>} />
              <Route path="/customer/seating" element={<RequireRole role="host"><SeatingChartPage /></RequireRole>} />
              <Route path="/customer/timeline" element={<RequireRole role="host"><EventTimelinePage /></RequireRole>} />
              <Route path="/customer/planning-team" element={<RequireRole role="host"><PlanningTeamPage /></RequireRole>} />
              <Route path="/customer/registry" element={<RequireRole role="host"><RegistryPage /></RequireRole>} />
              <Route path="/customer/messages" element={<RequireRole role="host"><MessagesPage /></RequireRole>} />
              <Route path="/customer/inquiry-blast" element={<RequireRole role="host"><InquiryBlastPage /></RequireRole>} />
              <Route path="/customer/live" element={<RequireRole role="host"><LiveDayPage /></RequireRole>} />
              <Route path="/customer/gifts" element={<RequireRole role="host"><GiftWishesPage /></RequireRole>} />
              <Route path="/customer/microsite" element={<RequireRole role="host"><MicrositeEditorPage /></RequireRole>} />
              <Route path="/planner" element={<RequireRole role={["host", "vendor"]}><PlannerWorkspacePage /></RequireRole>} />
              <Route path="/party" element={<RequireRole role={["host", "vendor"]}><PartyHubPage /></RequireRole>} />
              <Route path="/party/:eventId" element={<RequireRole role={["host", "vendor"]}><PartyHubPage /></RequireRole>} />
              <Route path="/accept-party-invite/:token" element={<AcceptPartyInvitePage />} />
              <Route path="/gift/:token" element={<GiftSharePage />} />
              <Route path="/e/:token" element={<EventMicrositePage />} />
              <Route path="/album/:token" element={<EventAlbumPage />} />
              <Route path="/support" element={<RequireRole role={["host", "vendor"]}><SupportPage /></RequireRole>} />
              <Route path="/customer/appointments" element={<RequireRole role="host"><AppointmentsPage /></RequireRole>} />
              <Route path="/customer/favorites" element={<RequireRole role="host"><FavoritesPage /></RequireRole>} />
              <Route path="/customer/saved-searches" element={<RequireRole role="host"><SavedSearchesPage /></RequireRole>} />
              <Route path="/customer/checklist" element={<RequireRole role="host"><ChecklistPage /></RequireRole>} />
              <Route path="/customer/tasks" element={<RequireRole role="host"><TasksPage /></RequireRole>} />
              <Route path="/customer/payments" element={<RequireRole role="host"><PaymentsPage /></RequireRole>} />
              <Route path="/customer/invitations" element={<RequireRole role="host"><InvitationBuilder /></RequireRole>} />
              <Route path="/customer/moodboards" element={<RequireRole role="host"><MoodBoardsPage /></RequireRole>} />
              <Route path="/customer/moodboards/:id" element={<RequireRole role="host"><MoodBoardDetailPage /></RequireRole>} />

              {/* Vendor */}
              <Route path="/vendor/dashboard" element={<RequireRole role="vendor"><VendorDashboard /></RequireRole>} />
              <Route path="/vendor/profile" element={<Navigate to="/vendor/listing" replace />} />
              <Route path="/vendor/listing" element={<RequireRole role="vendor"><VendorProfilePage /></RequireRole>} />
              <Route path="/vendor/inbox" element={<RequireRole role="vendor"><VendorInboxPage /></RequireRole>} />
              <Route path="/vendor/team" element={<RequireRole role="vendor"><VendorTeamPage /></RequireRole>} />
              <Route path="/vendor/onboarding" element={<RequireRole role="vendor"><VendorOnboardingPage /></RequireRole>} />
              {/* Analytics tab merged into Dashboard — keep the URL
                  alive as a redirect so any old bookmarks / emails
                  still work. */}
              <Route path="/vendor/analytics" element={<Navigate to="/vendor/dashboard" replace />} />
              <Route path="/vendor/appointments" element={<RequireRole role="vendor"><VendorAppointmentsPage /></RequireRole>} />
              <Route path="/vendor/availability" element={<RequireRole role="vendor"><VendorAppointmentsPage /></RequireRole>} />
              <Route path="/vendor/payments" element={<RequireRole role="vendor"><ComingSoonPage side="vendor" description="Connect a Stripe account, see payouts, and track the 3% commission on confirmed bookings." /></RequireRole>} />
              <Route path="/vendor/blog" element={<RequireRole role="vendor"><VendorBlogPage /></RequireRole>} />
              <Route path="/vendor/messages" element={<RequireRole role="vendor"><VendorMessagesPage /></RequireRole>} />
              <Route path="/vendor/partners" element={<RequireRole role="vendor"><VendorPartnersPage /></RequireRole>} />
              <Route path="/vendor/ai-agent" element={<RequireRole role="vendor"><VendorAiAgentPage /></RequireRole>} />
              <Route path="/vendor/studio" element={<RequireRole role="vendor"><VendorStudioPage /></RequireRole>} />
              <Route path="/vendor/inbox/:inquiryId" element={<RequireRole role="vendor"><InquiryDetailPage /></RequireRole>} />


              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
          <MobilePortalBell />
          <Suspense fallback={null}>
            <OnboardingTour />
          </Suspense>
          <CommandPaletteLauncher />
          <Suspense fallback={null}>
            <CookieBanner />
          </Suspense>
          </RealtimeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
