import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import CheckEmailPage from "./pages/auth/CheckEmailPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import { AuthProvider } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import { RequireRole } from "./components/auth/RequireRole";
import { CookieBanner } from "./components/CookieBanner";
import { CommandPalette } from "./components/CommandPalette";
import { SkipLink } from "./components/SkipLink";
import { MobilePortalBell } from "./components/notifications/MobilePortalBell";
import { OnboardingTour } from "@/components/shared/OnboardingTour";
import { RouteFallback } from "@/components/shared/RouteFallback";
// All lazy-loaded pages live in @/router/lazyRoutes — keeps the lazy
// factories paired with a path → importer registry that PrefetchLink
// uses to warm chunks on hover/visibility.
import {
  HowItWorksPage,
  VendorBrowsePage,
  StaffingPage,
  VendorLocationsPage,
  VendorCityPage,
  VendorMapPage,
  VendorQuizPage,
  VendorDetailPage,
  VendorCategoryPage,
  InspirationPage,
  InspirationDetailPage,
  PrivacyPage,
  TermsPage,
  ChangelogPage,
  StatusPage,
  PressPage,
  SettingsPage,
  VendorApplyPage,
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
  AdminSupportPage,
  AdminAuditPage,
  AdminEmailDeliverabilityPage,
  RealEventsPage,
  RealEventDetailPage,
  AcceptPlanningInvitePage,
  VendorDashboard,
  VendorProfilePage,
  VendorTemplatesPage,
  VendorInboxPage,
  VendorTeamPage,
  VendorAppointmentsPage,
  VendorOnboardingPage,
  VendorAnalyticsPage,
  VendorContractsPage,
  VendorMessagesPage,
  VendorPartnersPage,
  InquiryDetailPage,
  AvailabilityPage,
  AcceptTeamInvitePage,
  AdminDashboard,
  AdminVendorsPage,
  AdminReviewsPage,
  AdminInquiriesPage,
  AdminInspirationPage,
  AdminVerificationsPage,
} from "@/router/lazyRoutes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SkipLink />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/vendors" element={<VendorBrowsePage />} />
              <Route path="/vendors/locations" element={<VendorLocationsPage />} />
              <Route path="/staffing" element={<StaffingPage />} />
              <Route path="/vendors/in/:citySlug" element={<VendorCityPage />} />
              <Route path="/vendors/map" element={<VendorMapPage />} />
              <Route path="/vendors/quiz" element={<VendorQuizPage />} />
              <Route path="/vendors/category/:slug" element={<VendorCategoryPage />} />
              <Route path="/vendors/:id" element={<VendorDetailPage />} />
              <Route path="/v/:slug" element={<VendorDetailPage />} />
              <Route path="/inspiration" element={<InspirationPage />} />
              <Route path="/inspiration/:slug" element={<InspirationDetailPage />} />
              <Route path="/real-events" element={<RealEventsPage />} />
              <Route path="/real-events/:slug" element={<RealEventDetailPage />} />
              <Route path="/rsvp/:token" element={<RsvpPage />} />
              <Route path="/board/:token" element={<MoodBoardSharePage />} />
              <Route path="/accept-team-invite/:token" element={<AcceptTeamInvitePage />} />
              <Route path="/accept-planning-invite/:token" element={<AcceptPlanningInvitePage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/press" element={<PressPage />} />
              <Route path="/vendor-apply" element={<VendorApplyPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/check-email" element={<CheckEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/settings" element={<RequireRole role={["host", "vendor", "admin"]}><SettingsPage /></RequireRole>} />

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
              <Route path="/party" element={<RequireRole role={["host", "vendor", "admin"]}><PartyHubPage /></RequireRole>} />
              <Route path="/party/:eventId" element={<RequireRole role={["host", "vendor", "admin"]}><PartyHubPage /></RequireRole>} />
              <Route path="/accept-party-invite/:token" element={<AcceptPartyInvitePage />} />
              <Route path="/gift/:token" element={<GiftSharePage />} />
              <Route path="/e/:token" element={<EventMicrositePage />} />
              <Route path="/album/:token" element={<EventAlbumPage />} />
              <Route path="/support" element={<RequireRole role={["host", "vendor", "admin"]}><SupportPage /></RequireRole>} />
              <Route path="/admin/support" element={<RequireRole role="admin"><AdminSupportPage /></RequireRole>} />
              <Route path="/admin/audit" element={<RequireRole role="admin"><AdminAuditPage /></RequireRole>} />
              <Route path="/admin/email-deliverability" element={<RequireRole role="admin"><AdminEmailDeliverabilityPage /></RequireRole>} />
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
              <Route path="/vendor/profile" element={<RequireRole role="vendor"><VendorProfilePage /></RequireRole>} />
              <Route path="/vendor/templates" element={<RequireRole role="vendor"><VendorTemplatesPage /></RequireRole>} />
              <Route path="/vendor/inbox" element={<RequireRole role="vendor"><VendorInboxPage /></RequireRole>} />
              <Route path="/vendor/team" element={<RequireRole role="vendor"><VendorTeamPage /></RequireRole>} />
              <Route path="/vendor/onboarding" element={<RequireRole role="vendor"><VendorOnboardingPage /></RequireRole>} />
              <Route path="/vendor/analytics" element={<RequireRole role="vendor"><VendorAnalyticsPage /></RequireRole>} />
              <Route path="/vendor/appointments" element={<RequireRole role="vendor"><VendorAppointmentsPage /></RequireRole>} />
              <Route path="/vendor/availability" element={<RequireRole role="vendor"><AvailabilityPage /></RequireRole>} />
              <Route path="/vendor/payments" element={<RequireRole role="vendor"><ComingSoonPage side="vendor" description="Connect a Stripe account, see payouts, and track the 3% commission on confirmed bookings." /></RequireRole>} />
              <Route path="/vendor/contracts" element={<RequireRole role="vendor"><VendorContractsPage /></RequireRole>} />
              <Route path="/vendor/messages" element={<RequireRole role="vendor"><VendorMessagesPage /></RequireRole>} />
              <Route path="/vendor/partners" element={<RequireRole role="vendor"><VendorPartnersPage /></RequireRole>} />
              <Route path="/vendor/inbox/:inquiryId" element={<RequireRole role="vendor"><InquiryDetailPage /></RequireRole>} />

              {/* Admin */}
              <Route path="/admin/dashboard" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
              <Route path="/admin/vendors" element={<RequireRole role="admin"><AdminVendorsPage /></RequireRole>} />
              <Route path="/admin/inquiries" element={<RequireRole role="admin"><AdminInquiriesPage /></RequireRole>} />
              <Route path="/admin/reviews" element={<RequireRole role="admin"><AdminReviewsPage /></RequireRole>} />
              <Route path="/admin/inspiration" element={<RequireRole role="admin"><AdminInspirationPage /></RequireRole>} />
              <Route path="/admin/verifications" element={<RequireRole role="admin"><AdminVerificationsPage /></RequireRole>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <MobilePortalBell />
          <OnboardingTour />
          <CommandPalette />
          <CookieBanner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
