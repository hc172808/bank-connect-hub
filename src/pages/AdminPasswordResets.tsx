import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, KeyRound, RefreshCw, Trash2, Send, Search,
  ShieldAlert, Clock, CheckCircle2, XCircle, Eye, EyeOff,
  PhoneCall, User,
} from "lucide-react";

interface PendingReset {
  email: string;
  phone: string | null;
  expiresAt: number;
  expired: boolean;
  attempts: number;
  verified: boolean;
}

interface UserRecord {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  createdAt: string;
  lastSignIn: string | null;
}

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function expiresIn(ts: number) {
  const diff = ts - Date.now();
  if (diff <= 0) return "Expired";
  const m = Math.ceil(diff / 60000);
  return `${m}m left`;
}

function generatePassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function AdminPasswordResets() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [pending, setPending] = useState<PendingReset[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [adminAvailable, setAdminAvailable] = useState<boolean | null>(null);

  // Reset dialog
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const r = await fetch("/api/auth/pending-resets");
      const data = await r.json();
      setPending(data.requests || []);
    } catch {
      /* ignore */
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const r = await fetch("/api/auth/all-users");
      if (r.status === 503) {
        setAdminAvailable(false);
        return;
      }
      const data = await r.json();
      setAdminAvailable(true);
      setUsers(data.users || []);
    } catch {
      setAdminAvailable(false);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    fetchUsers();
    const t = setInterval(fetchPending, 15000);
    return () => clearInterval(t);
  }, [fetchPending, fetchUsers]);

  const deletePending = async (email: string) => {
    await fetch(`/api/auth/pending-resets/${encodeURIComponent(email)}`, { method: "DELETE" });
    setPending((p) => p.filter((x) => x.email !== email));
    toast({ title: "Request dismissed" });
  };

  const openReset = (user: UserRecord) => {
    setResetTarget(user);
    setNewPassword(generatePassword());
    setSendSms(true);
    setShowPass(false);
  };

  const doReset = async () => {
    if (!resetTarget || !newPassword) return;
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters", variant: "destructive" });
      return;
    }
    setResetting(true);
    try {
      const r = await fetch("/api/auth/admin-set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: resetTarget.id,
          newPassword,
          notifyPhone: sendSms ? (resetTarget.phone || null) : null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Reset failed");

      toast({
        title: "Password reset!",
        description: sendSms && resetTarget.phone
          ? `New password sent to ${resetTarget.phone} via SMS.`
          : "Password updated. Share the new password with the user securely.",
      });

      // Remove any pending OTP request for this user
      const userEmail = resetTarget.email;
      setPending((p) => p.filter((x) => x.email !== userEmail));
      setResetTarget(null);
    } catch (err: unknown) {
      toast({ title: "Reset failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q)
    );
  });

  // Users who have pending reset requests
  const pendingEmails = new Set(pending.map((p) => p.email));

  return (
    <div className="min-h-screen bg-background p-4 pb-20 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" />
            Password Resets
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage user reset requests and manually set passwords
          </p>
        </div>
      </div>

      {/* Pending OTP Requests */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Pending Reset Requests
                {pending.length > 0 && (
                  <Badge variant="destructive" className="text-xs">{pending.length}</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Users who requested a reset via the app — OTP sent via SMS
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchPending} disabled={loadingPending}>
              <RefreshCw className={`h-4 w-4 ${loadingPending ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <p className="text-sm">No pending reset requests</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((req) => {
                const matchedUser = users.find((u) => u.email === req.email);
                return (
                  <div
                    key={req.email}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      req.expired ? "border-muted bg-muted/30" : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <div className={`p-2 rounded-full ${req.expired ? "bg-muted" : "bg-amber-500/10"}`}>
                      {req.verified ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : req.expired ? (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {matchedUser?.fullName || req.email.split("@")[0]}
                        </span>
                        {req.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <PhoneCall className="h-3 w-3" />{req.phone}
                          </span>
                        )}
                        <Badge
                          variant={req.expired ? "secondary" : req.verified ? "default" : "outline"}
                          className="text-xs"
                        >
                          {req.verified ? "OTP Verified" : req.expired ? "Expired" : expiresIn(req.expiresAt)}
                        </Badge>
                        {req.attempts > 0 && (
                          <span className="text-xs text-muted-foreground">{req.attempts} attempt{req.attempts !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{req.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {matchedUser && (
                        <Button
                          size="sm"
                          onClick={() => openReset(matchedUser)}
                          className="h-8 text-xs"
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          Reset
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deletePending(req.email)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Users — Manual Reset */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                All Users
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {adminAvailable === false
                  ? "Add SUPABASE_SERVICE_ROLE_KEY to Replit Secrets to enable manual resets"
                  : "Manually reset any user's password and notify them via SMS"}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={fetchUsers} disabled={loadingUsers}>
              <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {adminAvailable !== false && (
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 text-sm"
                placeholder="Search by name, phone, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {adminAvailable === false ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
              <ShieldAlert className="h-10 w-10 text-amber-500" />
              <p className="text-sm font-medium">Service Role Key Required</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Go to <strong>Supabase → Project Settings → API</strong> and copy the
                <strong> Service Role</strong> key. Add it as <code className="bg-muted px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> in Replit Secrets.
              </p>
            </div>
          ) : loadingUsers ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Last Sign In</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                            {(u.fullName || u.email || "?")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium truncate">
                                {u.fullName || "Unknown"}
                              </span>
                              {pendingEmails.has(u.email) && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Reset Pending
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {u.phone || <span className="italic opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {timeAgo(u.lastSignIn)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={pendingEmails.has(u.email) ? "default" : "outline"}
                          className="h-8 text-xs"
                          onClick={() => openReset(u)}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) setResetTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Reset Password
            </DialogTitle>
          </DialogHeader>

          {resetTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-sm font-medium">{resetTarget.fullName || "User"}</p>
                <p className="text-xs text-muted-foreground">{resetTarget.email}</p>
                {resetTarget.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <PhoneCall className="h-3 w-3" />
                    {resetTarget.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">New Password</label>
                <div className="relative">
                  <Input
                    type={showPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10 font-mono text-sm"
                    placeholder="Min 6 characters"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPass((v) => !v)}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground px-0"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  ↻ Generate new password
                </Button>
              </div>

              {resetTarget.phone && (
                <div
                  className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                    sendSms ? "border-primary/50 bg-primary/5" : "border-muted"
                  }`}
                  onClick={() => setSendSms((v) => !v)}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                    sendSms ? "bg-primary border-primary" : "border-muted-foreground"
                  }`}>
                    {sendSms && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Send password via SMS</p>
                    <p className="text-xs text-muted-foreground">
                      Text the new password to {resetTarget.phone}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>
              Cancel
            </Button>
            <Button onClick={doReset} disabled={resetting || !newPassword}>
              {resetting ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Resetting…</>
              ) : (
                <><Send className="h-4 w-4 mr-1.5" /> Reset Password</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
