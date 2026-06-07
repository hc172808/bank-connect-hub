import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Fingerprint, Store, Users, ScanFace } from "lucide-react";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  isBiometricAvailable,
  authenticateWithBiometric,
  getBiometricAuthData,
  hasStoredBiometric,
} from "@/lib/biometricAuth";

type AuthMode = "signin" | "signup";
type AccountType = "client" | "vendor";

const phoneToEmail = (e164: string) => `${e164.replace("+", "")}@vbank.com`;

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

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

      const { error } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(authData.phone),
        password: authData.password,
      });

      if (error) throw error;
      toast({ title: "Welcome back!", description: `Signed in with ${type === "face" ? "Face ID" : "Fingerprint"}` });
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
      if (mode === "signup") {
        if (!phoneNumber) {
          toast({ variant: "destructive", title: "Invalid phone", description: "Please enter a valid phone number." });
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: phoneToEmail(phoneNumber),
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phoneNumber,
              account_type: accountType,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        toast({
          title: "Account created!",
          description: "You can create or import a blockchain wallet later from Profile → Blockchain Wallet.",
        });
      } else {
        if (!phoneNumber) {
          toast({ variant: "destructive", title: "Invalid phone", description: "Please enter a valid phone number." });
          setLoading(false);
          return;
        }

        const digits = phoneNumber.replace(/\D+/g, "");
        const emailCandidates = [
          phoneToEmail(phoneNumber),
          `${digits}@vbank.com`,
          `${digits}@virtualbank.app`,
        ].filter((x, i, arr) => arr.indexOf(x) === i);

        let signedIn = false;
        let lastError: any = null;
        for (const email of emailCandidates) {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error) { signedIn = true; break; }
          lastError = error;
        }
        if (!signedIn) throw lastError ?? new Error("Sign-in failed");

        toast({ title: "Welcome back!", description: "Signed in successfully" });
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

            <form onSubmit={handleAuth} className="space-y-6">
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
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Having trouble signing in?
                </button>
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
            </form>

            <div className="mt-8 text-center space-y-3">
              <p className="text-muted-foreground text-sm">
                {mode === "signin" ? "Don't have an account?" : "Already have an account?"}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="w-full h-12 rounded-xl font-semibold"
              >
                {mode === "signin" ? "Register Now" : "Sign In"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
