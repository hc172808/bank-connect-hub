import { lazy, Suspense } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ForceUpdateGate } from "@/components/ForceUpdateGate";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth, UserRole } from "./hooks/useAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScrollToTop } from "./components/ScrollToTop";

// Lazy-loaded pages (route-based code splitting)
const Auth = lazy(() => import("./pages/Auth"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Feedback = lazy(() => import("./pages/Feedback"));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard"));
const AgentDashboard = lazy(() => import("./pages/AgentDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ManageUsers = lazy(() => import("./pages/ManageUsers"));
const ManageAgents = lazy(() => import("./pages/ManageAgents"));
const ManageVendors = lazy(() => import("./pages/ManageVendors"));
const SystemSettings = lazy(() => import("./pages/SystemSettings"));
const DatabaseManagement = lazy(() => import("./pages/DatabaseManagement"));
const TransactionReports = lazy(() => import("./pages/TransactionReports"));
const FinancialReports = lazy(() => import("./pages/FinancialReports"));
const UserAnalytics = lazy(() => import("./pages/UserAnalytics"));
const SendMoney = lazy(() => import("./pages/SendMoney"));
const RequestFunds = lazy(() => import("./pages/RequestFunds"));
const FeeManagement = lazy(() => import("./pages/FeeManagement"));
const AdminDeposit = lazy(() => import("./pages/AdminDeposit"));
const AgentDeposit = lazy(() => import("./pages/AgentDeposit"));
const ApprovePendingDeposits = lazy(() => import("./pages/ApprovePendingDeposits"));
const MyQRCode = lazy(() => import("./pages/MyQRCode"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PayBills = lazy(() => import("./pages/PayBills"));
const TopUp = lazy(() => import("./pages/TopUp"));
const PayMerchant = lazy(() => import("./pages/PayMerchant"));
const ReferAndEarn = lazy(() => import("./pages/ReferAndEarn"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Menu = lazy(() => import("./pages/Menu"));
const ScanToPay = lazy(() => import("./pages/ScanToPay"));
const AddMoney = lazy(() => import("./pages/AddMoney"));
const AddMoneyCard = lazy(() => import("./pages/AddMoneyCard"));
const AddMoneyBank = lazy(() => import("./pages/AddMoneyBank"));
const AddMoneyAgent = lazy(() => import("./pages/AddMoneyAgent"));
const AddMoneyMobile = lazy(() => import("./pages/AddMoneyMobile"));
const ReceiveMoney = lazy(() => import("./pages/ReceiveMoney"));
const BlockchainSettings = lazy(() => import("./pages/BlockchainSettings"));
const CoinManagement = lazy(() => import("./pages/CoinManagement"));
const ConversionFees = lazy(() => import("./pages/ConversionFees"));
const FeatureToggles = lazy(() => import("./pages/FeatureToggles"));
const CoinConvert = lazy(() => import("./pages/CoinConvert"));
const VendorDashboard = lazy(() => import("./pages/VendorDashboard"));
const VendorCharge = lazy(() => import("./pages/VendorCharge"));
const VendorAnalytics = lazy(() => import("./pages/VendorAnalytics"));
const VerifyWhatsApp = lazy(() => import("./pages/VerifyWhatsApp"));
const AdminAISecurity = lazy(() => import("./pages/AdminAISecurity"));
const AdminFirewall   = lazy(() => import("./pages/AdminFirewall"));
const AdminLitenode   = lazy(() => import("./pages/AdminLitenode"));
const AdminAppReleases = lazy(() => import("./pages/AdminAppReleases"));
const AdminThemes = lazy(() => import("./pages/AdminThemes"));
const AdminAppManager = lazy(() => import("./pages/AdminAppManager"));
const VendorStore = lazy(() => import("./pages/VendorStore"));
const VendorList = lazy(() => import("./pages/VendorList"));
const VendorRegistrationFees = lazy(() => import("./pages/VendorRegistrationFees"));
const AdminPrintQRCodes = lazy(() => import("./pages/AdminPrintQRCodes"));
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const ManageMobileProviders = lazy(() => import("./pages/ManageMobileProviders"));
const RequestReversal = lazy(() => import("./pages/RequestReversal"));
const ManageReversals = lazy(() => import("./pages/ManageReversals"));
const ManageChangelog = lazy(() => import("./pages/ManageChangelog"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const KYCSubmission = lazy(() => import("./pages/KYCSubmission"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
const AdminKYCReview = lazy(() => import("./pages/AdminKYCReview"));
const AdminSuspiciousAlerts = lazy(() => import("./pages/AdminSuspiciousAlerts"));
const AdminAnnouncements = lazy(() => import("./pages/AdminAnnouncements"));
const AdminCountries = lazy(() => import("./pages/AdminCountries"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const AdminApkBuilder = lazy(() => import("./pages/AdminApkBuilder"));
const LegalCompliance = lazy(() => import("./pages/LegalCompliance"));
const BudgetPlanner       = lazy(() => import("./pages/BudgetPlanner"));
const SavingsGoals        = lazy(() => import("./pages/SavingsGoals"));
const Beneficiaries       = lazy(() => import("./pages/Beneficiaries"));
const VirtualCards        = lazy(() => import("./pages/VirtualCards"));
const FinancialInsights   = lazy(() => import("./pages/FinancialInsights"));
const ScheduledPayments   = lazy(() => import("./pages/ScheduledPayments"));
const SplitBills          = lazy(() => import("./pages/SplitBills"));
const AdminRPCNode        = lazy(() => import("./pages/AdminRPCNode"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const FullScreenLoader = ({ label = "Loading..." }: { label?: string }) => (
  <div
    className="min-h-screen bg-primary/10 flex items-center justify-center"
    data-testid="loader-fullscreen"
  >
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-foreground">{label}</p>
    </div>
  </div>
);

const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}) => {
  const { user, role, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (role && !allowedRoles.includes(role)) return <Navigate to={`/${role}`} replace />;

  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, role, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

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
        <Route path="/add-money/card" element={<AddMoneyCard />} />
        <Route path="/add-money/bank" element={<AddMoneyBank />} />
        <Route path="/add-money/agent" element={<AddMoneyAgent />} />
        <Route path="/add-money/mobile" element={<AddMoneyMobile />} />
        <Route path="/receive-money" element={<ReceiveMoney />} />
        <Route path="/coin-convert" element={<CoinConvert />} />
        <Route path="/vendor-store" element={<VendorStore />} />
        <Route path="/vendors" element={<VendorList />} />
        <Route path="/request-reversal" element={<RequestReversal />} />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/kyc" element={<KYCSubmission />} />
        <Route path="/budget" element={<BudgetPlanner />} />
        <Route path="/savings" element={<SavingsGoals />} />
        <Route path="/beneficiaries" element={<Beneficiaries />} />
        <Route path="/virtual-cards" element={<VirtualCards />} />
        <Route path="/insights" element={<FinancialInsights />} />
        <Route path="/scheduled-payments" element={<ScheduledPayments />} />
        <Route path="/split-bills" element={<SplitBills />} />
        <Route path="*" element={<Navigate to="/client" replace />} />
      </Routes>
    );
  }

  if (role === "vendor") {
    return (
      <Routes>
        <Route path="/vendor" element={<VendorDashboard />} />
        <Route path="/vendor/charge" element={<VendorCharge />} />
        <Route path="/vendor/analytics" element={<VendorAnalytics />} />
        <Route path="/send-money" element={<SendMoney />} />
        <Route path="/receive-money" element={<ReceiveMoney />} />
        <Route path="/scan-to-pay" element={<ScanToPay />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/request-funds" element={<RequestFunds />} />
        <Route path="/my-qr" element={<MyQRCode />} />
        <Route path="/vendor-store" element={<VendorStore />} />
        <Route path="/verify-whatsapp" element={<VerifyWhatsApp />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/kyc" element={<KYCSubmission />} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Routes>
    );
  }

  if (role === "agent") {
    return (
      <Routes>
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/agent-deposit" element={<AgentDeposit />} />
        <Route path="/print-qr" element={<AdminPrintQRCodes />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/kyc" element={<KYCSubmission />} />
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
        <Route path="/admin/reversals" element={<ProtectedRoute allowedRoles={["admin"]}><ManageReversals /></ProtectedRoute>} />
        <Route path="/admin/mobile-providers" element={<ProtectedRoute allowedRoles={["admin"]}><ManageMobileProviders /></ProtectedRoute>} />
        <Route path="/admin/changelog" element={<ProtectedRoute allowedRoles={["admin"]}><ManageChangelog /></ProtectedRoute>} />
        <Route path="/admin/ai-security" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAISecurity /></ProtectedRoute>} />
        <Route path="/admin/firewall" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFirewall /></ProtectedRoute>} />
        <Route path="/admin/litenode" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLitenode /></ProtectedRoute>} />
        <Route path="/admin/rpc-node" element={<ProtectedRoute allowedRoles={["admin"]}><AdminRPCNode /></ProtectedRoute>} />
        <Route path="/admin/app-releases" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAppReleases /></ProtectedRoute>} />
        <Route path="/admin/themes" element={<ProtectedRoute allowedRoles={["admin"]}><AdminThemes /></ProtectedRoute>} />
        <Route path="/admin/app-manager" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAppManager /></ProtectedRoute>} />
        <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAuditLogs /></ProtectedRoute>} />
        <Route path="/admin/kyc-review" element={<ProtectedRoute allowedRoles={["admin"]}><AdminKYCReview /></ProtectedRoute>} />
        <Route path="/admin/alerts" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSuspiciousAlerts /></ProtectedRoute>} />
        <Route path="/admin/announcements" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAnnouncements /></ProtectedRoute>} />
        <Route path="/admin/countries" element={<ProtectedRoute allowedRoles={["admin"]}><AdminCountries /></ProtectedRoute>} />
        <Route path="/admin/console" element={<ProtectedRoute allowedRoles={["admin"]}><AdminConsole /></ProtectedRoute>} />
        <Route path="/admin/apk-builder" element={<ProtectedRoute allowedRoles={["admin"]}><AdminApkBuilder /></ProtectedRoute>} />
        <Route path="/admin/legal" element={<ProtectedRoute allowedRoles={["admin"]}><LegalCompliance /></ProtectedRoute>} />
        <Route path="/security" element={<SecuritySettings />} />
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
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <ForceUpdateGate>
            <ScrollToTop />
            <Suspense fallback={<FullScreenLoader />}>
              <AppRoutes />
            </Suspense>
            <UpdateBanner />
          </ForceUpdateGate>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
