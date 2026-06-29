import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ArrowLeft, Phone, Loader2, ShieldCheck, MessageCircle,
  KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Mail,
  Smartphone, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = "choose" | "email_form" | "email_sent" | "phone_form" | "otp" | "done";

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

// ── Main Component ────────────────────────────────────────────────────────────
export default function ForgotPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("choose");
  const [isPWA]         = useState<boolean>(isMobilePWA);

  // Server capabilities
  const [smsAvailable, setSmsAvailable]     = useState<boolean | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");

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
  const [showPass, setShowPass]               = useState(false);
  const [phoneLoading, setPhoneLoading]       = useState(false);
  const [resendCooldown, setResendCooldown]   = useState(0);

  useEffect(() => {
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
      setResendCooldown(60);
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

  // ── Shared sub-components ─────────────────────────────────────────────────
  const MobilePWABanner = () =>
    isPWA ? (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex gap-3">
        <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
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
        className="w-full gap-2 border-green-300 text-green-700 hover:bg-green-50"
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

      <button
        onClick={() => setStep("email_form")}
        className="w-full flex items-start gap-4 rounded-xl border-2 border-muted hover:border-primary/60 hover:bg-primary/5 p-4 text-left transition-all group"
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
      </button>

      <button
        onClick={() => setStep("phone_form")}
        disabled={smsAvailable === false}
        className="w-full flex items-start gap-4 rounded-xl border-2 border-muted hover:border-primary/60 hover:bg-primary/5 p-4 text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15">
          <Phone className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">Via Phone Number (SMS)</p>
            {smsAvailable === false && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
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
      </button>

      {whatsappNumber && (
        <WhatsAppBtn context="I need help resetting my NETLIFE CASH password" />
      )}

      <Button variant="ghost" className="w-full" onClick={() => navigate("/auth")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
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
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
        <Mail className="w-8 h-8 text-blue-600" />
      </div>
      <div>
        <h3 className="text-xl font-bold">Check your inbox</h3>
        <p className="text-muted-foreground text-sm mt-1">
          A reset link has been sent to <strong>{email}</strong>.
          Tap it to set your new password.
        </p>
      </div>

      {isPWA && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-left flex gap-3">
          <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
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

  // ── STEP: OTP + new password ──────────────────────────────────────────────
  const renderOtp = () => (
    <div className="space-y-5">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
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
          onChange={e => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
        />
        {confirmPassword && confirmPassword !== newPassword && (
          <p className="text-xs text-red-500">Passwords do not match</p>
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
        <button
          className="text-muted-foreground hover:text-foreground underline disabled:opacity-40"
          disabled={resendCooldown > 0 || phoneLoading}
          onClick={() => { setStep("phone_form"); setOtp(""); }}
        >
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
        </button>
        <button
          className="text-muted-foreground hover:text-foreground underline"
          onClick={() => setStep("phone_form")}
        >
          Change number
        </button>
      </div>
    </div>
  );

  // ── STEP: done ────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="text-center space-y-5 py-4">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-9 h-9 text-green-600" />
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
    if (step === "email_form" || step === "phone_form") setStep("choose");
    else if (step === "email_sent") setStep("email_form");
    else if (step === "otp")        setStep("phone_form");
    else navigate("/auth");
  };

  // ── Step meta ─────────────────────────────────────────────────────────────
  type StepMeta = { title: string; desc: string; progress: number };
  const stepMeta: Record<Step, StepMeta> = {
    choose:     { title: "Forgot Password",  desc: "Choose how to recover your account",       progress: 1 },
    email_form: { title: "Reset via Email",  desc: "We'll send a secure link to your inbox",   progress: 2 },
    email_sent: { title: "Email Sent",       desc: "Open the link in your email to continue",  progress: 3 },
    phone_form: { title: "Reset via SMS",    desc: "We'll text a code to your mobile number",  progress: 2 },
    otp:        { title: "Enter Reset Code", desc: "Enter the code and set your new password", progress: 3 },
    done:       { title: "Password Reset",   desc: "Your account is secured",                  progress: 3 },
  };
  const { title, desc, progress } = stepMeta[step];

  return (
    <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        {step !== "done" && (
          <Button variant="ghost" onClick={handleBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {step === "choose" ? "Back to Sign In" : "Back"}
          </Button>
        )}

        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                {(step === "email_form" || step === "email_sent")
                  ? <Mail className="w-5 h-5 text-primary" />
                  : step === "done"
                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                  : <KeyRound className="w-5 h-5 text-primary" />}
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
          <CardContent>
            {step === "choose"     && renderChoose()}
            {step === "email_form" && renderEmailForm()}
            {step === "email_sent" && renderEmailSent()}
            {step === "phone_form" && renderPhoneForm()}
            {step === "otp"        && renderOtp()}
            {step === "done"       && renderDone()}
          </CardContent>
        </Card>

        {step === "choose" && (
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
