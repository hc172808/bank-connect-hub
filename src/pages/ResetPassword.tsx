import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, KeyRound, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

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

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [isRecovery, setIsRecovery]     = useState(false);
  const [done, setDone]                 = useState(false);
  const [failure, setFailure]           = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts the access_token + type in the URL hash after email recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("type=signup")) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match", description: "Both fields must be the same." });
      return;
    }
    if (password.length < 6) {
      toast({ variant: "destructive", title: "Password too short", description: "Minimum 6 characters." });
      return;
    }
    setLoading(true);
    setFailure(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast({ title: "Password updated!", description: "Sign in with your new password." });
      await supabase.auth.signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFailure(msg);
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  // Explicit failure screen
  if (failure) {
    return (
      <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-destructive/30">
          <CardContent className="p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <KeyRound className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Password not updated</h2>
              <p className="text-muted-foreground text-sm mt-1">
                We couldn't change your password. Here's exactly what went wrong:
              </p>
            </div>
            <p className="text-xs font-mono bg-muted rounded-lg p-3 break-words text-left">{failure}</p>
            <div className="space-y-2">
              <Button className="w-full" onClick={() => setFailure(null)}>Try Again</Button>
              <Button variant="outline" className="w-full" onClick={() => navigate("/forgot-password")}>
                Request a New Reset Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid / expired link
  if (!isRecovery && !done) {
    return (
      <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-primary/20">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <KeyRound className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Invalid or Expired Link</h2>
            <p className="text-muted-foreground text-sm">
              This password reset link is invalid or has expired. Links are valid for 24 hours and can only be used once.
            </p>
            <div className="space-y-2">
              <Button onClick={() => navigate("/forgot-password")} className="w-full">
                Request a New Code
              </Button>
              <Button variant="outline" onClick={() => navigate("/auth")} className="w-full">
                Back to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (done) {
    return (
      <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-primary/20">
          <CardContent className="p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Password updated!</h2>
              <p className="text-muted-foreground text-sm mt-1">You can now sign in with your new password.</p>
            </div>
            <Button className="w-full" onClick={() => navigate("/auth")}>Sign In Now</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Set New Password</CardTitle>
                <CardDescription>Choose a strong password for your account</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReset} className="space-y-5">
              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <StrengthBar password={password} />
              </div>

              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={loading || password.length < 6 || password !== confirmPassword}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                  : <><KeyRound className="w-4 h-4" /> Update Password</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
