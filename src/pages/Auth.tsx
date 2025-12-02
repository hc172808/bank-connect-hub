import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Fingerprint } from "lucide-react";

type AuthMode = "signin" | "signup";
type UserRole = "client" | "agent" | "admin";

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: `${phoneNumber}@vbank.com`,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phoneNumber,
              role: role,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        toast({
          title: "Account created!",
          description: "Welcome to Virtual Bank",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: `${phoneNumber}@vbank.com`,
          password,
        });

        if (error) throw error;

        toast({
          title: "Welcome back!",
          description: "Signed in successfully",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-card overflow-hidden">
          {/* Card Stripes */}
          <div className="h-3 flex">
            <div className="flex-1 bg-card-stripe-1" />
            <div className="flex-1 bg-card-stripe-2" />
            <div className="flex-1 bg-card-stripe-3" />
          </div>

          {/* Card Content */}
          <div className="p-8">
            {/* Logo */}
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
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      placeholder="Enter your full name"
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
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Having trouble signing in?
                </button>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-14 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg"
                >
                  {loading ? "Please wait..." : mode === "signin" ? "Next" : "Sign Up"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-14 h-14 rounded-xl p-0"
                >
                  <Fingerprint size={24} />
                </Button>
              </div>
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
