import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LandingPage from "./pages/LandingPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import VendorBrowsePage from "./pages/VendorBrowsePage";
import VendorApplyPage from "./pages/VendorApplyPage";
import CustomerDashboard from "./pages/customer/CustomerDashboard";
import ChecklistPage from "./pages/customer/ChecklistPage";
import TasksPage from "./pages/customer/TasksPage";
import PaymentsPage from "./pages/customer/PaymentsPage";
import InvitationBuilder from "./pages/customer/InvitationBuilder";
import VendorDashboard from "./pages/vendor/VendorDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/vendors" element={<VendorBrowsePage />} />
          <Route path="/vendor-apply" element={<VendorApplyPage />} />

          {/* Customer */}
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />
          <Route path="/customer/checklist" element={<ChecklistPage />} />
          <Route path="/customer/tasks" element={<TasksPage />} />
          <Route path="/customer/payments" element={<PaymentsPage />} />
          <Route path="/customer/invitations" element={<InvitationBuilder />} />

          {/* Vendor */}
          <Route path="/vendor/dashboard" element={<VendorDashboard />} />

          {/* Admin */}
          <Route path="/admin/dashboard" element={<AdminDashboard />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
