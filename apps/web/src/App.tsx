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
  VendorLocationsPage,
  VendorCityPage,
  VendorCityCategoryPage,
  VendorEventTypeCityPage,
  VendorDetailPage,
  VendorCategoryPage,
  PrivacyPage,
  TermsPage,
  ChangelogPage,
  StatusPage,
  PressPage,
  SuperAgentsPage,
  SettingsPage,
  NotFound,
  InquiriesPage,
  HostInquiryDetailPage,
  HostEventsPage,
  HostAccountPage,
  CustomerExplorePage,
  HostProfilePage,
  VendorMyProfilePage,
  VendorEditProfilePage,
  VendorInboxPage,
  VendorAppointmentsPage,
  VendorPartnersPage,
  VendorAiSuperagentsPage,
  VendorPayPage,
  VendorGalleryPage,
  InquiryDetailPage,
  AcceptTeamInvitePage,
  ClaimVendorPage,
  PublicReviewPage,
  ProposalPrintPage,
  PublicProposalPage,
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
              <Route path="/vendors/locations" element={<VendorLocationsPage />} />
              <Route path="/vendors/in/:citySlug" element={<VendorCityPage />} />
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
              {/* /guides/:slug removed — editorial_articles table dropped
                  with VendorBlogPage. Outstanding indexed URLs bounce to /. */}
              <Route path="/guides/:slug" element={<Navigate to="/" replace />} />
              {/* Vendor claim-listing flow — public, auth-gated to claim. */}
              <Route path="/claim/:token" element={<ClaimVendorPage />} />
              {/* /real-events + /real-events/:slug routes pulled
                  temporarily — page is hidden until we re-enable. */}
              <Route path="/review/:token" element={<PublicReviewPage />} />
              <Route path="/proposals/:id/print" element={<ProposalPrintPage />} />
              <Route path="/p/:token" element={<PublicProposalPage />} />
              <Route path="/accept-team-invite/:token" element={<AcceptTeamInvitePage />} />
              {/* Planning-team feature removed when host portal mirrored
                  to mobile; outstanding invite links bounce to /. */}
              <Route path="/accept-planning-invite/:token" element={<Navigate to="/" replace />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/press" element={<PressPage />} />
              <Route path="/super-agents" element={<SuperAgentsPage />} />
              {/* /vendor-apply removed — vendors now sign up through
                  the regular Sign up button. Old bookmarks redirect
                  to the signup chooser so the URL doesn't 404. */}
              <Route path="/vendor-apply" element={<Navigate to="/signup" replace />} />
              <Route path="/vendor-apply/thanks" element={<Navigate to="/signup" replace />} />
              <Route path="/login" element={<LoginRoleChooserPage />} />
              <Route path="/login/host" element={<LoginPage role="host" />} />
              <Route path="/login/vendor" element={<LoginPage role="vendor" />} />
              <Route path="/signup" element={<SignupRoleChooserPage />} />
              <Route path="/signup/host" element={<SignupPage role="host" />} />
              <Route path="/signup/vendor" element={<SignupPage role="vendor" />} />
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
              {/* Onboarding flow removed: signup auto-stamps onboarded_at
                  via the handle_new_user trigger, mirroring mobile. */}
              <Route path="/customer/onboarding" element={<Navigate to="/customer/explore" replace />} />
              <Route path="/customer/explore" element={<RequireRole role="host"><CustomerExplorePage /></RequireRole>} />
              <Route path="/customer/inquiries" element={<RequireRole role="host"><InquiriesPage /></RequireRole>} />
              <Route path="/customer/inquiries/:inquiryId" element={<RequireRole role="host"><HostInquiryDetailPage /></RequireRole>} />
              {/* /customer/messages removed: mobile has no DM list view.
                  Threads open via /customer/inquiries/:inquiryId. */}
              <Route path="/customer/messages" element={<Navigate to="/customer/inquiries" replace />} />
              <Route path="/customer/events" element={<RequireRole role="host"><HostEventsPage /></RequireRole>} />
              <Route path="/customer/profile" element={<RequireRole role="host"><HostProfilePage /></RequireRole>} />
              <Route path="/customer/account" element={<RequireRole role="host"><HostAccountPage /></RequireRole>} />
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

              {/* Vendor. /vendor/home dropped — /vendor/me is the
                  landing surface for vendors. The redirect catches
                  any stale bookmarks. /vendor/listing, /vendor/dashboard,
                  /vendor/team, /vendor/ai-agent, /vendor/payments,
                  /vendor/analytics, /vendor/blog all removed in the
                  route-cleanup pass — hitting them now lands on
                  NotFound (no redirects). */}
              <Route path="/vendor/home" element={<Navigate to="/vendor/me" replace />} />
              <Route path="/vendor/me" element={<RequireRole role="vendor"><VendorMyProfilePage /></RequireRole>} />
              <Route path="/vendor/edit-profile" element={<RequireRole role="vendor"><VendorEditProfilePage /></RequireRole>} />
              <Route path="/vendor/inbox" element={<RequireRole role="vendor"><VendorInboxPage /></RequireRole>} />
              <Route path="/vendor/inbox/:inquiryId" element={<RequireRole role="vendor"><InquiryDetailPage /></RequireRole>} />
              <Route path="/vendor/appointments" element={<RequireRole role="vendor"><VendorAppointmentsPage /></RequireRole>} />
              <Route path="/vendor/partners" element={<RequireRole role="vendor"><VendorPartnersPage /></RequireRole>} />
              <Route path="/vendor/ai-superagents" element={<RequireRole role="vendor"><VendorAiSuperagentsPage /></RequireRole>} />
              <Route path="/vendor/pay" element={<RequireRole role="vendor"><VendorPayPage /></RequireRole>} />
              <Route path="/vendor/gallery" element={<RequireRole role="vendor"><VendorGalleryPage /></RequireRole>} />
              {/* /vendor/studio retired — the three tools that lived under
                  it (AI Superagents, Vendora Pay, Gallery) now have their
                  own sidebar entries + routes above. */}
              <Route path="/vendor/studio" element={<Navigate to="/vendor/ai-superagents" replace />} />


              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
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
