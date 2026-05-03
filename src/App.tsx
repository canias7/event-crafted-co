import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LandingPage from "./pages/LandingPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import VendorBrowsePage from "./pages/VendorBrowsePage";
import VendorDetailPage from "./pages/VendorDetailPage";
import VendorApplyPage from "./pages/VendorApplyPage";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import OnboardingPage from "./pages/customer/OnboardingPage";
import InquiriesPage from "./pages/customer/InquiriesPage";
import ChecklistPage from "./pages/customer/ChecklistPage";
import TasksPage from "./pages/customer/TasksPage";
import PaymentsPage from "./pages/customer/PaymentsPage";
import InvitationBuilder from "./pages/customer/InvitationBuilder";
import VendorDashboard from "./pages/vendor/VendorDashboard";
import VendorProfilePage from "./pages/vendor/VendorProfilePage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import VendorInboxPage from "./pages/vendor/VendorInboxPage";
import InquiryDetailPage from "./pages/vendor/InquiryDetailPage";
import { AuthProvider } from "./hooks/useAuth";
import { RequireRole } from "./components/auth/RequireRole";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/vendors" element={<VendorBrowsePage />} />
          <Route path="/vendors/:id" element={<VendorDetailPage />} />
          <Route path="/vendor-apply" element={<VendorApplyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Customer */}
          <Route path="/customer/dashboard" element={<RequireRole role="host"><CustomerDashboard /></RequireRole>} />
          <Route path="/customer/onboarding" element={<RequireRole role="host"><OnboardingPage /></RequireRole>} />
          <Route path="/customer/inquiries" element={<RequireRole role="host"><InquiriesPage /></RequireRole>} />
          <Route path="/customer/checklist" element={<RequireRole role="host"><ChecklistPage /></RequireRole>} />
          <Route path="/customer/tasks" element={<RequireRole role="host"><TasksPage /></RequireRole>} />
          <Route path="/customer/payments" element={<RequireRole role="host"><PaymentsPage /></RequireRole>} />
          <Route path="/customer/invitations" element={<RequireRole role="host"><InvitationBuilder /></RequireRole>} />

          {/* Vendor */}
          <Route path="/vendor/dashboard" element={<RequireRole role="vendor"><VendorDashboard /></RequireRole>} />
          <Route path="/vendor/profile" element={<RequireRole role="vendor"><VendorProfilePage /></RequireRole>} />
          <Route path="/vendor/inbox" element={<RequireRole role="vendor"><VendorInboxPage /></RequireRole>} />
          <Route path="/vendor/inbox/:inquiryId" element={<RequireRole role="vendor"><InquiryDetailPage /></RequireRole>} />

          {/* Admin */}
          <Route path="/admin/dashboard" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
