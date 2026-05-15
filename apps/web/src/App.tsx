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

// Lazy ship-on-mount component. CookieBanner only renders once for
// users who haven't accepted, so deferring the chunk shaves the
// initial JS budget.
const CookieBanner = lazy(() =>
  import("./components/CookieBanner").then((m) => ({ default: m.CookieBanner })),
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
  OnboardingPage,
  InquiriesPage,
  HostInquiryDetailPage,
  HostEventsPage,
  CustomerExplorePage,
  HostProfilePage,
  MessagesPage,
  SupportPage,
  RealEventsPage,
  RealEventDetailPage,
  AcceptPlanningInvitePage,
  VendorDashboard,
  VendorHomePage,
  VendorMyProfilePage,
  VendorEditProfilePage,
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
              <Route path="/real-events" element={<RealEventsPage />} />
              <Route path="/real-events/:slug" element={<RealEventDetailPage />} />
              <Route path="/review/:token" element={<PublicReviewPage />} />
              <Route path="/proposals/:id/print" element={<ProposalPrintPage />} />
              <Route path="/p/:token" element={<PublicProposalPage />} />
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

              {/* Customer — mirrors mobile host app (4 tabs + settings).
                  Mobile only exposes Explore / Inbox / Events / Profile,
                  so the web does the same. Every legacy /customer/* URL
                  (events-microsite planner, registry, seating, etc) now
                  redirects to /customer/explore so old emails don't 404.
                  Settings is the existing /settings route (mobile reaches
                  it via the Profile tab's "Account settings" card). */}
              <Route path="/customer/onboarding" element={<RequireRole role="host"><OnboardingPage /></RequireRole>} />
              <Route path="/customer/explore" element={<RequireRole role="host"><CustomerExplorePage /></RequireRole>} />
              <Route path="/customer/inquiries" element={<RequireRole role="host"><InquiriesPage /></RequireRole>} />
              <Route path="/customer/inquiries/:inquiryId" element={<RequireRole role="host"><HostInquiryDetailPage /></RequireRole>} />
              <Route path="/customer/messages" element={<RequireRole role="host"><MessagesPage /></RequireRole>} />
              <Route path="/customer/events" element={<RequireRole role="host"><HostEventsPage /></RequireRole>} />
              <Route path="/customer/profile" element={<RequireRole role="host"><HostProfilePage /></RequireRole>} />
              {/* Legacy host routes — bounce to /customer/explore so
                  bookmarks, old emails, and external deep-links don't
                  hit a 404. */}
              <Route path="/customer/dashboard" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/customer/vendors" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/customer/event" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/guests" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/seating" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/timeline" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/planning-team" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/registry" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/inquiry-blast" element={<Navigate to="/customer/inquiries" replace />} />
              <Route path="/customer/live" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/gifts" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/microsite" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/appointments" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/favorites" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/customer/saved-searches" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/customer/checklist" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/tasks" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/payments" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/invitations" element={<Navigate to="/customer/events" replace />} />
              <Route path="/customer/moodboards" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/customer/moodboards/:id" element={<Navigate to="/customer/explore" replace />} />
              {/* /planner and /party are cross-role surfaces (planner workspace + party host hub).
                  Mobile has neither — bounce to /customer/events for hosts. RequireRole still
                  blocks vendors from these. */}
              <Route path="/planner" element={<Navigate to="/customer/events" replace />} />
              <Route path="/party" element={<Navigate to="/customer/events" replace />} />
              <Route path="/party/:eventId" element={<Navigate to="/customer/events" replace />} />
              {/* Public token-gated host share links (Gift / Rsvp /
                  Microsite / Album / Mood board) were dropped along
                  with the host editors. Bounce to / so old links
                  don't 404 outright. */}
              <Route path="/gift/:token" element={<Navigate to="/" replace />} />
              <Route path="/rsvp/:token" element={<Navigate to="/" replace />} />
              <Route path="/e/:token" element={<Navigate to="/" replace />} />
              <Route path="/album/:token" element={<Navigate to="/" replace />} />
              <Route path="/board/:token" element={<Navigate to="/" replace />} />
              <Route path="/plan-in-5" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/support" element={<RequireRole role={["host", "vendor"]}><SupportPage /></RequireRole>} />

              {/* Vendor */}
              <Route path="/vendor/dashboard" element={<RequireRole role="vendor"><VendorDashboard /></RequireRole>} />
              <Route path="/vendor/home" element={<RequireRole role="vendor"><VendorHomePage /></RequireRole>} />
              <Route path="/vendor/me" element={<RequireRole role="vendor"><VendorMyProfilePage /></RequireRole>} />
              <Route path="/vendor/edit-profile" element={<RequireRole role="vendor"><VendorEditProfilePage /></RequireRole>} />
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
          {/* OnboardingTour disabled — the existing 4-step wizard
              wasn't pulling its weight. We'll bring back a leaner
              walkthrough later. */}
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
