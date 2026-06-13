import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Phone, Loader2, ShieldCheck, MessageCircle,
  KeyRound, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Step = "phone" | "otp" | "newpass" | "done";
type Method = "otp" | "support";

const COUNTRY_CODES = [
  { code: "+592", label: "🇬🇾 GY +592" },
  { code: "+1",   label: "🇺🇸 US +1"  },
  { code: "+44",  label: "🇬🇧 UK +44" },
  { code: "+1868",label: "🇹🇹 TT +1868"},
  { code: "+1246",label: "🇧🇧 BB +1246"},
  { code: "+1876",label: "🇯🇲 JM +1876"},
  { code: "+55",  label: "🇧🇷 BR +55" },
  { code: "+91",  label: "🇮🇳 IN +91" },
];

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 6,
    password.length >= 10,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-blue-400", "bg-green-500"];
  const labels = ["", "Very weak", "Weak", "Fair", "Good", "Strong"];
  if (!password) return null;
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <p className={`text-[11px] font-medium ${score <= 2 ? "text-red-500" : score <= 3 ? "text-yellow-600" : "text-green-600"}`}>
        {labels[score]}
      </p>
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep]             = useState<Step>("phone");
  const [method, setMethod]         = useState<Method>("otp");
  const [smsAvailable, setSmsAvailable] = useState<boolean | null>(null);
  const [adminAvailable, setAdminAvailable] = useState(false);

  const [countryCode, setCountryCode] = useState("+592");
  const [phone, setPhone]           = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otp, setOtp]               = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const whatsappNumber = import.meta.env.VITE_WHATSAPP_SUPPORT_NUMBER || "";

  useEffect(() => {
    fetch("/api/auth/reset-status")
      .then((r) => r.json())
      .then((d) => {
        setSmsAvailable(d.smsAvailable ?? false);
        setAdminAvailable(d.adminResetAvailable ?? false);
      })
      .catch(() => setSmsAvailable(false));
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const rawPhone = phone.replace(/\D/g, "");

  const sendOtp = async () => {
    if (!rawPhone) { toast({ title: "Enter your mobile number", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: rawPhone, countryCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setMaskedPhone(data.masked || `${countryCode}****${rawPhone.slice(-4)}`);
      setStep("otp");
      setResendCooldown(60);
      toast({ title: "Code sent!", description: `SMS sent to ${data.masked}` });
    } catch (err: unknown) {
      toast({ title: "Failed to send code", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length < 6) { toast({ title: "Enter the 6-digit code", variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (newPassword.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: rawPhone, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      if (data.adminReset) {
        setStep("done");
      } else {
        // OTP verified but no admin key — tell user to contact support
        toast({
          title: "OTP verified",
          description: "Please contact support to complete your password reset.",
        });
        setMethod("support");
        setStep("phone");
      }
    } catch (err: unknown) {
      toast({ title: "Verification failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Phone step ────────────────────────────────────────────────────────────
  const renderPhone = () => (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="flex items-center gap-2"><Phone className="w-4 h-4" /> Mobile Number</Label>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm shrink-0"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 6001234"
            className="flex-1"
            autoFocus
          />
        </div>
      </div>

      {smsAvailable === null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking available methods…
        </div>
      )}

      {smsAvailable === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">SMS reset is not currently configured</p>
            <p className="text-xs mt-0.5">Use the WhatsApp or in-app support option below to request a password reset from our team.</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {smsAvailable && (
          <Button className="w-full gap-2" onClick={sendOtp} disabled={loading || !rawPhone}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Phone className="w-4 h-4" /> Send Reset Code via SMS</>}
          </Button>
        )}

        {whatsappNumber && (
          <Button
            variant="outline"
            className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => window.open(`https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=I+need+help+resetting+my+NETLIFE+CASH+password+for+number+${countryCode}${rawPhone}`, "_blank")}
          >
            <MessageCircle className="w-4 h-4" />
            Contact Support on WhatsApp
          </Button>
        )}

        <Button variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
        </Button>
      </div>
    </div>
  );

  // ── OTP + new password step ────────────────────────────────────────────────
  const renderOtp = () => (
    <div className="space-y-5">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">A 6-digit code was sent to <strong>{maskedPhone}</strong>. It expires in 5 minutes.</p>
      </div>

      <div className="space-y-2">
        <Label>Reset Code</Label>
        <Input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="text-center text-xl tracking-[0.4em] font-mono"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>New Password</Label>
        <div className="relative">
          <Input
            type={showPass ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="pr-10"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPass(!showPass)}
          >
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <StrengthBar password={newPassword} />
      </div>

      <div className="space-y-2">
        <Label>Confirm New Password</Label>
        <Input
          type={showPass ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
        />
        {confirmPassword && confirmPassword !== newPassword && (
          <p className="text-xs text-red-500">Passwords do not match</p>
        )}
      </div>

      <Button
        className="w-full gap-2"
        onClick={verifyOtp}
        disabled={loading || otp.length < 6 || newPassword.length < 6 || newPassword !== confirmPassword}
      >
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</> : <><KeyRound className="w-4 h-4" /> Reset Password</>}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          className="text-muted-foreground hover:text-foreground underline disabled:opacity-40"
          disabled={resendCooldown > 0 || loading}
          onClick={() => { setStep("phone"); setOtp(""); }}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
        </button>
        <button className="text-muted-foreground hover:text-foreground underline" onClick={() => setStep("phone")}>
          Change number
        </button>
      </div>
    </div>
  );

  // ── Done step ─────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="text-center space-y-5 py-4">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-9 h-9 text-green-600" />
      </div>
      <div>
        <h3 className="text-xl font-bold">Password reset!</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Your password has been updated. You can now sign in with your new password.
        </p>
      </div>
      <Button className="w-full" onClick={() => navigate("/auth")}>
        Sign In Now
      </Button>
    </div>
  );

  const stepTitles: Record<Step, string> = {
    phone:   "Forgot Password",
    otp:     "Enter Reset Code",
    newpass: "Set New Password",
    done:    "Password Reset",
  };
  const stepDescs: Record<Step, string> = {
    phone:   "We'll send a code to your registered mobile number",
    otp:     "Enter the code and your new password below",
    newpass: "Choose a new password",
    done:    "You're all set",
  };

  return (
    <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {step !== "done" && (
          <Button variant="ghost" onClick={() => step === "otp" ? setStep("phone") : navigate("/auth")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {step === "otp" ? "Back" : "Back to Sign In"}
          </Button>
        )}

        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">{stepTitles[step]}</CardTitle>
                <CardDescription>{stepDescs[step]}</CardDescription>
              </div>
            </div>
            {step !== "done" && (
              <div className="flex gap-1 mt-2">
                {(["phone", "otp", "done"] as const).map((s, i) => (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      (step === "phone" && i === 0) || (step === "otp" && i <= 1) || step === "done"
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {step === "phone" && renderPhone()}
            {step === "otp"   && renderOtp()}
            {step === "done"  && renderDone()}
          </CardContent>
        </Card>

        {step === "phone" && (
          <p className="text-center text-xs text-muted-foreground">
            Remember your password?{" "}
            <button className="underline hover:text-foreground" onClick={() => navigate("/auth")}>
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
