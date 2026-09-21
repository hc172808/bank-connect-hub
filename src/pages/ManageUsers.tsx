import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, ExternalLink, Ban, CheckCircle2, Trash2, UserPlus, KeyRound, Eye, EyeOff, MessageCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";
import { useAuth } from "@/hooks/useAuth";
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
  disabled?: boolean;
}

interface BlockchainSettings {
  explorer_url: string | null;
  is_active: boolean;
}

function generateTemporaryPassword(length = 12) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const ManageUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchUsers();
    fetchBlockchainSettings();
  }, []);

  const fetchBlockchainSettings = async () => {
    const { data } = await supabase
      .from("blockchain_settings")
      .select("explorer_url, is_active")
      .single();
    
    if (data) {
      setBlockchainSettings(data);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
      const response = await fetch("/api/auth/all-users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setUsers((result.users || []).map((item: any) => ({
          id: item.id,
          email: item.email || null,
          full_name: item.fullName || null,
          phone_number: item.phone || null,
          wallet_address: item.walletAddress || null,
          disabled: Boolean(item.disabled),
          role: item.role || "client",
        })));
        return;
      }

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
      setUsers((profiles || []).map((profile) => ({
        id: profile.id,
        email: null,
        full_name: profile.full_name || null,
        phone_number: profile.phone_number || null,
        wallet_address: profile.wallet_address || null,
        disabled: Boolean(profile.disabled),
        role: rolesByUser.get(profile.id) || "client",
      })));
      if (result.error) {
        console.info("Using authenticated profile list for Manage Users:", result.error);
      }
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
  };

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
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: user.id },
    });
    if (error || (data as any)?.error) {
      toast({
        title: "Failed to delete user",
        description: (data as any)?.error || error?.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "User deleted" });
    fetchUsers();
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
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate(staffHome)} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Manage Users</h1>
        </div>
      </header>

      <main className="p-6">
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
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Wallet Address</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
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
