import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Fingerprint, Store, Users, ScanFace, MessageCircle, ShieldCheck } from "lucide-react";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { buildWhatsAppLink, fetchWhatsAppSettings } from "@/lib/whatsapp";
import {
  isBiometricAvailable,
  authenticateWithBiometric,
  getBiometricAuthData,
  hasStoredBiometric,
} from "@/lib/biometricAuth";
import {
  getDeviceInfo,
  PENDING_LOGIN_APPROVAL_KEY,
  PENDING_LOGIN_SECURITY_KEY,
} from "@/hooks/useDeviceSession";
import { BankingAuthLayout } from "@/components/BankingAuthLayout";

type AuthMode = "signin" | "signup";
type AccountType = "client" | "vendor";
type LoginStep = "credentials" | "otp" | "security" | "security_setup" | "approval";
type PendingSecurityChallenge = { challengeId: string; question?: string; setupRequired?: boolean };

const phoneToEmail = (e164: string) => `${e164.replace("+", "")}@vbank.com`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const readPendingSecurityChallenge = (): PendingSecurityChallenge | null => {
  try {
    const stored = sessionStorage.getItem(PENDING_LOGIN_SECURITY_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<PendingSecurityChallenge>;
    return typeof parsed.challengeId === "string" && parsed.challengeId
      ? { challengeId: parsed.challengeId, question: parsed.question, setupRequired: parsed.setupRequired }
      : null;
  } catch {
    sessionStorage.removeItem(PENDING_LOGIN_SECURITY_KEY);
    return null;
  }
};

const Auth = () => {
  const [initialSecurityChallenge] = useState(readPendingSecurityChallenge);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completeSignupAfterLogin, setCompleteSignupAfterLogin] = useState(false);
  const [approvalToken, setApprovalToken] = useState<string | null>(
    () => sessionStorage.getItem(PENDING_LOGIN_APPROVAL_KEY),
  );
  const [loginStep, setLoginStep] = useState<LoginStep>(
    () => sessionStorage.getItem(PENDING_LOGIN_APPROVAL_KEY)
      ? "approval"
      : initialSecurityChallenge
        ? initialSecurityChallenge.setupRequired ? "security_setup" : "security"
        : "credentials",
  );
  const [loginChallenge, setLoginChallenge] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [loginMaskedPhone, setLoginMaskedPhone] = useState("");
  const [securityChallenge, setSecurityChallenge] = useState(initialSecurityChallenge?.challengeId || "");
  const [securityChallengeQuestion, setSecurityChallengeQuestion] = useState(initialSecurityChallenge?.question || "");
  const [securityAnswerInput, setSecurityAnswerInput] = useState("");
  const [securitySetupQuestion, setSecuritySetupQuestion] = useState("");
  const [supportWhatsapp, setSupportWhatsapp] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const approvalPollInFlight = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
    fetch("/api/config")
      .then((response) => response.json())
      .then((config: { whatsappNumber?: string }) => setSupportWhatsapp(config.whatsappNumber || ""))
      .catch(() => {});
    fetchWhatsAppSettings()
      .then((settings) => setSupportWhatsapp(settings.supportNumber))
      .catch(() => {});
  }, []);

  const setPendingApproval = (token: string) => {
    sessionStorage.setItem(PENDING_LOGIN_APPROVAL_KEY, token);
    setApprovalToken(token);
    setLoginStep("approval");
    setLoginOtp("");
    sessionStorage.removeItem(PENDING_LOGIN_SECURITY_KEY);
    toast({
      title: "Approval requested",
      description: "Allow this sign-in on a device where you are already signed in. The request expires in 5 minutes.",
    });
  };

  const setPendingSecurityQuestion = (result: {
    challengeId: string;
    question?: string;
    securityQuestionRequired?: boolean;
    securityQuestionSetupRequired?: boolean;
  }) => {
    setSecurityChallenge(result.challengeId);
    setSecurityChallengeQuestion(result.question || "");
    setSecurityAnswerInput("");
    setSecuritySetupQuestion("");
    setLoginStep(result.securityQuestionSetupRequired ? "security_setup" : "security");
  };

  const acceptLoginResult = async (result: {
    securityQuestionRequired?: boolean;
    securityQuestionSetupRequired?: boolean;
    challengeId?: string;
    question?: string;
    approvalRequired?: boolean;
    requestToken?: string;
    session?: { access_token: string; refresh_token: string };
  }) => {
    if ((result.securityQuestionRequired || result.securityQuestionSetupRequired) && result.challengeId) {
      setPendingSecurityQuestion(result as {
        challengeId: string;
        question?: string;
        securityQuestionRequired?: boolean;
        securityQuestionSetupRequired?: boolean;
      });
      return;
    }
    if (result.approvalRequired && result.requestToken) {
      setPendingApproval(result.requestToken);
      return;
    }
    if (!result.session) throw new Error("The login verification did not return a session.");
    const { error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (error) throw error;
    sessionStorage.removeItem(PENDING_LOGIN_SECURITY_KEY);
    setSecurityChallenge("");
    setSecurityChallengeQuestion("");
    setSecurityAnswerInput("");
    setLoginStep("credentials");
    if (completeSignupAfterLogin) {
      setCompleteSignupAfterLogin(false);
      const whatsappSettings = await fetchWhatsAppSettings();
      if (whatsappSettings.enabled) {
        toast({ title: "Account created!", description: "Your account is ready. Complete WhatsApp verification next." });
        navigate("/verify-whatsapp?new=1");
      } else {
        toast({ title: "Account created!", description: "WhatsApp verification is turned off. Your account is ready to use." });
        navigate("/", { replace: true });
      }
      return;
    }
    toast({ title: "Welcome back!", description: "Your login was verified." });
  };

  const cancelDeviceApproval = async () => {
    const token = approvalToken || sessionStorage.getItem(PENDING_LOGIN_APPROVAL_KEY);
    if (token) {
      try {
        await fetch("/api/auth/device-login/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestToken: token }),
        });
      } catch {
        // The server-side request still expires automatically.
      }
    }
    sessionStorage.removeItem(PENDING_LOGIN_APPROVAL_KEY);
    setApprovalToken(null);
    setLoginStep("credentials");
  };

  useEffect(() => {
    if (mode !== "signin" || loginStep !== "approval" || !approvalToken) return;
    let active = true;
    const poll = async () => {
      if (approvalPollInFlight.current) return;
      approvalPollInFlight.current = true;
      try {
        const response = await fetch("/api/auth/device-login/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestToken: approvalToken }),
        });
        const result = await response.json().catch(() => ({}));
        if (!active) return;
        if (result.status === "pending") return;
        if (result.status === "approved" && result.session) {
          await initSupabase();
          const { error } = await supabase.auth.setSession({
            access_token: result.session.access_token,
            refresh_token: result.session.refresh_token,
          });
          if (error) throw error;
          setApprovalToken(null);
          setLoginStep("credentials");
          toast({ title: "Login approved", description: "This device is now signed in." });
          return;
        }
        if (result.status === "completed") {
          sessionStorage.removeItem(PENDING_LOGIN_APPROVAL_KEY);
          setApprovalToken(null);
          setLoginStep("credentials");
          return;
        }
        if (result.status === "denied" || result.status === "cancelled" || result.status === "expired" || response.status === 410) {
          sessionStorage.removeItem(PENDING_LOGIN_APPROVAL_KEY);
          setApprovalToken(null);
          setLoginStep("credentials");
          toast({
            variant: "destructive",
            title: result.status === "denied" ? "Login denied" : "Approval request expired",
            description: result.status === "denied"
              ? "The signed-in device denied this login request."
              : "Start the sign-in again to request approval.",
          });
        } else if (!response.ok) {
          throw new Error(result.error || "Could not check the approval request.");
        }
      } catch {
        // Retry on the next poll; brief network interruptions should not cancel a valid request.
      } finally {
        approvalPollInFlight.current = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [approvalToken, loginStep, mode, toast]);

  const requestLoginOtp = async (phone: string, secret: string) => {
    await initSupabase();
    const response = await fetch("/api/auth/request-login-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password: secret, device: getDeviceInfo() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not send the WhatsApp code.");
    if (result.securityQuestionRequired || result.securityQuestionSetupRequired) {
      setPendingSecurityQuestion(result);
      return;
    }
    if (result.approvalRequired && result.requestToken) {
      setPendingApproval(result.requestToken);
      return;
    }
    if (result.session) {
      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw error;
      toast({ title: "Welcome back!", description: "Signed in without WhatsApp verification." });
      return;
    }
    if (!result.challengeId) throw new Error("Login verification could not be started.");
    setLoginChallenge(result.challengeId);
    setLoginMaskedPhone(result.masked || phone);
    setLoginOtp("");
    setLoginStep("otp");
    toast({ title: "Code sent to WhatsApp", description: `Enter the code sent to ${result.masked || "your phone"}.` });
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginOtp.trim().length !== 6) {
      toast({ variant: "destructive", title: "Enter the 6-digit code" });
      return;
    }
    setLoading(true);
    try {
      await initSupabase();
      const response = await fetch("/api/auth/verify-login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: loginChallenge, code: loginOtp.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The verification code is invalid.");
      await acceptLoginResult(result);
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Verification failed", description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySecurityQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (securityAnswerInput.trim().length < 10) {
      toast({ variant: "destructive", title: "Enter your answer phrase", description: "Use at least 10 characters." });
      return;
    }
    setLoading(true);
    try {
      await initSupabase();
      const response = await fetch(
        loginStep === "security_setup"
          ? "/api/auth/setup-login-security-question"
          : "/api/auth/verify-login-security-question",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            challengeId: securityChallenge,
            answer: securityAnswerInput,
            ...(loginStep === "security_setup" ? { question: securitySetupQuestion } : {}),
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The security answer could not be verified.");
      await acceptLoginResult(result);
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Security check failed", description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const cancelSecurityChallenge = () => {
    sessionStorage.removeItem(PENDING_LOGIN_SECURITY_KEY);
    setSecurityChallenge("");
    setSecurityChallengeQuestion("");
    setSecurityAnswerInput("");
    setSecuritySetupQuestion("");
    setLoginStep("credentials");
  };

  const handleBiometricLogin = async (type: "fingerprint" | "face") => {
    const storedCredential = hasStoredBiometric();
    if (!storedCredential) {
      toast({
        variant: "destructive",
        title: "No Biometric Enrolled",
        description: "Please sign in with your password first, then set up biometrics in Profile → Biometric Authentication.",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await authenticateWithBiometric();
      if (!result.success) {
        if (result.error !== "cancelled") {
          toast({ variant: "destructive", title: "Biometric Login Failed", description: result.error });
        }
        return;
      }

      if (!result.userId) return;
      const authData = getBiometricAuthData(result.userId);
      if (!authData) {
        toast({ variant: "destructive", title: "No Linked Account", description: "Please sign in with password first, then enroll biometrics from Profile settings." });
        return;
      }

      await requestLoginOtp(authData.phone, authData.password);
      toast({ title: `${type === "face" ? "Face ID" : "Fingerprint"} accepted`, description: "Confirm the WhatsApp code to finish signing in." });
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Error", description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signin" && loginStep !== "credentials") return;
    setLoading(true);

    try {
      // The page can render before the runtime Supabase config request
      // completes. Wait here so an immediate login never uses the temporary
      // localhost client and produces a misleading "Failed to fetch" error.
      await initSupabase();

      if (mode === "signup") {
        if (!phoneNumber) {
          toast({ variant: "destructive", title: "Invalid phone", description: "Please enter a valid phone number." });
          setLoading(false);
          return;
        }
        // Duplicate checking is a helpful server-side guard; registration still
        // enforces uniqueness through Supabase Auth.
        try {
          const availability = await fetch(`/api/auth/phone-availability?phone=${encodeURIComponent(phoneNumber)}`);
          const availabilityResult = await availability.json().catch(() => ({}));
          if (availability.ok && availabilityResult.available === false) {
            throw new Error("That phone number is already registered. Use another number or sign in.");
          }
          if (!availability.ok) {
            console.warn("[auth] Phone availability check skipped:", availabilityResult.error || availability.statusText);
          }
        } catch (availabilityError: unknown) {
          if (availabilityError instanceof Error && availabilityError.message.includes("already registered")) throw availabilityError;
          console.warn("[auth] Phone availability check unavailable; continuing signup.", availabilityError);
        }

        const registration = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: phoneToEmail(phoneNumber),
            password,
            metadata: {
              full_name: fullName,
              phone_number: phoneNumber,
              account_type: accountType,
            },
            securityQuestion,
            securityAnswer,
          }),
        });
        const registrationResult = await registration.json().catch(() => ({}));
        if (!registration.ok) {
          throw new Error(registrationResult.error || "Your account could not be created.");
        }

        setCompleteSignupAfterLogin(true);
        setMode("signin");
        const loginResponse = await fetch("/api/auth/request-device-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneNumber, password, device: getDeviceInfo() }),
        });
        const loginResult = await loginResponse.json().catch(() => ({}));
        if (loginResult.code === "WHATSAPP_VERIFICATION_REQUIRED") {
          await requestLoginOtp(phoneNumber, password);
          return;
        }
        if (!loginResponse.ok) throw new Error(loginResult.error || "Your account was created, but sign-in could not be completed.");
        await acceptLoginResult(loginResult);
      } else {
        if (!phoneNumber) {
          toast({ variant: "destructive", title: "Invalid phone", description: "Please enter a valid phone number." });
          setLoading(false);
          return;
        }

        const whatsappSettings = await fetchWhatsAppSettings();
        if (!whatsappSettings.loginEnabled) {
          const response = await fetch("/api/auth/request-device-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: phoneNumber, password, device: getDeviceInfo() }),
          });
          const result = await response.json().catch(() => ({}));
          if (result.code === "WHATSAPP_VERIFICATION_REQUIRED") {
            await requestLoginOtp(phoneNumber, password);
            return;
          }
          if (!response.ok) {
            throw new Error(result.error || "Invalid phone number or password.");
          }
          await acceptLoginResult(result);
        } else {
          await requestLoginOtp(phoneNumber, password);
        }
        return;
      }
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Error", description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BankingAuthLayout>
          <div>
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 border border-primary/30 bg-primary/10 rounded-lg mb-5">
                <ShieldCheck className="h-6 w-6 text-primary banking-glow" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {mode === "signin"
                  ? loginStep === "approval"
                    ? "Approve this sign-in"
                    : loginStep === "security" || loginStep === "security_setup"
                      ? "Verify this device"
                      : "Welcome back"
                  : "Create your account"}
              </h1>
              <p className="text-muted-foreground">
                {mode === "signin" && loginStep === "approval"
                  ? "Your account stays signed out here until you approve it on your other device."
                  : mode === "signin" && (loginStep === "security" || loginStep === "security_setup")
                    ? "Answer your security question to continue on this device."
                  : mode === "signin"
                    ? "Sign in to your NETLIFE CASH account."
                    : "Create your account to get started."}
              </p>
            </div>

            <form
              onSubmit={
                mode === "signin" && loginStep === "otp"
                  ? handleVerifyLoginOtp
                  : mode === "signin" && (loginStep === "security" || loginStep === "security_setup")
                    ? handleVerifySecurityQuestion
                    : handleAuth
              }
              className="space-y-5"
            >
              {mode === "signin" && loginStep === "approval" ? (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-primary/10 p-5 text-center">
                    <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
                    <h2 className="font-semibold text-lg">Waiting for approval</h2>
                    <p className="text-sm text-muted-foreground mt-2" data-testid="status-login-approval">
                      Open the device where you are already signed in and choose Allow. If approved, both devices stay signed in. This request expires in 5 minutes.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void cancelDeviceApproval()}
                    className="w-full h-14 rounded-xl"
                    data-testid="button-cancel-login-approval"
                  >
                    Cancel sign-in request
                  </Button>
                </div>
              ) : mode === "signin" && loginStep === "otp" ? (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-primary/10 p-5 text-center">
                    <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
                    <h2 className="font-semibold text-lg">Confirm your login</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      We sent a one-time code to WhatsApp {loginMaskedPhone || "on your phone"}.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-otp">WhatsApp verification code</Label>
                    <Input
                      id="login-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="h-14 rounded-xl text-center text-2xl tracking-[0.35em]"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" disabled={loading || loginOtp.length !== 6} className="w-full h-14 rounded-xl font-semibold">
                    {loading ? "Verifying…" : "Confirm and sign in"}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <Button variant="link" type="button" className="px-0" onClick={() => { setLoginStep("credentials"); setLoginChallenge(""); }}>
                      Use different details
                    </Button>
                    <Button variant="link" type="button" className="px-0" disabled={loading} onClick={() => { setLoading(true); requestLoginOtp(phoneNumber, password).catch((error) => toast({ variant: "destructive", title: "Could not resend code", description: error.message })).finally(() => setLoading(false)); }}>
                      Resend code
                    </Button>
                  </div>
                </div>
              ) : mode === "signin" && (loginStep === "security" || loginStep === "security_setup") ? (
                <div className="space-y-5">
                  <div className="rounded-2xl bg-primary/10 p-5">
                    <ShieldCheck className="mb-3 h-10 w-10 text-primary" />
                    <h2 className="font-semibold text-lg">New device security check</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      {loginStep === "security_setup"
                        ? "Set a question and private answer phrase to finish setting up your account security."
                        : securityChallengeQuestion}
                    </p>
                  </div>
                  {loginStep === "security_setup" && (
                    <div className="space-y-2">
                      <Label htmlFor="security-setup-question">Your security question</Label>
                      <Input
                        id="security-setup-question"
                        value={securitySetupQuestion}
                        onChange={(event) => setSecuritySetupQuestion(event.target.value)}
                        placeholder="Write a question only you can answer"
                        minLength={6}
                        maxLength={160}
                        required
                        data-testid="input-security-setup-question"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="security-login-answer">Your answer phrase</Label>
                    <Input
                      id="security-login-answer"
                      type="password"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={securityAnswerInput}
                      onChange={(event) => setSecurityAnswerInput(event.target.value)}
                      placeholder="At least 10 characters"
                      minLength={10}
                      maxLength={200}
                      required
                      data-testid="input-security-login-answer"
                    />
                    {loginStep === "security_setup" && (
                      <p className="text-xs text-muted-foreground">
                        Choose a unique phrase others cannot guess. Your answer is stored as a one-way hash.
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || securityAnswerInput.trim().length < 10 || (loginStep === "security_setup" && securitySetupQuestion.trim().length < 6)}
                    className="w-full h-14 rounded-xl font-semibold"
                    data-testid="button-submit-security-answer"
                  >
                    {loading ? "Verifying…" : loginStep === "security_setup" ? "Save and sign in" : "Verify and sign in"}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full"
                    onClick={cancelSecurityChallenge}
                    disabled={loading}
                    data-testid="button-cancel-security-check"
                  >
                    Use different details
                  </Button>
                </div>
              ) : (
                <>
              {mode === "signup" && (
                <>
                  <div className="space-y-3">
                    <Label>Account Type</Label>
                    <RadioGroup
                      value={accountType}
                      onValueChange={(value) => setAccountType(value as AccountType)}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div>
                        <RadioGroupItem value="client" id="auth-client" className="peer sr-only" />
                        <Label
                          htmlFor="auth-client"
                          className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                        >
                          <Users className="mb-2 h-6 w-6" />
                          <span className="font-medium text-sm">Customer</span>
                        </Label>
                      </div>
                      <div>
                        <RadioGroupItem value="vendor" id="auth-vendor" className="peer sr-only" />
                        <Label
                          htmlFor="auth-vendor"
                          className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                        >
                          <Store className="mb-2 h-6 w-6" />
                          <span className="font-medium text-sm">Vendor</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fullName">{accountType === "vendor" ? "Business Name" : "Full Name"}</Label>
                    <Input
                      id="fullName"
                      placeholder={accountType === "vendor" ? "Your Business Name" : "Enter your full name"}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="h-14 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="security-question">Security question</Label>
                    <Input
                      id="security-question"
                      value={securityQuestion}
                      onChange={(event) => setSecurityQuestion(event.target.value)}
                      placeholder="Write a question only you can answer"
                      minLength={6}
                      maxLength={160}
                      required
                      data-testid="input-registration-security-question"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="security-answer">Private answer phrase</Label>
                    <Input
                      id="security-answer"
                      type="password"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={securityAnswer}
                      onChange={(event) => setSecurityAnswer(event.target.value)}
                      placeholder="Use at least 10 characters"
                      minLength={10}
                      maxLength={200}
                      required
                      data-testid="input-registration-security-answer"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use a unique phrase that other people cannot guess. You can change both in Security settings.
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <CountryPhoneInput
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  className="h-14"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-14 rounded-xl pr-12"
                  />
                  <Button variant="ghost" size="icon"
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </Button>
                </div>
              </div>

              {mode === "signin" && (
                <div className="flex justify-end">
                  <Button variant="link"
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="h-auto px-0 py-0 text-sm"
                  >
                    Forgot password?
                  </Button>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg"
              >
                {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
              </Button>

              {mode === "signin" && biometricAvailable && (
                <div className="space-y-3">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or unlock with</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleBiometricLogin("fingerprint")}
                      disabled={loading}
                      className="flex-1 h-14 rounded-xl flex items-center justify-center gap-2"
                    >
                      <Fingerprint size={20} />
                      <span className="text-sm font-medium">Fingerprint</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleBiometricLogin("face")}
                      disabled={loading}
                      className="flex-1 h-14 rounded-xl flex items-center justify-center gap-2"
                    >
                      <ScanFace size={20} />
                      <span className="text-sm font-medium">Face ID</span>
                    </Button>
                  </div>
                </div>
              )}
                </>
              )}
            </form>

            {(mode !== "signin" || loginStep === "credentials") && (
              <div className="mt-8 text-center space-y-3">
                <p className="text-muted-foreground text-sm">
                  {mode === "signin" ? "Don't have an account?" : "Already have an account?"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setLoginStep("credentials");
                    setLoginChallenge("");
                    setLoginOtp("");
                  }}
                  className="w-full h-12 rounded-xl font-semibold"
                >
                  {mode === "signin" ? "Register Now" : "Sign In"}
                </Button>
                {mode === "signin" && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full gap-2 text-primary"
                    onClick={() => {
                      if (!supportWhatsapp) {
                        toast({ variant: "destructive", title: "Agent chat is not configured", description: "Ask an administrator to configure the WhatsApp support number." });
                        return;
                      }
                      window.open(buildWhatsAppLink(supportWhatsapp, "Hello, I need help signing in to NETLIFE CASH."), "_blank", "noopener,noreferrer");
                    }}
                  >
                    <MessageCircle size={18} /> Chat with an agent
                  </Button>
                )}
              </div>
            )}
          </div>
    </BankingAuthLayout>
  );
};

export default Auth;
