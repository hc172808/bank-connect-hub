import { lazy, Suspense, useEffect, useState } from "react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ForceUpdateGate } from "@/components/ForceUpdateGate";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth, UserRole } from "./hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAutoPushSubscribe } from "./hooks/useAutoPushSubscribe";
import { useAppLock } from "./hooks/useAppLock";
import { useNewReleaseAlert } from "./hooks/useNewReleaseAlert";
import { AppLockScreen } from "./components/AppLockScreen";
import { DisplacedSessionDialog } from "./components/DisplacedSessionDialog";
import { MobileBrowserVerifyDialog } from "./components/MobileBrowserVerifyDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RoleGuard } from "./components/RoleGuard";
import { IncidentBanner } from "./components/IncidentBanner";
import { toast as sonnerToast } from "sonner";
import { buildSnapshot, snapshotToText } from "@/lib/bootDiagnostics";
import { ScrollToTop } from "./components/ScrollToTop";
import { BootDiagnosticsPanel } from "./components/BootDiagnosticsPanel";
import {
  logBoot,
  getAttempts,
  getBackoffStep,
  ensureRetryDeadline,
  commitRetry,
  reportBootFailure,
  BOOT_KEYS,
} from "@/lib/bootDiagnostics";

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
const AgentDeposit         = lazy(() => import("./pages/AgentDeposit"));
const AgentCashWithdrawal  = lazy(() => import("./pages/AgentCashWithdrawal"));
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
const WhatsAppGuide = lazy(() => import("./pages/WhatsAppGuide"));
const AdminWhatsAppVerification = lazy(() => import("./pages/AdminWhatsAppVerification"));
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
const AdminDownloadPoster = lazy(() => import("./pages/AdminDownloadPoster"));
const AdminSendUpdate = lazy(() => import("./pages/AdminSendUpdate"));
const AdminPasswordResets = lazy(() => import("./pages/AdminPasswordResets"));
const LegalCompliance = lazy(() => import("./pages/LegalCompliance"));
const AdminRewards    = lazy(() => import("./pages/AdminRewards"));
const BudgetPlanner       = lazy(() => import("./pages/BudgetPlanner"));
const SavingsGoals        = lazy(() => import("./pages/SavingsGoals"));
const SavingsAccounts       = lazy(() => import("./pages/SavingsAccounts"));
const Loans                 = lazy(() => import("./pages/Loans"));
const InternationalTransfers = lazy(() => import("./pages/InternationalTransfers"));
const GroupPayments         = lazy(() => import("./pages/GroupPayments"));
const CreditBuilder         = lazy(() => import("./pages/CreditBuilder"));
const MultiWallet           = lazy(() => import("./pages/MultiWallet"));
const RoleManagement        = lazy(() => import("./pages/RoleManagement"));
const Rewards               = lazy(() => import("./pages/Rewards"));
const BusinessBanking       = lazy(() => import("./pages/BusinessBanking"));
const Investments           = lazy(() => import("./pages/Investments"));
const FinancialTools        = lazy(() => import("./pages/FinancialTools"));
const MerchantInvoicing     = lazy(() => import("./pages/MerchantInvoicing"));
const Gamification          = lazy(() => import("./pages/Gamification"));
const SecurityOperationsCenter = lazy(() => import("./pages/SecurityOperationsCenter"));
const CardsHub              = lazy(() => import("./pages/CardsHub"));
const FinancingHub          = lazy(() => import("./pages/FinancingHub"));
const SupportCenter         = lazy(() => import("./pages/SupportCenter"));
const ChatInbox             = lazy(() => import("./pages/ChatInbox"));
const ChatThread            = lazy(() => import("./pages/ChatThread"));
const Beneficiaries         = lazy(() => import("./pages/Beneficiaries"));
const VirtualCards        = lazy(() => import("./pages/VirtualCards"));
const FinancialInsights   = lazy(() => import("./pages/FinancialInsights"));
const ScheduledPayments   = lazy(() => import("./pages/ScheduledPayments"));
const SplitBills          = lazy(() => import("./pages/SplitBills"));
const AdminRPCNode        = lazy(() => import("./pages/AdminRPCNode"));
const AdminNodeConfig     = lazy(() => import("./pages/AdminNodeConfig"));
const Leaderboard         = lazy(() => import("./pages/Leaderboard"));
const CurrencyConverter             = lazy(() => import("./pages/CurrencyConverter"));
const AdminAIDefense               = lazy(() => import("./pages/AdminAIDefense"));
const AIFinancialAssistant         = lazy(() => import("./pages/AIFinancialAssistant"));
const WhatsNew                     = lazy(() => import("./pages/WhatsNew"));
const PersonalizedRecommendations  = lazy(() => import("./pages/PersonalizedRecommendations"));
const NFCTapPayment                = lazy(() => import("./pages/NFCTapPayment"));
const APIIntegrations              = lazy(() => import("./pages/APIIntegrations"));
const OpenBanking                  = lazy(() => import("./pages/OpenBanking"));
const DownloadApp                  = lazy(() => import("./pages/DownloadApp"));
const AdminBootErrors              = lazy(() => import("./pages/AdminBootErrors"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const FullScreenLoader = ({ label = "Loading..." }: { label?: string }) => {
  const [slow, setSlow] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);
  const [attempts] = useState(() => getAttempts());
  const [lastStep] = useState(() => {
    try { return localStorage.getItem(BOOT_KEYS.step); } catch { return null; }
  });

  useEffect(() => {
    logBoot("react-auth-loading");
    const slowT = setTimeout(() => setSlow(true), 5000);
    const stuckT = setTimeout(() => { setStuck(true); logBoot("react-stuck"); }, 15000);
    return () => { clearTimeout(slowT); clearTimeout(stuckT); };
  }, []);

  // Auto-retry when the device reconnects after a stall.
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!stuck || !online) { setCountdown(null); return; }
    // Exponential backoff persisted in localStorage: resuming after a reload
    // continues the *exact* remaining wait rather than restarting the timer.
    const { retryAt } = ensureRetryDeadline();
    const remainingNow = () => Math.ceil((retryAt - Date.now()) / 1000);
    setCountdown(remainingNow());
    const iv = setInterval(() => {
      const remaining = remainingNow();
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        commitRetry();
        window.location.reload();
      }
    }, 500);
    return () => clearInterval(iv);
  }, [stuck, online, attempts]);

  // When stalled, work out WHY: network, backend config, backend reachability, or session.
  useEffect(() => {
    if (!stuck) return;
    let cancelled = false;
    (async () => {
      const set = (s: string) => { if (!cancelled) setDiagnosis(s); logBoot("diagnosis", s); };
      if (!navigator.onLine) {
        set("Network: device is offline.");
        void reportBootFailure({ stage: "network", reason: "device offline" });
        return;
      }
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        if (!res.ok) {
          set(`Config: /api/config returned HTTP ${res.status}. Using build-time keys.`);
          void reportBootFailure({ stage: "initSupabase", reason: `config HTTP ${res.status}` });
        }
      } catch (e) {
        set(`Config: could not reach /api/config (${e instanceof Error ? e.message : "network error"}). Falling back to build-time keys.`);
        void reportBootFailure({ stage: "initSupabase", reason: "config unreachable", error: e });
      }
      try {
        const { error } = await supabase.auth.getSession();
        if (error) {
          set(`Session: ${error.message}`);
          void reportBootFailure({ stage: "auth", reason: error.message, error, force: true });
          return;
        }
      } catch (e) {
        set(`Backend: auth request failed (${e instanceof Error ? e.message : "unknown error"}). Backend may be unreachable.`);
        void reportBootFailure({ stage: "auth", reason: "auth request failed", error: e, force: true });
        return;
      }
      if (!cancelled) {
        setDiagnosis((d) => d ?? "App shell loaded but a screen never mounted — usually a slow bundle download.");
        void reportBootFailure({ stage: "bundle", reason: "app shell never mounted a screen" });
      }
    })();
    return () => { cancelled = true; };
  }, [stuck]);

  // User-friendly toast on bootstrap failure: copies a full report and offers
  // a one-tap link into the hidden Diagnostics panel.
  useEffect(() => {
    if (!stuck || !diagnosis) return;
    const report = snapshotToText(buildSnapshot(diagnosis));
    const copy = async () => {
      try { await navigator.clipboard.writeText(report); } catch {
        const ta = document.createElement("textarea");
        ta.value = report; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove();
      }
    };
    sonnerToast.error("The app couldn't finish starting", {
      id: "boot-failure",
      description: diagnosis,
      duration: 15000,
      action: {
        label: "Diagnostics",
        onClick: () => { void copy(); setShowDiag(true); },
      },
    });
  }, [stuck, diagnosis]);

  const message = stuck
    ? (online
        ? countdown !== null
          ? `Reconnecting automatically in ${Math.max(countdown, 0)}s… (attempt ${attempts + 1})`
          : "Connection detected — retrying automatically…"
        : "You're offline. We'll retry automatically once you reconnect.")
    : slow
      ? "Still loading — hang tight…"
      : label;

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center"
      data-testid="loader-fullscreen"
    >
      <BootDiagnosticsPanel open={showDiag} reason={diagnosis} onClose={() => setShowDiag(false)} />
      <div className="flex flex-col items-center gap-3">
        <div
          role="presentation"
          onClick={() => {
            const n = logoTaps + 1;
            setLogoTaps(n);
            if (n >= 5) { setLogoTaps(0); setShowDiag(true); }
          }}
          className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg cursor-default select-none"
        >
          <span className="text-primary-foreground font-black text-2xl">N</span>
        </div>
        <p className="text-lg font-bold text-foreground">NETLIFE CASH</p>
      </div>
      {!stuck && (
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`w-2.5 h-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-destructive"} animate-pulse`}
          aria-hidden
        />
        <span>{online ? "Online — connected" : "Offline — waiting for connectivity"}</span>
      </div>
      {attempts > 0 && (
        <p className="text-[11px] text-muted-foreground font-mono">
          Resumed after retry #{attempts} · backoff step {getBackoffStep()}
          {lastStep ? ` · last step: ${lastStep}` : ""}
        </p>
      )}
      <p className={`text-sm ${stuck ? "text-destructive" : "text-muted-foreground"} max-w-xs`}>
        {message}
      </p>
      {stuck && (
        <p className="text-xs text-muted-foreground max-w-sm font-mono break-words">
          {diagnosis ?? "Checking network, backend and session…"}
        </p>
      )}
      {stuck && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => { commitRetry(); window.location.reload(); }}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow hover:opacity-90"
          >
            Retry now
          </button>
          <button
            type="button"
            onClick={() => setShowDiag(true)}
            className="text-[11px] underline text-muted-foreground"
          >
            Diagnostics
          </button>
        </div>
      )}
    </div>
  );
};

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

// ── Global overlays (displaced-session + mobile-browser verify) ──────────────
// Rendered as a sibling of AppRoutes so they're always in the tree and never
// blocked by early returns inside AppRoutes.
const GlobalOverlays = () => {
  const { user, loading, displacedByDevice } = useAuth();
  const [showDisplaced, setShowDisplaced] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (displacedByDevice) setShowDisplaced(true);
  }, [displacedByDevice]);

  const handleDisplacedClose = () => {
    setShowDisplaced(false);
    navigate("/auth", { replace: true });
  };

  return (
    <>
      <DisplacedSessionDialog open={showDisplaced} onClose={handleDisplacedClose} />
      <MobileBrowserVerifyDialog isLoggedIn={!loading && !!user} />
    </>
  );
};

const AppRoutes = () => {
  const { user, role, loading } = useAuth();
  useAutoPushSubscribe(user?.id);
  const { locked, unlock } = useAppLock();
  const navigate = useNavigate();
  const { setNavigate: setAlertNavigate } = useNewReleaseAlert(user?.id);

  // Give the release alert hook access to navigate
  useEffect(() => { setAlertNavigate((path) => navigate(path)); }, [navigate]);

  // Auto-show What's New on first launch after a new version
  useEffect(() => {
    if (!user) return;
    const seen = localStorage.getItem("vbank_whats_new_seen_v1_6_0");
    if (!seen) {
      const t = setTimeout(() => navigate("/whats-new"), 700);
      return () => clearTimeout(t);
    }
  }, [user?.id]);

  if (loading) return <FullScreenLoader />;
  if (locked && user) return <AppLockScreen onUnlock={unlock} />;

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
      <RoleGuard allow={["client"]}>
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
        <Route path="/leaderboard" element={<Leaderboard />} />
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
        <Route path="/savings-accounts" element={<SavingsAccounts />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/international-transfers" element={<InternationalTransfers />} />
        <Route path="/group-payments" element={<GroupPayments />} />
        <Route path="/credit-builder" element={<CreditBuilder />} />
        <Route path="/multi-wallet" element={<MultiWallet />} />
        <Route path="/role-management" element={<RoleManagement />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/business-banking" element={<BusinessBanking />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/financial-tools" element={<FinancialTools />} />
        <Route path="/invoicing" element={<MerchantInvoicing />} />
        <Route path="/gamification" element={<Gamification />} />
        <Route path="/security-operations" element={<SecurityOperationsCenter />} />
        <Route path="/cards-hub" element={<CardsHub />} />
        <Route path="/financing" element={<FinancingHub />} />
        <Route path="/support" element={<SupportCenter />} />
        <Route path="/chat" element={<ChatInbox />} />
        <Route path="/chat/:peerId" element={<ChatThread />} />
        <Route path="/beneficiaries" element={<Beneficiaries />} />
        <Route path="/virtual-cards" element={<VirtualCards />} />
        <Route path="/insights" element={<FinancialInsights />} />
        <Route path="/scheduled-payments" element={<ScheduledPayments />} />
        <Route path="/split-bills" element={<SplitBills />} />
        <Route path="/currency-converter" element={<CurrencyConverter />} />
        <Route path="/ai-assistant" element={<AIFinancialAssistant />} />
        <Route path="/whats-new" element={<WhatsNew />} />
        <Route path="/recommendations" element={<PersonalizedRecommendations />} />
        <Route path="/nfc-payment" element={<NFCTapPayment />} />
        <Route path="/open-banking" element={<OpenBanking />} />
        <Route path="/download-app" element={<DownloadApp />} />
        <Route path="/verify-whatsapp" element={<VerifyWhatsApp />} />
        <Route path="/whatsapp-guide" element={<WhatsAppGuide />} />
        <Route path="/" element={<Navigate to="/client" replace />} />
        <Route path="/index" element={<Navigate to="/client" replace />} />
        <Route path="*" element={<Navigate to="/client" replace />} />
      </Routes>
      </RoleGuard>
    );
  }

  if (role === "vendor") {
    return (
      <RoleGuard allow={["vendor"]}>
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
        <Route path="/currency-converter" element={<CurrencyConverter />} />
        <Route path="/ai-assistant" element={<AIFinancialAssistant />} />
        <Route path="/whats-new" element={<WhatsNew />} />
        <Route path="/recommendations" element={<PersonalizedRecommendations />} />
        <Route path="/nfc-payment" element={<NFCTapPayment />} />
        <Route path="/open-banking" element={<OpenBanking />} />
        <Route path="/download-app" element={<DownloadApp />} />
        <Route path="/whatsapp-guide" element={<WhatsAppGuide />} />
        <Route path="/" element={<Navigate to="/vendor" replace />} />
        <Route path="/index" element={<Navigate to="/vendor" replace />} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Routes>
      </RoleGuard>
    );
  }

  if (role === "agent") {
    return (
      <RoleGuard allow={["agent"]}>
      <Routes>
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/agent-deposit" element={<AgentDeposit />} />
        <Route path="/agent-cash-withdrawal" element={<AgentCashWithdrawal />} />
        <Route path="/print-qr" element={<AdminPrintQRCodes />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/kyc" element={<KYCSubmission />} />
        <Route path="/currency-converter" element={<CurrencyConverter />} />
        <Route path="/ai-assistant" element={<AIFinancialAssistant />} />
        <Route path="/whats-new" element={<WhatsNew />} />
        <Route path="/recommendations" element={<PersonalizedRecommendations />} />
        <Route path="/nfc-payment" element={<NFCTapPayment />} />
        <Route path="/open-banking" element={<OpenBanking />} />
        <Route path="/download-app" element={<DownloadApp />} />
        <Route path="/whatsapp-guide" element={<WhatsAppGuide />} />
        <Route path="/" element={<Navigate to="/agent" replace />} />
        <Route path="/index" element={<Navigate to="/agent" replace />} />
        <Route path="*" element={<Navigate to="/agent" replace />} />
      </Routes>
      </RoleGuard>
    );
  }

  if (role === "admin") {
    return (
      <RoleGuard allow={["admin"]}>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><ManageUsers /></ProtectedRoute>} />
        <Route path="/admin/agents" element={<ProtectedRoute allowedRoles={["admin"]}><ManageAgents /></ProtectedRoute>} />
        <Route path="/admin/vendors" element={<ProtectedRoute allowedRoles={["admin"]}><ManageVendors /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><SystemSettings /></ProtectedRoute>} />
        <Route path="/admin/whatsapp-verification" element={<ProtectedRoute allowedRoles={["admin"]}><AdminWhatsAppVerification /></ProtectedRoute>} />
        <Route path="/whatsapp-guide" element={<WhatsAppGuide />} />
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
        <Route path="/admin/ai-defense" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAIDefense /></ProtectedRoute>} />
        <Route path="/admin/firewall" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFirewall /></ProtectedRoute>} />
        <Route path="/admin/litenode" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLitenode /></ProtectedRoute>} />
        <Route path="/admin/rpc-node" element={<ProtectedRoute allowedRoles={["admin"]}><AdminRPCNode /></ProtectedRoute>} />
        <Route path="/admin/node-config" element={<ProtectedRoute allowedRoles={["admin"]}><AdminNodeConfig /></ProtectedRoute>} />
        <Route path="/admin/app-releases" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAppReleases /></ProtectedRoute>} />
        <Route path="/admin/themes" element={<ProtectedRoute allowedRoles={["admin"]}><AdminThemes /></ProtectedRoute>} />
        <Route path="/admin/app-manager" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAppManager /></ProtectedRoute>} />
        <Route path="/admin/boot-errors" element={<ProtectedRoute allowedRoles={["admin"]}><AdminBootErrors /></ProtectedRoute>} />
        <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAuditLogs /></ProtectedRoute>} />
        <Route path="/admin/kyc-review" element={<ProtectedRoute allowedRoles={["admin"]}><AdminKYCReview /></ProtectedRoute>} />
        <Route path="/admin/alerts" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSuspiciousAlerts /></ProtectedRoute>} />
        <Route path="/admin/announcements" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAnnouncements /></ProtectedRoute>} />
        <Route path="/admin/countries" element={<ProtectedRoute allowedRoles={["admin"]}><AdminCountries /></ProtectedRoute>} />
        <Route path="/admin/console" element={<ProtectedRoute allowedRoles={["admin"]}><AdminConsole /></ProtectedRoute>} />
        <Route path="/admin/apk-builder" element={<ProtectedRoute allowedRoles={["admin"]}><AdminApkBuilder /></ProtectedRoute>} />
        <Route path="/admin/download-poster" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDownloadPoster /></ProtectedRoute>} />
        <Route path="/admin/send-update" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSendUpdate /></ProtectedRoute>} />
        <Route path="/admin/password-resets" element={<ProtectedRoute allowedRoles={["admin"]}><AdminPasswordResets /></ProtectedRoute>} />
        <Route path="/admin/legal" element={<ProtectedRoute allowedRoles={["admin"]}><LegalCompliance /></ProtectedRoute>} />
        <Route path="/admin/rewards" element={<ProtectedRoute allowedRoles={["admin"]}><AdminRewards /></ProtectedRoute>} />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/currency-converter" element={<CurrencyConverter />} />
        <Route path="/whats-new" element={<WhatsNew />} />
        <Route path="/recommendations" element={<PersonalizedRecommendations />} />
        <Route path="/nfc-payment" element={<NFCTapPayment />} />
        <Route path="/api-integrations" element={<APIIntegrations />} />
        <Route path="/open-banking" element={<OpenBanking />} />
        <Route path="/download-app" element={<DownloadApp />} />
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/index" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      </RoleGuard>
    );
  }

  // Logged in but role couldn't be determined — show a friendly waiting screen
  // rather than a 404. This happens when user_roles table is empty or missing.
  return (
    <Routes>
      <Route path="*" element={
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <span className="text-primary-foreground font-black text-2xl">N</span>
          </div>
          <p className="text-lg font-bold text-foreground">NETLIFE CASH</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your account is being set up. Please wait a moment or sign out and back in.
          </p>
          <button
            type="button"
            onClick={async () => {
              const { supabase } = await import("@/integrations/supabase/client");
              await supabase.auth.signOut();
            }}
            className="mt-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow hover:opacity-90"
          >
            Sign Out
          </button>
        </div>
      } />
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
            <GlobalOverlays />
            <Suspense fallback={<FullScreenLoader />}>
              <AppRoutes />
            </Suspense>
            <UpdateBanner />
            <IncidentBanner />
          </ForceUpdateGate>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
