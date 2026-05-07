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
import { ReviewsPage } from "./pages/ReviewsPage";

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
              <Route path="/reviews" element={<ReviewsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </PinGate>
  );
}
