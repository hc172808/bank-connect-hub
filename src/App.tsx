import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth, UserRole } from "./hooks/useAuth";
import Auth from "./pages/Auth";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import ChangePassword from "./pages/ChangePassword";
import Feedback from "./pages/Feedback";
import ClientDashboard from "./pages/ClientDashboard";
import AgentDashboard from "./pages/AgentDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ManageUsers from "./pages/ManageUsers";
import ManageAgents from "./pages/ManageAgents";
import ManageVendors from "./pages/ManageVendors";
import SystemSettings from "./pages/SystemSettings";
import DatabaseManagement from "./pages/DatabaseManagement";
import TransactionReports from "./pages/TransactionReports";
import FinancialReports from "./pages/FinancialReports";
import UserAnalytics from "./pages/UserAnalytics";
import SendMoney from "./pages/SendMoney";
import RequestFunds from "./pages/RequestFunds";
import FeeManagement from "./pages/FeeManagement";
import AdminDeposit from "./pages/AdminDeposit";
import AgentDeposit from "./pages/AgentDeposit";
import ApprovePendingDeposits from "./pages/ApprovePendingDeposits";
import MyQRCode from "./pages/MyQRCode";
import NotFound from "./pages/NotFound";
import PayBills from "./pages/PayBills";
import TopUp from "./pages/TopUp";
import PayMerchant from "./pages/PayMerchant";
import ReferAndEarn from "./pages/ReferAndEarn";
import Transactions from "./pages/Transactions";
import Notifications from "./pages/Notifications";
import Menu from "./pages/Menu";
import ScanToPay from "./pages/ScanToPay";
import AddMoney from "./pages/AddMoney";
import ReceiveMoney from "./pages/ReceiveMoney";
import BlockchainSettings from "./pages/BlockchainSettings";
import WalletImport from "./pages/WalletImport";
import CoinManagement from "./pages/CoinManagement";
import ConversionFees from "./pages/ConversionFees";
import FeatureToggles from "./pages/FeatureToggles";
import CoinConvert from "./pages/CoinConvert";
import VendorDashboard from "./pages/VendorDashboard";
import VendorStore from "./pages/VendorStore";
import VendorList from "./pages/VendorList";
import VendorRegistrationFees from "./pages/VendorRegistrationFees";
import AdminPrintQRCodes from "./pages/AdminPrintQRCodes";
import AdminNotifications from "./pages/AdminNotifications";

const queryClient = new QueryClient();

const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-primary/10 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role && !allowedRoles.includes(role)) {
    return <Navigate to={`/${role}`} replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-primary/10 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // Redirect to appropriate dashboard based on role
  if (role === "client") {
    return (
      <Routes>
        <Route path="/client" element={<ClientDashboard />} />
        <Route path="/send-money" element={<SendMoney />} />
        <Route path="/request-funds" element={<RequestFunds />} />
        <Route path="/my-qr" element={<MyQRCode />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/pay-bills" element={<PayBills />} />
        <Route path="/top-up" element={<TopUp />} />
        <Route path="/pay-merchant" element={<PayMerchant />} />
        <Route path="/refer" element={<ReferAndEarn />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/scan-to-pay" element={<ScanToPay />} />
        <Route path="/add-money" element={<AddMoney />} />
        <Route path="/receive-money" element={<ReceiveMoney />} />
        <Route path="/wallet-import" element={<WalletImport />} />
        <Route path="/coin-convert" element={<CoinConvert />} />
        <Route path="/vendor-store" element={<VendorStore />} />
        <Route path="/vendors" element={<VendorList />} />
        <Route path="*" element={<Navigate to="/client" replace />} />
      </Routes>
    );
  }

  if (role === "vendor") {
    return (
      <Routes>
        <Route path="/vendor" element={<VendorDashboard />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Routes>
    );
  }

  if (role === "agent") {
    return (
      <Routes>
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/agent-deposit" element={<AgentDeposit />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="*" element={<Navigate to="/agent" replace />} />
      </Routes>
    );
  }

  if (role === "admin") {
    return (
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><ManageUsers /></ProtectedRoute>} />
        <Route path="/admin/agents" element={<ProtectedRoute allowedRoles={["admin"]}><ManageAgents /></ProtectedRoute>} />
        <Route path="/admin/vendors" element={<ProtectedRoute allowedRoles={["admin"]}><ManageVendors /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SystemSettings /></ProtectedRoute>} />
        <Route path="/admin/database" element={<ProtectedRoute allowedRoles={["admin"]}><DatabaseManagement /></ProtectedRoute>} />
        <Route path="/admin/transactions" element={<ProtectedRoute allowedRoles={["admin"]}><TransactionReports /></ProtectedRoute>} />
        <Route path="/admin/financial" element={<ProtectedRoute allowedRoles={["admin"]}><FinancialReports /></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={["admin"]}><UserAnalytics /></ProtectedRoute>} />
        <Route path="/fee-management" element={<FeeManagement />} />
        <Route path="/admin-deposit" element={<AdminDeposit />} />
        <Route path="/approve-deposits" element={<ApprovePendingDeposits />} />
        <Route path="/admin/blockchain" element={<ProtectedRoute allowedRoles={["admin"]}><BlockchainSettings /></ProtectedRoute>} />
        <Route path="/admin/coins" element={<ProtectedRoute allowedRoles={["admin"]}><CoinManagement /></ProtectedRoute>} />
        <Route path="/admin/conversion-fees" element={<ProtectedRoute allowedRoles={["admin"]}><ConversionFees /></ProtectedRoute>} />
        <Route path="/admin/features" element={<ProtectedRoute allowedRoles={["admin"]}><FeatureToggles /></ProtectedRoute>} />
        <Route path="/admin/vendor-fees" element={<ProtectedRoute allowedRoles={["admin"]}><VendorRegistrationFees /></ProtectedRoute>} />
        <Route path="/admin/print-qr" element={<ProtectedRoute allowedRoles={["admin"]}><AdminPrintQRCodes /></ProtectedRoute>} />
        <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={["admin"]}><AdminNotifications /></ProtectedRoute>} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
