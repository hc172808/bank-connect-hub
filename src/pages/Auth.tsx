import { useState, useEffect } from "react";
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

type AuthMode = "signin" | "signup";
type AccountType = "client" | "vendor";
type LoginStep = "credentials" | "otp";

const phoneToEmail = (e164: string) => `${e164.replace("+", "")}@vbank.com`;
const phoneEmailCandidates = (value: string) => {
  const raw = value.replace(/\D/g, "");
  const normalized = raw.length === 7 ? `592${raw}` : raw;
  return [...new Set([
    `${normalized}@vbank.com`,
    `${raw}@vbank.com`,
    `${raw.replace(/^592/, "")}@vbank.com`,
    `${normalized}@virtualbank.app`,
    `${raw}@virtualbank.app`,
  ].filter((email) => !email.startsWith("@")))];
};

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginStep, setLoginStep] = useState<LoginStep>("credentials");
  const [loginChallenge, setLoginChallenge] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [loginMaskedPhone, setLoginMaskedPhone] = useState("");
  const [supportWhatsapp, setSupportWhatsapp] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);
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

  const requestLoginOtp = async (phone: string, secret: string) => {
    await initSupabase();
    const response = await fetch("/api/auth/request-login-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password: secret }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not send the WhatsApp code.");
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
      if (!response.ok || !result.session) throw new Error(result.error || "The verification code is invalid.");
      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error) throw error;
      toast({ title: "Welcome back!", description: "Your login was verified." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Verification failed", description: error.message });
    } finally {
      setLoading(false);
    }
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

      const authData = getBiometricAuthData(result.userId!);
      if (!authData) {
        toast({ variant: "destructive", title: "No Linked Account", description: "Please sign in with password first, then enroll biometrics from Profile settings." });
        return;
      }

      await requestLoginOtp(authData.phone, authData.password);
      toast({ title: `${type === "face" ? "Face ID" : "Fingerprint"} accepted`, description: "Confirm the WhatsApp code to finish signing in." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
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
        // Duplicate checking is a helpful server-side guard, but registration
        // must not depend on the optional service-role key. Supabase Auth still
        // enforces the unique login email when signUp() runs below.
        try {
          const availability = await fetch(`/api/auth/phone-availability?phone=${encodeURIComponent(phoneNumber)}`);
          const availabilityResult = await availability.json().catch(() => ({}));
          if (availability.ok && availabilityResult.available === false) {
            throw new Error("That phone number is already registered. Use another number or sign in.");
          }
          if (!availability.ok) {
            console.warn("[auth] Phone availability check skipped:", availabilityResult.error || availability.statusText);
          }
        } catch (availabilityError: any) {
          if (availabilityError?.message?.includes("already registered")) throw availabilityError;
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
          }),
        });
        const registrationResult = await registration.json().catch(() => ({}));
        if (!registration.ok) {
          throw new Error(registrationResult.error || "Your account could not be created.");
        }

        // The server creates and confirms the internal phone email. Sign in
        // through the normal client so the browser receives its session.
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: phoneToEmail(phoneNumber),
          password,
        });
        if (loginError) throw loginError;

        toast({
          title: "Account created!",
          description: "Your account is ready. Complete WhatsApp verification next.",
        });
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          navigate("/verify-whatsapp?new=1");
        } else {
          toast({
            title: "Sign in to continue",
            description: "After confirming your account, sign in and open WhatsApp Verification from your Profile.",
          });
        }
      } else {
        if (!phoneNumber) {
          toast({ variant: "destructive", title: "Invalid phone", description: "Please enter a valid phone number." });
          setLoading(false);
          return;
        }

        const whatsappSettings = await fetchWhatsAppSettings();
        if (!whatsappSettings.loginEnabled) {
          let lastError: { message?: string } | null = null;
          let signedIn = false;
          for (const email of phoneEmailCandidates(phoneNumber)) {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (!error && data.session) {
              signedIn = true;
              break;
            }
            lastError = error;
          }
          if (!signedIn) throw new Error(lastError?.message || "Invalid phone number or password.");
          toast({ title: "Welcome back!", description: "WhatsApp login verification is currently disabled." });
        } else {
          await requestLoginOtp(phoneNumber, password);
        }
        return;
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-card overflow-hidden">
          <div className="h-3 flex">
            <div className="flex-1 bg-card-stripe-1" />
            <div className="flex-1 bg-card-stripe-2" />
            <div className="flex-1 bg-card-stripe-3" />
          </div>

          <div className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4">
                <div className="grid grid-cols-2 gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-2 h-2 bg-foreground rounded-full" />
                  ))}
                </div>
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {mode === "signin" ? "Sign in" : "Register Now"}
              </h1>
              <p className="text-muted-foreground">
                {mode === "signin"
                  ? "Hello! Enter your details to sign in to your account."
                  : "Create your account to get started."}
              </p>
            </div>

            <form onSubmit={mode === "signin" && loginStep === "otp" ? handleVerifyLoginOtp : handleAuth} className="space-y-6">
              {mode === "signin" && loginStep === "otp" ? (
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
                    <button type="button" className="text-primary underline" onClick={() => { setLoginStep("credentials"); setLoginChallenge(""); }}>
                      Use different details
                    </button>
                    <button type="button" className="text-primary underline" disabled={loading} onClick={() => { setLoading(true); requestLoginOtp(phoneNumber, password).catch((error) => toast({ variant: "destructive", title: "Could not resend code", description: error.message })).finally(() => setLoading(false)); }}>
                      Resend code
                    </button>
                  </div>
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
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {mode === "signin" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-sm text-primary hover:text-primary/80 font-medium underline underline-offset-2"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg"
              >
                {loading ? "Please wait..." : mode === "signin" ? "Next" : "Sign Up"}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
