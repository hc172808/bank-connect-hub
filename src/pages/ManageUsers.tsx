import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatEther, isAddress } from "ethers";
import { supabase } from "@/integrations/supabase/client";
import { buildRpcList, getProviderWithFallback } from "@/lib/rpcFallback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, ExternalLink, Ban, CheckCircle2, Trash2, UserPlus, KeyRound, Eye, EyeOff, MessageCircle, Loader2, RefreshCw, SlidersHorizontal, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";
import { useAuth } from "@/hooks/useAuth";
import { CLIENT_MENU_FEATURES } from "@/lib/clientMenuFeatures";
import {
  fetchAdminUserFeatureAccess,
  updateAdminUserFeatureAccess,
} from "@/lib/userFeatureAccess";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface User {
  id: string;
  email?: string | null;
  full_name: string | null;
  phone_number: string | null;
  wallet_address: string | null;
  role: string;
  walletBalance?: number | null;
  walletCurrency?: string | null;
  hasWallet?: boolean;
  balanceRestricted?: boolean;
  onChainBalance?: {
    status: "loading" | "ready" | "error";
    value?: string;
  };
  disabled?: boolean;
  emailConfirmed?: boolean;
  phoneVerified?: boolean;
  verificationStatus?: string;
  kycStatus?: string;
}

interface AdminUserRecord {
  id: string;
  email?: string | null;
  fullName?: string | null;
  phone?: string | null;
  walletAddress?: string | null;
  disabled?: boolean;
  role?: string;
  emailConfirmed?: boolean;
  phoneVerified?: boolean;
  verificationStatus?: string;
  kycStatus?: string;
}

interface AdminUsersResponse {
  users?: AdminUserRecord[];
  error?: string;
}

interface BlockchainSettings {
  explorer_url: string | null;
  is_active: boolean;
  rpc_url: string | null;
  rpc_urls: string[];
  chain_id: string | null;
  native_coin_symbol: string | null;
}

function generateTemporaryPassword(length = 12) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function formatNativeBalance(value: bigint) {
  const [whole, fraction = ""] = formatEther(value).split(".");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  const formattedWhole = BigInt(whole).toLocaleString();
  return trimmedFraction ? `${formattedWhole}.${trimmedFraction}` : formattedWhole;
}

const ManageUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletBalancesUnavailable, setWalletBalancesUnavailable] = useState(false);
  const [blockchainSettings, setBlockchainSettings] = useState<BlockchainSettings | null>(null);
  const [newUser, setNewUser] = useState({ fullName: "", phone: "", password: "" });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role: staffRole } = useAuth();
  const staffHome = staffRole === "agent" ? "/agent" : "/admin";
  const isAdmin = staffRole === "admin" || staffRole === "founder";
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [passwordStep, setPasswordStep] = useState<"admin" | "agent-request" | "agent-confirm">("admin");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [maskedResetPhone, setMaskedResetPhone] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [whatsappCode, setWhatsappCode] = useState("");
  const [passwordResetting, setPasswordResetting] = useState(false);
  const [featureTarget, setFeatureTarget] = useState<User | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>({});
  const [featureLoading, setFeatureLoading] = useState(false);
  const [featureUpdating, setFeatureUpdating] = useState<string | null>(null);

  const fetchBlockchainSettings = useCallback(async () => {
    const { data } = await supabase
      .from("blockchain_settings_public")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (data) {
      const row = data as unknown as Record<string, unknown>;
      const rpcUrls = Array.isArray(row.rpc_urls)
        ? row.rpc_urls.filter((url): url is string => typeof url === "string")
        : [];
      setBlockchainSettings({
        explorer_url: typeof row.explorer_url === "string" ? row.explorer_url : null,
        is_active: row.is_active === true,
        rpc_url: typeof row.rpc_url === "string" ? row.rpc_url : null,
        rpc_urls: rpcUrls,
        chain_id: typeof row.chain_id === "string" || typeof row.chain_id === "number"
          ? String(row.chain_id)
          : null,
        native_coin_symbol: typeof row.native_coin_symbol === "string" ? row.native_coin_symbol : null,
      });
    }
  }, []);

  const refreshOnChainBalance = useCallback(async (user: User) => {
    if (!user.wallet_address || (staffRole === "agent" && user.role !== "client" && user.role !== "vendor")) {
      return;
    }

    const address = user.wallet_address.trim();
    if (!isAddress(address)) {
      setUsers((current) => current.map((item) =>
        item.id === user.id ? { ...item, onChainBalance: { status: "error" } } : item
      ));
      return;
    }

    setUsers((current) => current.map((item) =>
      item.id === user.id ? { ...item, onChainBalance: { status: "loading" } } : item
    ));

    let provider: Awaited<ReturnType<typeof getProviderWithFallback>> = null;
    try {
      const configuredUrls = buildRpcList({
        rpc_url: blockchainSettings?.rpc_url,
        rpc_urls: blockchainSettings?.rpc_urls,
      });
      provider = await getProviderWithFallback(
        configuredUrls.length ? configuredUrls : ["https://rpc.netlifegy.com"],
      );
      if (!provider) throw new Error("No configured RPC endpoint is available.");

      const network = await provider.getNetwork();
      const expectedChainId = BigInt(blockchainSettings?.chain_id || "198282");
      if (network.chainId !== expectedChainId) {
        throw new Error("The configured RPC is connected to a different network.");
      }

      const balance = await provider.getBalance(address);
      setUsers((current) => current.map((item) =>
        item.id === user.id
          ? { ...item, onChainBalance: { status: "ready", value: formatNativeBalance(balance) } }
          : item
      ));
    } catch {
      setUsers((current) => current.map((item) =>
        item.id === user.id ? { ...item, onChainBalance: { status: "error" } } : item
      ));
    } finally {
      provider?.destroy();
    }
  }, [blockchainSettings, staffRole]);

  const attachWalletBalances = useCallback(async (loadedUsers: User[]) => {
    const isRestrictedForAgent = (user: User) =>
      staffRole === "agent" && user.role !== "client" && user.role !== "vendor";
    const visibleUsers = staffRole === "agent"
      ? loadedUsers.filter((user) => user.role === "client" || user.role === "vendor")
      : loadedUsers;

    if (visibleUsers.length === 0) {
      setWalletBalancesUnavailable(false);
      return loadedUsers.map((user) => ({
        ...user,
        walletBalance: null,
        walletCurrency: null,
        hasWallet: false,
        balanceRestricted: isRestrictedForAgent(user),
      }));
    }

    const { data: wallets, error } = await supabase
      .from("wallets")
      .select("user_id, balance, currency")
      .in("user_id", visibleUsers.map((user) => user.id));

    if (error) {
      console.error("Error fetching visible wallet balances:", error);
      setWalletBalancesUnavailable(true);
      return loadedUsers.map((user) => ({
        ...user,
        walletBalance: null,
        walletCurrency: null,
        hasWallet: false,
        balanceRestricted: isRestrictedForAgent(user),
      }));
    }

    setWalletBalancesUnavailable(false);
    const walletsByUser = new Map((wallets || []).map((wallet) => [wallet.user_id, wallet]));
    return loadedUsers.map((user) => {
      const balanceRestricted = isRestrictedForAgent(user);
      const wallet = balanceRestricted ? undefined : walletsByUser.get(user.id);
      return {
        ...user,
        walletBalance: wallet ? Number(wallet.balance) : null,
        walletCurrency: wallet?.currency || null,
        hasWallet: Boolean(wallet),
        balanceRestricted,
      };
    });
  }, [staffRole]);

  const fetchUsers = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
      const response = await fetch("/api/auth/all-users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({})) as AdminUsersResponse;
      let loadedUsers: User[];
      if (response.ok) {
        loadedUsers = (result.users || []).map((item) => ({
          id: item.id,
          email: item.email || null,
          full_name: item.fullName || null,
          phone_number: item.phone || null,
          wallet_address: item.walletAddress || null,
          disabled: Boolean(item.disabled),
          role: item.role || "client",
           emailConfirmed: Boolean(item.emailConfirmed),
           phoneVerified: Boolean(item.phoneVerified),
           verificationStatus: item.verificationStatus || "pending",
           kycStatus: item.kycStatus || "unverified",
        }));
      } else {
        // Listing auth.users requires the optional service-role key. Fall back
        // to the authenticated staff session so the page still works when the
        // build server is intentionally configured without that secret.
        const [{ data: profiles, error: profilesError }, { data: roleRows, error: rolesError }] = await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase.from("user_roles").select("user_id, role"),
        ]);
        if (profilesError) throw profilesError;
        if (rolesError) throw rolesError;

        const rolesByUser = new Map((roleRows || []).map((row) => [row.user_id, row.role]));
        loadedUsers = (profiles || []).map((profile) => ({
          id: profile.id,
          email: null,
          full_name: profile.full_name || null,
          phone_number: profile.phone_number || null,
          wallet_address: profile.wallet_address || null,
          disabled: Boolean(profile.disabled),
          role: rolesByUser.get(profile.id) || "client",
          emailConfirmed: false,
          phoneVerified: false,
          verificationStatus: "pending",
          kycStatus: profile.kyc_status || "unverified",
        }));
        if (result.error) {
          console.info("Using authenticated profile list for Manage Users:", result.error);
        }
      }

      setUsers(await attachWalletBalances(loadedUsers));
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message || "Failed to load users.",
      });
    } finally {
      setLoading(false);
    }
  }, [attachWalletBalances, toast]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      void fetchUsers();
      void fetchBlockchainSettings();
    });
    return () => {
      disposed = true;
    };
  }, [fetchUsers, fetchBlockchainSettings]);

  const updateUserRole = async (userId: string, newRole: "admin" | "agent" | "client" | "vendor" | "founder") => {
    try {
      if (!isAdmin) throw new Error("Only admins and founders can change user roles.");
      const token = await getStaffSession();
      const response = await fetch(`/api/auth/users/${encodeURIComponent(userId)}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to update role.");

      toast({ title: "Role updated successfully" });
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast({ title: "Failed to update role", description: (error as Error).message, variant: "destructive" });
    }
  };

  const openPasswordReset = (user: User) => {
    setPasswordTarget(user);
    setTemporaryPassword(generateTemporaryPassword());
    setShowTemporaryPassword(false);
    setChallengeId("");
    setMaskedResetPhone("");
    setIdCardNumber("");
    setWhatsappCode("");
    setPasswordStep(isAdmin ? "admin" : "agent-request");
  };

  const closePasswordReset = () => {
    if (passwordResetting) return;
    setPasswordTarget(null);
    setChallengeId("");
    setMaskedResetPhone("");
    setIdCardNumber("");
    setWhatsappCode("");
  };

  const openFeatureAccess = async (user: User) => {
    if (user.role === "admin" || user.role === "founder") return;
    setFeatureTarget(user);
    setFeatureAccess({});
    setFeatureLoading(true);
    try {
      setFeatureAccess(await fetchAdminUserFeatureAccess(user.id));
    } catch (error) {
      setFeatureTarget(null);
      toast({
        title: "Could not load feature access",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setFeatureLoading(false);
    }
  };

  const toggleUserFeature = async (featureKey: string) => {
    if (!featureTarget) return;
    const nextValue = featureAccess[featureKey] === false;
    setFeatureUpdating(featureKey);
    try {
      await updateAdminUserFeatureAccess(featureTarget.id, featureKey, nextValue);
      setFeatureAccess((current) => ({ ...current, [featureKey]: nextValue }));
      toast({
        title: nextValue ? "Feature enabled" : "Feature disabled",
        description: `${CLIENT_MENU_FEATURES.find((feature) => feature.featureKey === featureKey)?.label || "Feature"} updated for ${featureTarget.full_name || "this user"}.`,
      });
    } catch (error) {
      toast({
        title: "Could not update feature",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setFeatureUpdating(null);
    }
  };

  const getStaffSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
    return session.access_token;
  };

  const requestAgentPasswordReset = async () => {
    if (!passwordTarget) return;
    setPasswordResetting(true);
    try {
      const token = await getStaffSession();
      const response = await fetch("/api/auth/staff-password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: passwordTarget.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send the WhatsApp code.");
      setChallengeId(result.challengeId);
      setMaskedResetPhone(result.masked || passwordTarget.phone_number || "");
      setPasswordStep("agent-confirm");
      toast({ title: "WhatsApp code sent", description: `Ask the user for the code sent to ${result.masked || "their WhatsApp number"}.` });
    } catch (error) {
      toast({ title: "Could not send recovery code", description: (error as Error).message, variant: "destructive" });
    } finally {
      setPasswordResetting(false);
    }
  };

  const submitPasswordReset = async () => {
    if (!passwordTarget) return;
    if (temporaryPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setPasswordResetting(true);
    try {
      const token = await getStaffSession();
      const endpoint = passwordStep === "admin"
        ? "/api/auth/admin-set-password"
        : "/api/auth/staff-password-reset/confirm";
      const body = passwordStep === "admin"
        ? { userId: passwordTarget.id, newPassword: temporaryPassword }
        : {
            challengeId,
            idCardNumber: idCardNumber.trim(),
            otp: whatsappCode.trim(),
            newPassword: temporaryPassword,
          };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Password reset failed.");

      toast({
        title: "Password changed",
        description: result.warning || (passwordStep === "admin"
          ? "The temporary password was sent through business WhatsApp."
          : "The user's password was reset after matching the ID card and WhatsApp code."),
        variant: result.warning ? "destructive" : "default",
      });
      closePasswordReset();
    } catch (error) {
      toast({ title: "Password reset failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setPasswordResetting(false);
    }
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    toast({ title: "Address copied to clipboard" });
  };

  const openExplorer = (address: string) => {
    if (blockchainSettings?.explorer_url) {
      window.open(`${blockchainSettings.explorer_url}/address/${address}`, '_blank');
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const toggleDisabled = async (user: User) => {
    const next = !user.disabled;
    const { error } = await supabase
      .from("profiles")
      .update({ disabled: next, disabled_at: next ? new Date().toISOString() : null })
      .eq("id", user.id);
    if (error) {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "User disabled" : "User re-enabled" });
    fetchUsers();
  };

  const deleteUser = async (user: User) => {
    try {
      const token = await getStaffSession();
      const response = await fetch(`/api/auth/users/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not delete the user.");
      toast({ title: "User deleted" });
      fetchUsers();
    } catch (error) {
      toast({
        title: "Failed to delete user",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const verifyRegistration = async (user: User) => {
    try {
      const token = await getStaffSession();
      const response = await fetch(`/api/auth/users/${encodeURIComponent(user.id)}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not verify this registration.");
      toast({ title: "Registration verified", description: `${user.full_name || user.phone_number || "User"} can now continue.` });
      await fetchUsers();
    } catch (error) {
      toast({ title: "Verification failed", description: (error as Error).message, variant: "destructive" });
    }
  };

  const createUser = async () => {
    if (!newUser.fullName.trim() || !newUser.phone || newUser.password.length < 8) {
      toast({ title: "Complete all fields", description: "Use a name, a valid phone number, and a password of at least 8 characters.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
      const response = await fetch("/api/auth/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(newUser),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "User could not be created.");
      toast({ title: "User added", description: "The account was manually verified for the missing-code case. KYC is still required before financial features." });
      setNewUser({ fullName: "", phone: "", password: "" });
      void fetchUsers();
    } catch (error) {
      toast({ title: "Could not add user", description: (error as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button onClick={() => navigate(staffHome)} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Manage Users</h1>
            <p className="text-xs sm:text-sm text-foreground/70">Roles, recovery, account status, and client feature access</p>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Add a user manually</CardTitle>
            <p className="text-sm text-muted-foreground">Use this when the user cannot receive the WhatsApp code. This creates a client account and marks phone verification as staff-approved; KYC is still required.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <input className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Full name" value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} />
            <CountryPhoneInput value={newUser.phone} onChange={(phone) => setNewUser({ ...newUser, phone })} />
            <input className="h-10 rounded-md border bg-background px-3 text-sm" type="password" placeholder="Temporary password (8+ characters)" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <Button onClick={() => void createUser()} disabled={creating} className="gap-2">{creating ? "Adding user…" : <><UserPlus size={16} /> Add user</>}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
                  <span>All Users ({users.length})</span>
                  {blockchainSettings?.is_active && (
                    <Badge variant="secondary">Blockchain Active</Badge>
                  )}
            </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Users create or import their own blockchain wallet from Profile. Staff can see its public address here, never its private key. Internal balance is from the Supabase ledger; on-chain balance is read live from the configured RPC.
                </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                  <Table className="min-w-[1500px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Wallet Address</TableHead>
                      <TableHead>Registration</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead title="Native coin balance read live from the configured RPC">On-chain native</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name || "N/A"}</TableCell>
                        <TableCell>{user.phone_number || "N/A"}</TableCell>
                        <TableCell>
                          {user.wallet_address ? (
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {truncateAddress(user.wallet_address)}
                              </code>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => copyAddress(user.wallet_address!)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                              {blockchainSettings?.explorer_url && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => openExplorer(user.wallet_address!)}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No wallet</span>
                          )}
                        </TableCell>
                         <TableCell>
                           <Badge variant={user.phoneVerified && user.emailConfirmed ? "default" : "secondary"} className={user.phoneVerified && user.emailConfirmed ? "bg-green-600 text-white" : ""}>
                             {user.phoneVerified && user.emailConfirmed ? "Verified" : "Pending"}
                           </Badge>
                         </TableCell>
                         <TableCell>
                           <Badge variant={user.kycStatus === "verified" || user.kycStatus === "approved" ? "default" : user.kycStatus === "rejected" ? "destructive" : "secondary"} className={user.kycStatus === "verified" || user.kycStatus === "approved" ? "bg-green-600 text-white" : ""}>
                             {user.kycStatus || "unverified"}
                           </Badge>
                         </TableCell>
                        <TableCell>
                          <Badge variant={
                            user.role === 'admin' ? 'default' : 
                            user.role === 'agent' ? 'secondary' : 
                            user.role === 'vendor' ? 'destructive' : 'outline'
                          }>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.disabled ? (
                            <Badge variant="destructive">Disabled</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {user.balanceRestricted ? (
                            <span className="text-muted-foreground">Restricted</span>
                          ) : walletBalancesUnavailable ? (
                            <span className="text-muted-foreground">Unavailable</span>
                          ) : !user.hasWallet ? (
                            <span className="text-muted-foreground">No wallet</span>
                          ) : user.walletBalance === null || !Number.isFinite(user.walletBalance) ? (
                            <span className="text-muted-foreground">Unavailable</span>
                          ) : (
                            `${user.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${user.walletCurrency || "USD"}`
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {user.balanceRestricted ? (
                            <span className="text-muted-foreground">Restricted</span>
                          ) : !user.wallet_address ? (
                            <span className="text-muted-foreground">No wallet</span>
                          ) : !isAddress(user.wallet_address.trim()) ? (
                            <span className="text-muted-foreground">Invalid address</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              {user.onChainBalance?.status === "ready" ? (
                                <span>
                                  {user.onChainBalance.value} {blockchainSettings?.native_coin_symbol || "GYDS"}
                                </span>
                              ) : user.onChainBalance?.status === "loading" ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {user.onChainBalance?.status === "error" ? "Unavailable" : "Not loaded"}
                                </span>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2"
                                aria-label={`Read on-chain balance for ${user.full_name || "user"}`}
                                title="Read or refresh live balance from RPC"
                                disabled={user.onChainBalance?.status === "loading"}
                                onClick={() => void refreshOnChainBalance(user)}
                              >
                                {user.onChainBalance?.status === "loading" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                {user.onChainBalance?.status === "loading"
                                  ? "Reading"
                                  : user.onChainBalance?.status === "ready"
                                    ? "Refresh"
                                    : user.onChainBalance?.status === "error"
                                      ? "Retry"
                                      : "Read"}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={user.role}
                              onValueChange={(value) => updateUserRole(user.id, value as "admin" | "agent" | "client" | "vendor" | "founder")}
                              disabled={!isAdmin}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="client">Client</SelectItem>
                                <SelectItem value="vendor">Vendor</SelectItem>
                                <SelectItem value="agent">Agent</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="founder">Founder</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                               size="icon"
                               variant="ghost"
                               onClick={() => void verifyRegistration(user)}
                               disabled={!isAdmin || Boolean(user.phoneVerified && user.emailConfirmed)}
                               title={user.phoneVerified && user.emailConfirmed ? "Registration verified" : "Verify registration"}
                             >
                               <UserCheck className={`w-4 h-4 ${user.phoneVerified && user.emailConfirmed ? "text-green-600" : "text-primary"}`} />
                             </Button>
                             <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void openFeatureAccess(user)}
                              disabled={user.role === "admin" || user.role === "founder"}
                              title={user.role === "admin" || user.role === "founder" ? "Admin and founder features are always enabled" : "Manage client menu features"}
                            >
                              <SlidersHorizontal className="w-4 h-4 text-primary" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openPasswordReset(user)}
                              title={isAdmin ? "Change password and notify via WhatsApp" : "Start ID and WhatsApp password recovery"}
                            >
                              <KeyRound className="w-4 h-4 text-primary" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleDisabled(user)}
                              title={user.disabled ? "Re-enable user" : "Disable user"}
                            >
                              {user.disabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Ban className="w-4 h-4 text-amber-600" />}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" title="Delete user">
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This permanently removes {user.full_name || user.phone_number || "the user"} and their auth account. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteUser(user)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!featureTarget} onOpenChange={(open) => { if (!open && !featureUpdating) setFeatureTarget(null); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              Client menu access
            </DialogTitle>
            <DialogDescription>
              {featureTarget?.full_name || featureTarget?.phone_number || "Selected user"} · Turn individual menu features on or off.
            </DialogDescription>
          </DialogHeader>

          {featureLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-y-auto pr-1 space-y-5">
              {(["Account", "Financial Tools", "Dashboard Services", "Other"] as const).map((section) => (
                <section key={section} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{section}</h3>
                    <span className="text-xs text-muted-foreground">
                      {CLIENT_MENU_FEATURES.filter((feature) => feature.section === section && featureAccess[feature.featureKey] !== false).length} enabled
                    </span>
                  </div>
                  <div className="rounded-lg border divide-y">
                    {CLIENT_MENU_FEATURES.filter((feature) => feature.section === section).map((feature) => {
                      const enabled = featureAccess[feature.featureKey] !== false;
                      return (
                        <div key={feature.featureKey} className="flex items-center justify-between gap-4 p-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{feature.label}</p>
                            <p className="text-xs text-muted-foreground truncate">{feature.path}</p>
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => void toggleUserFeature(feature.featureKey)}
                            disabled={featureUpdating === feature.featureKey}
                            aria-label={`${enabled ? "Disable" : "Enable"} ${feature.label}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeatureTarget(null)} disabled={!!featureUpdating}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordTarget} onOpenChange={(open) => { if (!open) closePasswordReset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {isAdmin ? "Change user password" : "Agent password recovery"}
            </DialogTitle>
            <DialogDescription>
              {passwordTarget?.full_name || passwordTarget?.phone_number || "Selected user"}
            </DialogDescription>
          </DialogHeader>

          {passwordStep === "agent-request" ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">Send a verification code</p>
                <p className="mt-1 text-muted-foreground">
                  A one-time code will be sent to the user's WhatsApp number. The user must give you that code and their ID card number.
                </p>
              </div>
              <Button className="w-full" onClick={() => void requestAgentPasswordReset()} disabled={passwordResetting}>
                {passwordResetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                Send code to user WhatsApp
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {passwordStep === "agent-confirm" && (
                <>
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-sm">
                    <p className="font-medium flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-600" /> Code sent to {maskedResetPhone}</p>
                    <p className="mt-1 text-muted-foreground">Do not accept a code from anyone other than the account holder.</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">ID card number</label>
                    <Input value={idCardNumber} onChange={(event) => setIdCardNumber(event.target.value)} placeholder="Enter the number from the user's submitted ID card" autoComplete="off" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">WhatsApp code</label>
                    <Input value={whatsappCode} onChange={(event) => setWhatsappCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm font-medium">{isAdmin ? "Temporary password" : "New password"}</label>
                <div className="relative">
                  <Input
                    type={showTemporaryPassword ? "text" : "password"}
                    value={temporaryPassword}
                    onChange={(event) => setTemporaryPassword(event.target.value)}
                    className="pr-10 font-mono"
                    autoComplete="new-password"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowTemporaryPassword((visible) => !visible)}>
                    {showTemporaryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Use at least 8 characters.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePasswordReset} disabled={passwordResetting}>Cancel</Button>
            {passwordStep === "agent-confirm" || passwordStep === "admin" ? (
              <Button onClick={() => void submitPasswordReset()} disabled={passwordResetting || (passwordStep === "agent-confirm" && (!idCardNumber.trim() || whatsappCode.length !== 6))}>
                {passwordResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change password
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageUsers;
