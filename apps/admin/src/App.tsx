import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./hooks/useAuth";
import { PinGate } from "./components/PinGate";
import { RequireAdmin } from "./components/RequireAdmin";
import { AdminShell } from "./components/AdminShell";
import { DashboardPage } from "./pages/DashboardPage";
import { VendorApplicationsPage } from "./pages/VendorApplicationsPage";
import { UsersPage } from "./pages/UsersPage";
import { ListingsPage } from "./pages/ListingsPage";
import { VerificationsPage } from "./pages/VerificationsPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { EmailLeadsPage } from "./pages/EmailLeadsPage";
import { EmailScrapingPage } from "./pages/EmailScrapingPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { CostsPage } from "./pages/CostsPage";
import { EmailsPage } from "./pages/EmailsPage";

export default function App() {
  return (
    <PinGate>
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" />
          <Routes>
            <Route
              element={
                <RequireAdmin>
                  <AdminShell />
                </RequireAdmin>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/applications" element={<VendorApplicationsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/listings" element={<ListingsPage />} />
              <Route path="/verifications" element={<VerificationsPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/costs" element={<CostsPage />} />
              <Route path="/emails" element={<EmailsPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/workspace/email-leads" element={<EmailLeadsPage />} />
              <Route path="/workspace/templates" element={<TemplatesPage />} />
              <Route
                path="/workspace/email-scraping"
                element={<EmailScrapingPage />}
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </PinGate>
  );
}
