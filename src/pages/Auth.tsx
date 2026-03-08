import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Fingerprint, Copy, AlertTriangle, Store, Users, ScanFace, ShieldCheck } from "lucide-react";
import { generateWallet, encryptPrivateKey } from "@/lib/wallet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  isBiometricAvailable,
  enrollBiometric,
  authenticateWithBiometric,
  linkCredentialToPhone,
  getBiometricAuthData,
  hasStoredBiometric,
} from "@/lib/biometricAuth";

type AuthMode = "signin" | "signup";
type AccountType = "client" | "vendor";

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasBiometricStored, setHasBiometricStored] = useState(false);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [walletData, setWalletData] = useState<{ address: string; privateKey: string; mnemonic?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
    setHasBiometricStored(!!hasStoredBiometric());
  }, []);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleBiometricLogin = async (type: "fingerprint" | "face") => {
    // Check if any biometric is enrolled locally first
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
        email: `${authData.phone}@vbank.com`,
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
        const wallet = generateWallet();
        setWalletData(wallet);
        const encryptedKey = await encryptPrivateKey(wallet.privateKey, password);

        const { data: authData, error } = await supabase.auth.signUp({
          email: `${phoneNumber}@vbank.com`,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phoneNumber,
              account_type: accountType,
              wallet_address: wallet.address,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        if (authData.user) {
          const { error: walletError } = await supabase.from("user_wallets").insert({
            user_id: authData.user.id,
            wallet_address: wallet.address,
            encrypted_private_key: encryptedKey,
          });
          if (walletError) console.error("Error saving wallet:", walletError);

          await supabase.from("profiles").update({
            wallet_address: wallet.address,
            wallet_created_at: new Date().toISOString(),
          }).eq("id", authData.user.id);
        }

        setShowWalletDialog(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: `${phoneNumber}@vbank.com`,
          password,
        });
        if (error) throw error;

        toast({ title: "Welcome back!", description: "Signed in successfully" });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseWalletDialog = () => {
    setShowWalletDialog(false);
    setWalletData(null);
    toast({ title: "Account created!", description: "Welcome to Virtual Bank" });
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
                <Label htmlFor="phoneNumber">Mobile Number</Label>
                <Input
                  id="phoneNumber"
                  type="text"
                  placeholder="Enter Mobile Number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  className="h-14 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
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

      {/* Biometric Enrollment Dialog */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Enable Quick Login
            </DialogTitle>
            <DialogDescription>
              Set up biometric authentication to sign in faster next time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              onClick={() => handleEnrollBiometric("fingerprint")}
              className="w-full h-14 rounded-xl flex items-center justify-center gap-3"
            >
              <Fingerprint size={22} />
              <span>Set Up Fingerprint</span>
            </Button>
            <Button
              onClick={() => handleEnrollBiometric("face")}
              variant="outline"
              className="w-full h-14 rounded-xl flex items-center justify-center gap-3"
            >
              <ScanFace size={22} />
              <span>Set Up Face ID</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowEnrollDialog(false);
                toast({ title: "Welcome back!", description: "Signed in successfully" });
              }}
              className="w-full"
            >
              Skip for now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Created Dialog */}
      <Dialog open={showWalletDialog} onOpenChange={setShowWalletDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Save Your Wallet Keys
            </DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              IMPORTANT: Save these keys securely. You will NOT be able to see your private key again!
            </DialogDescription>
          </DialogHeader>

          {walletData && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Wallet Address</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg text-xs break-all">{walletData.address}</code>
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(walletData.address, "address")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === "address" && <span className="text-xs text-green-500">Copied!</span>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-destructive">Private Key (KEEP SECRET!)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-destructive/10 rounded-lg text-xs break-all border border-destructive/20">{walletData.privateKey}</code>
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(walletData.privateKey, "privateKey")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === "privateKey" && <span className="text-xs text-green-500">Copied!</span>}
              </div>

              {walletData.mnemonic && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-destructive">Recovery Phrase (KEEP SECRET!)</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-destructive/10 rounded-lg text-xs break-all border border-destructive/20">{walletData.mnemonic}</code>
                    <Button size="icon" variant="outline" onClick={() => copyToClipboard(walletData.mnemonic!, "mnemonic")}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {copiedField === "mnemonic" && <span className="text-xs text-green-500">Copied!</span>}
                </div>
              )}

              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Your private key is encrypted and stored securely. However, you should still save a backup of your private key and recovery phrase in a safe place.
                </p>
              </div>

              <Button className="w-full" onClick={handleCloseWalletDialog}>
                I've Saved My Keys - Continue
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
