import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mail, Phone, User, Store, Users, Gift } from 'lucide-react';
import { CountryPhoneInput } from '@/components/CountryPhoneInput';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { storeUsedReferralCode } from '@/lib/rewards';
import { BankingAuthLayout } from '@/components/BankingAuthLayout';

type AccountType = 'client' | 'vendor';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [searchParams] = useSearchParams();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [referralCode, setReferralCode] = useState(() => searchParams.get('ref')?.toUpperCase() || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('client');
  const navigate = useNavigate();
  const { toast } = useToast();
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber) {
      toast({ variant: "destructive", title: "Invalid phone", description: "Please enter a valid phone number." });
      return;
    }

    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Password mismatch", description: "Passwords do not match" });
      return;
    }

    if (password.length < 6) {
      toast({ variant: "destructive", title: "Weak password", description: "Password must be at least 6 characters" });
      return;
    }
    if (securityQuestion.trim().length < 6 || securityAnswer.trim().length < 10) {
      toast({
        variant: "destructive",
        title: "Security question required",
        description: "Enter a question and an answer phrase of at least 10 characters.",
      });
      return;
    }

    setLoading(true);

    try {
      const digits = phoneNumber.replace(/\D+/g, "");
      const emailToUse = `${digits}@vbank.com`;

      // Route through the build-server so the service role key can auto-confirm
      // the account — avoids the email confirmation loop with fake addresses.
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailToUse,
          password,
          metadata: {
            full_name: fullName,
            phone_number: phoneNumber,
            account_type: accountType,
            contact_email: email.trim(),
          },
          securityQuestion,
          securityAnswer,
        }),
      });

      const result = await res.json();
      if (!res.ok && res.status === 409) {
        toast({
          variant: "destructive",
          title: "Account already exists",
          description: result.error || "This phone number is already linked to an account. Sign in or use Forgot password.",
        });
        navigate('/auth');
        return;
      }
      if (!res.ok) throw new Error(result.error || 'Registration failed');

      if (referralCode.trim()) {
        storeUsedReferralCode(referralCode.trim());
      }

      toast({
        title: "Account created!",
        description: result.confirmed
          ? "You can now sign in with your phone number and password."
          : "Check your email to confirm your account, then sign in.",
      });
      navigate('/auth');
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BankingAuthLayout>
      <div>
        <div className="space-y-2 mb-7">
          <h1 className="text-3xl font-bold text-foreground">
            Create Account
          </h1>
          <p className="text-muted-foreground">Join NETLIFE CASH.</p>
        </div>
        <div>
          <form onSubmit={handleRegister} className="space-y-4">
            {/* Account Type Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Account Type</label>
              <RadioGroup
                value={accountType}
                onValueChange={(value) => setAccountType(value as AccountType)}
                className="grid grid-cols-2 gap-4"
              >
                <div>
                  <RadioGroupItem value="client" id="client" className="peer sr-only" />
                  <Label
                    htmlFor="client"
                    className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Users className="mb-2 h-6 w-6" />
                    <span className="font-medium">Customer</span>
                    <span className="text-xs text-muted-foreground">Personal use</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="vendor" id="vendor" className="peer sr-only" />
                  <Label
                    htmlFor="vendor"
                    className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <Store className="mb-2 h-6 w-6" />
                    <span className="font-medium">Vendor</span>
                    <span className="text-xs text-muted-foreground">Sell products</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                {accountType === 'vendor' ? 'Business Name' : 'Full Name'}
              </label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={accountType === 'vendor' ? 'Your Business Name' : 'John Doe'}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone Number
              </label>
              <CountryPhoneInput value={phoneNumber} onChange={setPhoneNumber} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Contact email (Optional)
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Security Question</label>
              <Input
                type="text"
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                placeholder="Write a question only you can answer"
                minLength={6}
                maxLength={160}
                required
                data-testid="input-registration-security-question"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Private Answer Phrase</label>
              <Input
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Use at least 10 characters"
                minLength={10}
                maxLength={200}
                required
                data-testid="input-registration-security-answer"
              />
              <p className="text-xs text-muted-foreground">
                Choose a unique phrase others cannot guess. You can update both in Security settings.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
                <Button variant="ghost" size="icon"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Gift className="w-4 h-4 text-primary" />
                Referral Code{" "}
                <span className="text-xs text-muted-foreground font-normal">(Optional — earn 100 bonus points!)</span>
              </label>
              <Input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3D4"
                maxLength={8}
                className="font-mono tracking-widest uppercase"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Register'}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Button variant="link"
                type="button"
                onClick={() => navigate('/auth')}
                className="px-1"
              >
                Sign In
              </Button>
            </div>
          </form>
        </div>
      </div>
    </BankingAuthLayout>
  );
}
