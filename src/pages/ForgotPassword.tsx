import { BankingAuthLayout } from "@/components/BankingAuthLayout";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initSupabase } from "@/integrations/supabase/client";
import {
  getDeviceInfo,
  PENDING_LOGIN_APPROVAL_KEY,
  PENDING_LOGIN_SECURITY_KEY,
} from "@/hooks/useDeviceSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ArrowLeft, Phone, Loader2, ShieldCheck, MessageCircle,
  KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Mail,
  Smartphone, RefreshCw, Fingerprint, ScanFace,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  isBiometricAvailable,
  authenticateWithBiometric,
} from "@/lib/biometricAuth";

// ── Types ─────────────────────────────────────────────────────────────────────
type Step =
  | "choose"
  | "email_form"
  | "email_sent"
  | "phone_form"
  | "otp"
  | "security_phone"
  | "security_recovery"
  | "passkey"
  | "passkey_reset"
  | "done";

const COUNTRY_CODES = [
  { code: "+592",  label: "🇬🇾 GY +592"  },
  { code: "+1",    label: "🇺🇸 US +1"    },
  { code: "+44",   label: "🇬🇧 UK +44"   },
  { code: "+1868", label: "🇹🇹 TT +1868" },
  { code: "+1246", label: "🇧🇧 BB +1246" },
  { code: "+1876", label: "🇯🇲 JM +1876" },
  { code: "+55",   label: "🇧🇷 BR +55"   },
  { code: "+91",   label: "🇮🇳 IN +91"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isMobilePWA(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 6,
    password.length >= 10,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["", "bg-destructive", "bg-warning", "bg-warning", "bg-primary", "bg-success"];
  const labels = ["", "Very weak", "Weak", "Fair", "Good", "Strong"];
  if (!password) return null;
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`} />
        ))}
      </div>
      <p className={`text-[11px] font-medium ${score <= 2 ? "text-destructive" : score <= 3 ? "text-warning" : "text-success"}`}>
        {labels[score]}
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ForgotPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("choose");
  const [isPWA]         = useState<boolean>(isMobilePWA);

  // Server capabilities
  const [smsAvailable, setSmsAvailable]     = useState<boolean | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");

  // Biometric / passkey
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [passkeyLoading, setPasskeyLoading]         = useState(false);
  const [passkeyError, setPasskeyError]             = useState("");
  const [passkeyPhone, setPasskeyPhone]             = useState(""); // filled after WebAuthn success

  // Email fields
  const [email, setEmail]               = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Phone + OTP fields
  const [countryCode, setCountryCode]         = useState("+592");
  const [phone, setPhone]                     = useState("");
  const [maskedPhone, setMaskedPhone]         = useState("");
  const [otp, setOtp]                         = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityChallengeId, setSecurityChallengeId] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityRecoveryAnswer, setSecurityRecoveryAnswer] = useState("");
  const [showPass, setShowPass]               = useState(false);
  const [phoneLoading, setPhoneLoading]       = useState(false);
  const [resendCooldown, setResendCooldown]   = useState(0);
  const [resendCount, setResendCount]         = useState(0);
  const MAX_RESENDS = 3;

  // Passkey-reset direct password setter
  const [passkeyNewPass, setPasskeyNewPass]         = useState("");
  const [passkeyConfirmPass, setPasskeyConfirmPass] = useState("");
  const [passkeyResetting, setPasskeyResetting]     = useState(false);
  const [showPasskeyPass, setShowPasskeyPass]       = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);

    fetch("/api/auth/reset-status")
      .then(r => r.json())
      .then(d => setSmsAvailable(d.smsAvailable ?? false))
      .catch(() => setSmsAvailable(false));

    fetch("/api/config")
      .then(r => r.json())
      .then(cfg => setWhatsappNumber(cfg.whatsappNumber || ""))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const rawPhone = phone.replace(/\D/g, "");

  // ── Email reset (Supabase built-in link) ──────────────────────────────────
  const sendEmailReset = async () => {
    if (!email.trim()) { toast({ title: "Enter your email address", variant: "destructive" }); return; }
    setEmailLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setStep("email_sent");
    } catch (err: unknown) {
      toast({
        title: "Could not send reset link",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  // ── Phone / SMS OTP flow ──────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!rawPhone) { toast({ title: "Enter your mobile number", variant: "destructive" }); return; }
    if (resendCooldown > 0) {
      toast({ title: `Please wait ${resendCooldown}s`, description: "You can request another code shortly.", variant: "destructive" });
      return;
    }
    if (resendCount >= MAX_RESENDS) {
      toast({
        title: "Too many code requests",
        description: "You've reached the limit. Try email recovery or contact support on WhatsApp.",
        variant: "destructive",
      });
      return;
    }
    setPhoneLoading(true);
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
      setResendCount(c => c + 1);
      // Escalating cooldown: 60s, 120s, 180s
      setResendCooldown(60 * Math.min(resendCount + 1, MAX_RESENDS));
      toast({ title: "Code sent!", description: `SMS sent to ${data.masked}` });
    } catch (err: unknown) {
      toast({
        title: "Failed to send code",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length < 6) { toast({ title: "Enter the 6-digit code", variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (newPassword.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); return; }
    setPhoneLoading(true);
    try {
      const res = await fetch("/api/auth/verify-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: rawPhone, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setStep("done");
    } catch (err: unknown) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  const startSecurityQuestionRecovery = async () => {
    if (!rawPhone) {
      toast({ title: "Enter your mobile number", variant: "destructive" });
      return;
    }
    setPhoneLoading(true);
    try {
      const response = await fetch("/api/auth/security-question/recovery/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: rawPhone, countryCode }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Security-question recovery could not start.");
      setSecurityChallengeId(result.challengeId);
      setSecurityQuestion(result.question || "");
      setSecurityRecoveryAnswer("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("security_recovery");
    } catch (error: unknown) {
      toast({
        title: "Could not start recovery",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  const verifySecurityQuestionRecovery = async () => {
    if (securityRecoveryAnswer.trim().length < 10) {
      toast({ title: "Enter your answer phrase", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setPhoneLoading(true);
    try {
      const response = await fetch("/api/auth/security-question/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: securityChallengeId,
          answer: securityRecoveryAnswer,
          newPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The answer could not be verified.");
      setStep("done");
    } catch (error: unknown) {
      toast({
        title: "Recovery failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  // ── Passkey / biometric recovery ──────────────────────────────────────────
  const doPasskeyVerify = async () => {
    setPasskeyLoading(true);
    setPasskeyError("");
    try {
      const result = await authenticateWithBiometric();
      if (!result.success) {
        if (result.error !== "cancelled") setPasskeyError(result.error || "Biometric failed");
        setPasskeyLoading(false);
        return;
      }

      // result.userId = E.164 phone number stored in localStorage
      const identifiedPhone = result.userId || "";

      // Try to find stored password for auto sign-in
      let autoSignedIn = false;
      let approvalRequested = false;
      // Look for stored auth data by scanning localStorage for credential links
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("biometric_phone_")) continue;
        const storedPhone = localStorage.getItem(key);
        if (storedPhone !== identifiedPhone) continue;
        const credId = key.replace("biometric_phone_", "");
        const encPass = localStorage.getItem(`biometric_auth_${credId}`);
        if (!encPass) continue;
        const storedPass = atob(encPass);
        const loginResponse = await fetch("/api/auth/request-device-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: identifiedPhone,
            password: storedPass,
            device: getDeviceInfo(),
          }),
        });
        const loginResult = await loginResponse.json().catch(() => ({}));
        if ((loginResult.securityQuestionRequired || loginResult.securityQuestionSetupRequired) && loginResult.challengeId) {
          sessionStorage.setItem(PENDING_LOGIN_SECURITY_KEY, JSON.stringify({
            challengeId: loginResult.challengeId,
            question: loginResult.question || "",
            setupRequired: Boolean(loginResult.securityQuestionSetupRequired),
          }));
          toast({
            title: loginResult.securityQuestionSetupRequired ? "Security setup required" : "Security check required",
            description: loginResult.securityQuestionSetupRequired
              ? "Set a security question and private answer phrase to finish signing in."
              : "Answer your security question to finish signing in.",
          });
          navigate("/auth");
          return;
        }
        if (loginResult.approvalRequired && loginResult.requestToken) {
          sessionStorage.setItem(PENDING_LOGIN_APPROVAL_KEY, loginResult.requestToken);
          approvalRequested = true;
          break;
        }
        if (loginResponse.status === 401) continue;
        if (!loginResponse.ok || !loginResult.session) {
          throw new Error(loginResult.error || "This device could not be approved for sign-in.");
        }
        await initSupabase();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: loginResult.session.access_token,
          refresh_token: loginResult.session.refresh_token,
        });
        if (sessionError) throw sessionError;
        autoSignedIn = true;
        if (autoSignedIn) break;
      }

      if (approvalRequested) {
        toast({
          title: "Approval requested",
          description: "Allow this sign-in on a device where you are already signed in.",
        });
        navigate("/auth");
        return;
      }
      if (autoSignedIn) {
        // Signed in — redirect home and suggest changing password
        toast({
          title: "✅ Verified with passkey!",
          description: "You're signed in. Go to Profile → Account Security to change your password.",
        });
        navigate("/");
        return;
      }

      // Stored password didn't work (user changed it) — let them set a new one
      setPasskeyPhone(identifiedPhone);
      setPasskeyNewPass("");
      setPasskeyConfirmPass("");
      setStep("passkey_reset");
    } catch (err: unknown) {
      setPasskeyError(err instanceof Error ? err.message : "Biometric authentication failed");
    } finally {
      setPasskeyLoading(false);
    }
  };

  const doPasskeyReset = async () => {
    if (passkeyNewPass.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters", variant: "destructive" });
      return;
    }
    if (passkeyNewPass !== passkeyConfirmPass) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setPasskeyResetting(true);
    try {
      // Use OTP SMS reset path — pre-fill phone from passkey identity
      const digits = passkeyPhone.replace(/\D+/g, "");
      // Find country code prefix by scanning known codes
      const matched = COUNTRY_CODES.find(c => passkeyPhone.startsWith(c.code));
      const cc = matched?.code || "+592";
      const local = digits.replace(cc.replace("+", ""), "");

      // Send OTP to the identified phone
      const res = await fetch("/api/auth/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: local || digits, countryCode: cc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send verification code");

      // Pre-fill phone fields and jump to OTP step (with new password pre-filled)
      setPhone(local || digits);
      setCountryCode(cc);
      setNewPassword(passkeyNewPass);
      setConfirmPassword(passkeyConfirmPass);
      setMaskedPhone(data.masked || passkeyPhone);
      setResendCooldown(60);
      setOtp("");
      setStep("otp");
      toast({ title: "Code sent!", description: `Verify your number to complete the reset.` });
    } catch (err: unknown) {
      // If SMS not available, try admin API directly using the identified email
      const digits = passkeyPhone.replace(/\D+/g, "");
      const emailVariant = `${passkeyPhone.replace("+", "")}@vbank.com`;

      // Check if admin reset is available
      try {
        const statusRes = await fetch("/api/auth/reset-status");
        const status = await statusRes.json();
        if (status.adminResetAvailable) {
          // Look up user by email via admin route
          const usersRes = await fetch("/api/auth/all-users");
          if (usersRes.ok) {
            const usersData = await usersRes.json();
            const target = (usersData.users || []).find(
              (u: { email: string }) =>
                u.email === emailVariant ||
                u.email === `${digits}@vbank.com`
            );
            if (target) {
              const resetRes = await fetch("/api/auth/admin-set-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: target.id, newPassword: passkeyNewPass }),
              });
              const resetData = await resetRes.json();
              if (resetRes.ok && resetData.ok) {
                setStep("done");
                setPasskeyResetting(false);
                return;
              }
            }
          }
        }
      } catch { /* fall through to error */ }

      toast({
        title: "Could not complete reset",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPasskeyResetting(false);
    }
  };

  // ── Shared sub-components ─────────────────────────────────────────────────
  const MobilePWABanner = () =>
    isPWA ? (
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 flex gap-3">
        <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm text-primary">
          <p className="font-medium">You're using the NETLIFE CASH app</p>
          <p className="text-xs mt-0.5">
            Both email and phone recovery work inside the app. After resetting, sign back in to continue.
          </p>
        </div>
      </div>
    ) : null;

  const WhatsAppBtn = ({ context }: { context: string }) =>
    whatsappNumber ? (
      <Button
        variant="outline"
        className="w-full gap-2 border-success/30 text-success hover:bg-success/10"
        onClick={() =>
          window.open(
            `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(context)}`,
            "_blank"
          )
        }
      >
        <MessageCircle className="w-4 h-4" />
        Contact Support on WhatsApp
      </Button>
    ) : null;

  const Divider = () => (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="flex-1 border-t" /><span>or</span><div className="flex-1 border-t" />
    </div>
  );

  // ── STEP: choose ──────────────────────────────────────────────────────────
  const renderChoose = () => (
    <div className="space-y-4">
      <MobilePWABanner />
      <p className="text-sm text-muted-foreground">How would you like to recover your account?</p>

      {/* Passkey option — shown only if biometric available */}
      {biometricAvailable && (
        <Button variant="ghost"
          onClick={() => setStep("passkey")}
          className="h-auto min-h-24 whitespace-normal w-full justify-start flex items-start gap-4 rounded-lg border border-primary/40 bg-primary/5 hover:border-primary/70 hover:bg-primary/10 p-4 text-left transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/20">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">Via Passkey / Biometric</p>
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-semibold">
                Fastest
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use your fingerprint or Face ID to verify your identity
            </p>
          </div>
        </Button>
      )}

      {/* Email option */}
      <Button variant="ghost"
        onClick={() => setStep("email_form")}
        className="h-auto min-h-24 whitespace-normal w-full justify-start flex items-start gap-4 rounded-lg border border-muted hover:border-primary/60 hover:bg-primary/5 p-4 text-left transition-all group"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Via Email Address</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Receive a secure reset link in your inbox
          </p>
        </div>
      </Button>

      {/* Phone / SMS option */}
      <Button variant="ghost"
        onClick={() => setStep("phone_form")}
        disabled={smsAvailable === false}
        className="h-auto min-h-24 whitespace-normal w-full justify-start flex items-start gap-4 rounded-lg border border-muted hover:border-primary/60 hover:bg-primary/5 p-4 text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15">
          <Phone className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">Via Phone Number (SMS)</p>
            {smsAvailable === false && (
              <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded font-medium">
                Unavailable
              </span>
            )}
            {smsAvailable === null && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get a 6-digit code sent to your mobile number
          </p>
        </div>
      </Button>

      <Button
        variant="ghost"
        onClick={() => setStep("security_phone")}
        className="h-auto min-h-24 whitespace-normal w-full justify-start flex items-start gap-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 p-4 text-left transition-all"
        data-testid="button-recover-security-question"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Via Security Question</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Answer your private phrase and choose a new password
          </p>
        </div>
      </Button>

      {whatsappNumber && (
        <WhatsAppBtn context="I need help resetting my NETLIFE CASH password" />
      )}

      <Button variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
      </Button>
    </div>
  );

  // ── STEP: passkey verify ──────────────────────────────────────────────────
  const renderPasskey = () => (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Fingerprint className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center">
          <p className="font-medium">Verify it's you</p>
          <p className="text-sm text-muted-foreground mt-1">
            Use your device's fingerprint, Face ID, or PIN to confirm your identity.
            No password needed.
          </p>
        </div>
      </div>

      {passkeyError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm text-destructive">
            <p className="font-medium">Verification failed</p>
            <p className="text-xs mt-0.5">{passkeyError}</p>
          </div>
        </div>
      )}

      <Button
        className="w-full gap-2 h-14 text-base"
        onClick={doPasskeyVerify}
        disabled={passkeyLoading}
      >
        {passkeyLoading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Waiting for biometric…</>
        ) : (
          <><ScanFace className="w-5 h-5" /> Verify with Passkey</>
        )}
      </Button>

      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
        <p>• Works with fingerprint, Face ID, Windows Hello, or your device PIN</p>
        <p>• Your passkey must have been set up in the app before</p>
        <p>• If this is a new device, use email or phone recovery instead</p>
      </div>

      <Divider />

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-1" onClick={() => setStep("email_form")}>
          <Mail className="w-4 h-4" /> Email
        </Button>
        {smsAvailable !== false && (
          <Button variant="outline" className="flex-1 gap-1" onClick={() => setStep("phone_form")}>
            <Phone className="w-4 h-4" /> Phone
          </Button>
        )}
      </div>
    </div>
  );

  // ── STEP: passkey reset (set new password after passkey ID) ───────────────
  const renderPasskeyReset = () => (
    <div className="space-y-5">
      <div className="rounded-lg border border-success/30 bg-success/10 p-3 flex gap-3">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <div className="text-sm text-success">
          <p className="font-medium">Identity verified!</p>
          <p className="text-xs mt-0.5">
            Your passkey confirmed who you are. Set a new password below.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>New Password</Label>
        <div className="relative">
          <Input
            type={showPasskeyPass ? "text" : "password"}
            value={passkeyNewPass}
            onChange={e => setPasskeyNewPass(e.target.value)}
            placeholder="Minimum 6 characters"
            className="pr-10"
            autoFocus
          />
          <Button variant="ghost"
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPasskeyPass(v => !v)}
          >
            {showPasskeyPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>
        <StrengthBar password={passkeyNewPass} />
      </div>

      <div className="space-y-2">
        <Label>Confirm New Password</Label>
        <Input
          type={showPasskeyPass ? "text" : "password"}
          value={passkeyConfirmPass}
          onChange={e => setPasskeyConfirmPass(e.target.value)}
          placeholder="Re-enter your new password"
        />
        {passkeyConfirmPass && passkeyConfirmPass !== passkeyNewPass && (
          <p className="text-xs text-destructive">Passwords do not match</p>
        )}
      </div>

      <Button
        className="w-full gap-2"
        onClick={doPasskeyReset}
        disabled={
          passkeyResetting ||
          passkeyNewPass.length < 6 ||
          passkeyNewPass !== passkeyConfirmPass
        }
      >
        {passkeyResetting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
        ) : (
          <><KeyRound className="w-4 h-4" /> Set New Password</>
        )}
      </Button>
    </div>
  );

  // ── STEP: email form ──────────────────────────────────────────────────────
  const renderEmailForm = () => (
    <div className="space-y-5">
      <MobilePWABanner />

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Mail className="w-4 h-4" /> Email Address
        </Label>
        <Input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          autoFocus
          onKeyDown={e => e.key === "Enter" && sendEmailReset()}
        />
        <p className="text-xs text-muted-foreground">
          Enter the email linked to your NETLIFE CASH account.
          We'll send a secure reset link valid for 24 hours.
        </p>
      </div>

      <Button
        className="w-full gap-2"
        onClick={sendEmailReset}
        disabled={emailLoading || !email.trim()}
      >
        {emailLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
          : <><Mail className="w-4 h-4" /> Send Reset Link</>}
      </Button>

      {smsAvailable !== false && (
        <>
          <Divider />
          <Button variant="outline" className="w-full gap-2" onClick={() => setStep("phone_form")}>
            <Phone className="w-4 h-4" /> Use Phone Number Instead
          </Button>
        </>
      )}

      <WhatsAppBtn context={`I need help resetting my NETLIFE CASH password (email: ${email})`} />
    </div>
  );

  // ── STEP: email sent ──────────────────────────────────────────────────────
  const renderEmailSent = () => (
    <div className="text-center space-y-5 py-2">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
        <Mail className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h3 className="text-xl font-bold">Check your inbox</h3>
        <p className="text-muted-foreground text-sm mt-1">
          A reset link has been sent to <strong>{email}</strong>.
          Tap it to set your new password.
        </p>
      </div>

      {isPWA && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-left flex gap-3">
          <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-primary">
            <p className="font-medium">On the mobile app?</p>
            <p className="text-xs mt-0.5">
              Open your email app and tap the reset link — it opens in your browser.
              After resetting, return to the app and sign in.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/60 p-3 text-left text-xs text-muted-foreground space-y-1.5">
        <p>• Link expires in <strong>24 hours</strong></p>
        <p>• Check spam/junk folder if you don't see it</p>
        <p>• Only the most recent link is valid</p>
      </div>

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => { setEmail(""); setStep("email_form"); }}
      >
        <RefreshCw className="w-4 h-4" /> Resend / Use a Different Email
      </Button>

      <WhatsAppBtn context="I'm not receiving the NETLIFE CASH password reset email" />

      <Button variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
        Back to Sign In
      </Button>
    </div>
  );

  // ── STEP: phone form ──────────────────────────────────────────────────────
  const renderPhoneForm = () => (
    <div className="space-y-5">
      <MobilePWABanner />

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Phone className="w-4 h-4" /> Mobile Number
        </Label>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm shrink-0"
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
          >
            {COUNTRY_CODES.map(c => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <Input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 6001234"
            className="flex-1"
            autoFocus
            onKeyDown={e => e.key === "Enter" && sendOtp()}
          />
        </div>
      </div>

      {smsAvailable === false && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex gap-3">
          <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm text-warning">
            <p className="font-medium">SMS is not configured</p>
            <p className="text-xs mt-0.5">Use email reset or contact support on WhatsApp.</p>
          </div>
        </div>
      )}

      <Button
        className="w-full gap-2"
        onClick={sendOtp}
        disabled={phoneLoading || !rawPhone || smsAvailable === false}
      >
        {phoneLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
          : <><Phone className="w-4 h-4" /> Send Code via SMS</>}
      </Button>

      <Divider />

      <Button variant="outline" className="w-full gap-2" onClick={() => setStep("email_form")}>
        <Mail className="w-4 h-4" /> Use Email Instead
      </Button>

      <WhatsAppBtn
        context={`I need help resetting my NETLIFE CASH password for number ${countryCode}${rawPhone}`}
      />
    </div>
  );

  const renderSecurityPhoneForm = () => (
    <div className="space-y-5">
      <MobilePWABanner />
      <p className="text-sm text-muted-foreground">
        Enter the phone number on your account. You will need your saved answer phrase to continue.
      </p>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Phone className="w-4 h-4" /> Mobile Number
        </Label>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border bg-background px-2 text-sm shrink-0"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            data-testid="select-security-recovery-country"
          >
            {COUNTRY_CODES.map((country) => (
              <option key={country.code} value={country.code}>{country.label}</option>
            ))}
          </select>
          <Input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. 6001234"
            className="flex-1"
            autoFocus
            data-testid="input-security-recovery-phone"
          />
        </div>
      </div>
      <Button
        className="w-full gap-2"
        onClick={startSecurityQuestionRecovery}
        disabled={phoneLoading || !rawPhone}
        data-testid="button-start-security-recovery"
      >
        {phoneLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
          : <><ShieldCheck className="w-4 h-4" /> Continue</>}
      </Button>
      <Button variant="outline" className="w-full gap-2" onClick={() => setStep("phone_form")}>
        <Phone className="w-4 h-4" /> Use Phone Code Instead
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => setStep("choose")}>
        Back to recovery options
      </Button>
    </div>
  );

  const renderSecurityRecovery = () => (
    <div className="space-y-5">
      <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">Answer your security question</p>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-security-recovery-question">
            {securityQuestion}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="security-recovery-answer">Private answer phrase</Label>
        <Input
          id="security-recovery-answer"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={securityRecoveryAnswer}
          onChange={(event) => setSecurityRecoveryAnswer(event.target.value)}
          placeholder="Enter your answer phrase"
          minLength={10}
          maxLength={200}
          data-testid="input-security-recovery-answer"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="security-recovery-new-password">New Password</Label>
        <Input
          id="security-recovery-new-password"
          type={showPass ? "text" : "password"}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          maxLength={128}
          data-testid="input-security-recovery-new-password"
        />
        <StrengthBar password={newPassword} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="security-recovery-confirm-password">Confirm New Password</Label>
        <Input
          id="security-recovery-confirm-password"
          type={showPass ? "text" : "password"}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Re-enter your new password"
        />
      </div>
      <Button
        className="w-full gap-2"
        onClick={verifySecurityQuestionRecovery}
        disabled={phoneLoading || securityRecoveryAnswer.trim().length < 10 || newPassword.length < 8 || newPassword !== confirmPassword}
        data-testid="button-submit-security-recovery"
      >
        {phoneLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
          : <><KeyRound className="w-4 h-4" /> Reset Password</>}
      </Button>
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => { setStep("security_phone"); setSecurityRecoveryAnswer(""); }}
      >
        Use another phone number
      </Button>
    </div>
  );

  // ── STEP: OTP + new password ──────────────────────────────────────────────
  const renderOtp = () => (
    <div className="space-y-5">
      <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-primary">
          A 6-digit code was sent to <strong>{maskedPhone}</strong>. Expires in 5 minutes.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Reset Code</Label>
        <Input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
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
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="pr-10"
          />
          <Button variant="ghost"
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPass(!showPass)}
          >
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>
        <StrengthBar password={newPassword} />
      </div>

      <div className="space-y-2">
        <Label>Confirm New Password</Label>
        <Input
          type={showPass ? "text" : "password"}
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
        />
        {confirmPassword && confirmPassword !== newPassword && (
          <p className="text-xs text-destructive">Passwords do not match</p>
        )}
      </div>

      <Button
        className="w-full gap-2"
        onClick={verifyOtp}
        disabled={phoneLoading || otp.length < 6 || newPassword.length < 6 || newPassword !== confirmPassword}
      >
        {phoneLoading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
          : <><KeyRound className="w-4 h-4" /> Reset Password</>}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost"
          className="text-muted-foreground hover:text-foreground underline disabled:opacity-40"
          disabled={resendCooldown > 0 || phoneLoading || resendCount >= MAX_RESENDS}
          onClick={() => { setOtp(""); sendOtp(); }}
        >
          {resendCount >= MAX_RESENDS
            ? "Resend limit reached"
            : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : `Resend code (${MAX_RESENDS - resendCount} left)`}
        </Button>
        <Button variant="ghost"
          className="text-muted-foreground hover:text-foreground underline"
          onClick={() => { setStep("phone_form"); setOtp(""); }}
        >
          Change number
        </Button>
      </div>
      {resendCount >= MAX_RESENDS && (
        <p className="text-xs text-destructive text-center">
          You've requested the maximum number of SMS codes. Use email recovery or contact support.
        </p>
      )}
    </div>
  );

  // ── STEP: done ────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="text-center space-y-5 py-4">
      <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-9 h-9 text-success" />
      </div>
      <div>
        <h3 className="text-xl font-bold">Password reset!</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Your password has been updated. Sign in with your new password.
        </p>
      </div>
      <Button className="w-full" onClick={() => navigate("/auth")}>
        Sign In Now
      </Button>
    </div>
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleBack = () => {
    if (step === "email_form" || step === "phone_form" || step === "passkey") setStep("choose");
    else if (step === "email_sent")    setStep("email_form");
    else if (step === "otp")           setStep("phone_form");
    else if (step === "security_phone") setStep("choose");
    else if (step === "security_recovery") setStep("security_phone");
    else if (step === "passkey_reset") setStep("passkey");
    else navigate("/auth");
  };

  // ── Step meta ─────────────────────────────────────────────────────────────
  type StepMeta = { title: string; desc: string; progress: number; icon: React.ReactNode };
  const stepMeta: Record<Step, StepMeta> = {
    choose:        { title: "Forgot Password",  desc: "Choose how to recover your account",        progress: 1, icon: <KeyRound className="w-5 h-5 text-primary" /> },
    passkey:       { title: "Passkey Recovery", desc: "Verify your identity with biometrics",      progress: 2, icon: <Fingerprint className="w-5 h-5 text-primary" /> },
    passkey_reset: { title: "Set New Password", desc: "Create a new password for your account",   progress: 3, icon: <KeyRound className="w-5 h-5 text-primary" /> },
    email_form:    { title: "Reset via Email",  desc: "We'll send a secure link to your inbox",    progress: 2, icon: <Mail className="w-5 h-5 text-primary" /> },
    email_sent:    { title: "Email Sent",       desc: "Open the link in your email to continue",   progress: 3, icon: <Mail className="w-5 h-5 text-primary" /> },
    phone_form:    { title: "Reset via SMS",    desc: "We'll text a code to your mobile number",   progress: 2, icon: <Phone className="w-5 h-5 text-primary" /> },
    otp:           { title: "Enter Reset Code", desc: "Enter the code and set your new password",  progress: 3, icon: <ShieldCheck className="w-5 h-5 text-primary" /> },
    security_phone: { title: "Security Question", desc: "Find your recovery question", progress: 2, icon: <ShieldCheck className="w-5 h-5 text-primary" /> },
    security_recovery: { title: "Verify Answer", desc: "Answer and set a new password", progress: 3, icon: <KeyRound className="w-5 h-5 text-primary" /> },
    done:          { title: "Password Reset",  desc: "Your account is secured",                   progress: 3, icon: <CheckCircle2 className="w-5 h-5 text-success" /> },
  };
  const { title, desc, progress, icon } = stepMeta[step];

  return (
    <BankingAuthLayout>
      <div className="w-full max-w-md space-y-4">
        {step !== "done" && (
          <Button variant="ghost" onClick={handleBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {step === "choose" ? "Back to Sign In" : "Back"}
          </Button>
        )}

        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="px-0 pt-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                {icon}
              </div>
              <div>
                <CardTitle className="text-xl">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </div>
            </div>
            {step !== "done" && (
              <div className="flex gap-1 mt-2">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= progress ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="px-0">
            {step === "choose"        && renderChoose()}
            {step === "passkey"       && renderPasskey()}
            {step === "passkey_reset" && renderPasskeyReset()}
            {step === "email_form"    && renderEmailForm()}
            {step === "email_sent"    && renderEmailSent()}
            {step === "phone_form"    && renderPhoneForm()}
            {step === "otp"           && renderOtp()}
            {step === "security_phone" && renderSecurityPhoneForm()}
            {step === "security_recovery" && renderSecurityRecovery()}
            {step === "done"          && renderDone()}
          </CardContent>
        </Card>

        {step === "choose" && (
          <p className="text-center text-xs text-muted-foreground">
            Remember your password?{" "}
            <Button variant="ghost" className="underline hover:text-foreground" onClick={() => navigate("/auth")}>
              Sign in
            </Button>
          </p>
        )}
      </div>
    </BankingAuthLayout>
  );
}
