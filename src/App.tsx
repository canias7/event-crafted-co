import { lazy, Suspense } from "react";
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
import { RequireRole } from "./components/auth/RequireRole";
import { CookieBanner } from "./components/CookieBanner";
import { MobilePortalBell } from "./components/notifications/MobilePortalBell";

// Lazy-load everything else so the initial bundle ships only the landing,
// nav, and auth surfaces. Portal routes (customer / vendor / admin) split
// out into separate chunks loaded on demand behind RequireRole.
const HowItWorksPage = lazy(() => import("./pages/HowItWorksPage"));
const VendorBrowsePage = lazy(() => import("./pages/VendorBrowsePage"));
const VendorDetailPage = lazy(() => import("./pages/VendorDetailPage"));
const VendorCategoryPage = lazy(() => import("./pages/VendorCategoryPage"));
const InspirationPage = lazy(() => import("./pages/InspirationPage"));
const InspirationDetailPage = lazy(() => import("./pages/InspirationDetailPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const VendorApplyPage = lazy(() => import("./pages/VendorApplyPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ComingSoonPage = lazy(() => import("./pages/ComingSoonPage"));

const CustomerDashboard = lazy(() => import("./pages/customer/CustomerDashboard"));
const OnboardingPage = lazy(() => import("./pages/customer/OnboardingPage"));
const InquiriesPage = lazy(() => import("./pages/customer/InquiriesPage"));
const HostInquiryDetailPage = lazy(() => import("./pages/customer/HostInquiryDetailPage"));
const FavoritesPage = lazy(() => import("./pages/customer/FavoritesPage"));
const EventDetailsPage = lazy(() => import("./pages/customer/EventDetailsPage"));
const GuestsPage = lazy(() => import("./pages/customer/GuestsPage"));
const RsvpPage = lazy(() => import("./pages/RsvpPage"));
const ChecklistPage = lazy(() => import("./pages/customer/ChecklistPage"));
const TasksPage = lazy(() => import("./pages/customer/TasksPage"));
const PaymentsPage = lazy(() => import("./pages/customer/PaymentsPage"));
const InvitationBuilder = lazy(() => import("./pages/customer/InvitationBuilder"));
const MoodBoardsPage = lazy(() => import("./pages/customer/MoodBoardsPage"));
const MoodBoardDetailPage = lazy(() => import("./pages/customer/MoodBoardDetailPage"));
const MoodBoardSharePage = lazy(() => import("./pages/MoodBoardSharePage"));

const VendorDashboard = lazy(() => import("./pages/vendor/VendorDashboard"));
const VendorProfilePage = lazy(() => import("./pages/vendor/VendorProfilePage"));
const VendorTemplatesPage = lazy(() => import("./pages/vendor/VendorTemplatesPage"));
const VendorInboxPage = lazy(() => import("./pages/vendor/VendorInboxPage"));
const InquiryDetailPage = lazy(() => import("./pages/vendor/InquiryDetailPage"));
const AvailabilityPage = lazy(() => import("./pages/vendor/AvailabilityPage"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminVendorsPage = lazy(() => import("./pages/admin/AdminVendorsPage"));
const AdminReviewsPage = lazy(() => import("./pages/admin/AdminReviewsPage"));
const AdminInquiriesPage = lazy(() => import("./pages/admin/AdminInquiriesPage"));
const AdminInspirationPage = lazy(() => import("./pages/admin/AdminInspirationPage"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-label text-muted-foreground">Loading…</div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/vendors" element={<VendorBrowsePage />} />
              <Route path="/vendors/category/:slug" element={<VendorCategoryPage />} />
              <Route path="/vendors/:id" element={<VendorDetailPage />} />
              <Route path="/inspiration" element={<InspirationPage />} />
              <Route path="/inspiration/:slug" element={<InspirationDetailPage />} />
              <Route path="/rsvp/:token" element={<RsvpPage />} />
              <Route path="/board/:token" element={<MoodBoardSharePage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/vendor-apply" element={<VendorApplyPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/check-email" element={<CheckEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/settings" element={<RequireRole role={["host", "vendor", "admin"]}><SettingsPage /></RequireRole>} />

              {/* Customer */}
              <Route path="/customer/dashboard" element={<RequireRole role="host"><CustomerDashboard /></RequireRole>} />
              <Route path="/customer/onboarding" element={<RequireRole role="host"><OnboardingPage /></RequireRole>} />
              <Route path="/customer/inquiries" element={<RequireRole role="host"><InquiriesPage /></RequireRole>} />
              <Route path="/customer/inquiries/:inquiryId" element={<RequireRole role="host"><HostInquiryDetailPage /></RequireRole>} />
              <Route path="/customer/event" element={<RequireRole role="host"><EventDetailsPage /></RequireRole>} />
              <Route path="/customer/guests" element={<RequireRole role="host"><GuestsPage /></RequireRole>} />
              <Route path="/customer/appointments" element={<RequireRole role="host"><ComingSoonPage side="customer" description="Schedule and manage vendor consultations, tastings, and walkthroughs in one place." /></RequireRole>} />
              <Route path="/customer/favorites" element={<RequireRole role="host"><FavoritesPage /></RequireRole>} />
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
              <Route path="/vendor/appointments" element={<RequireRole role="vendor"><ComingSoonPage side="vendor" description="Calendar bookings, tasting / walkthrough requests, and confirmed event dates in one place." /></RequireRole>} />
              <Route path="/vendor/availability" element={<RequireRole role="vendor"><AvailabilityPage /></RequireRole>} />
              <Route path="/vendor/payments" element={<RequireRole role="vendor"><ComingSoonPage side="vendor" description="Connect a Stripe account, see payouts, and track the 3% commission on confirmed bookings." /></RequireRole>} />
              <Route path="/vendor/contract" element={<RequireRole role="vendor"><ComingSoonPage side="vendor" description="Month-to-month vendor agreement, no minimum terms. We'll surface it here when ready to sign." /></RequireRole>} />
              <Route path="/vendor/inbox/:inquiryId" element={<RequireRole role="vendor"><InquiryDetailPage /></RequireRole>} />

              {/* Admin */}
              <Route path="/admin/dashboard" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
              <Route path="/admin/vendors" element={<RequireRole role="admin"><AdminVendorsPage /></RequireRole>} />
              <Route path="/admin/inquiries" element={<RequireRole role="admin"><AdminInquiriesPage /></RequireRole>} />
              <Route path="/admin/reviews" element={<RequireRole role="admin"><AdminReviewsPage /></RequireRole>} />
              <Route path="/admin/inspiration" element={<RequireRole role="admin"><AdminInspirationPage /></RequireRole>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <MobilePortalBell />
          <CookieBanner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
