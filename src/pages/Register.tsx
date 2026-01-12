import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mail, Phone, User, Copy, AlertTriangle, Store, Users } from 'lucide-react';
import { generateWallet, encryptPrivateKey } from '@/lib/wallet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type AccountType = 'client' | 'vendor';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [walletData, setWalletData] = useState<{ address: string; privateKey: string; mnemonic?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<AccountType>('client');
  const navigate = useNavigate();
  const { toast } = useToast();

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleCloseWalletDialog = () => {
    setShowWalletDialog(false);
    setWalletData(null);
    toast({
      title: "Account created!",
      description: "Welcome to Virtual Bank",
    });
    navigate('/auth');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Password mismatch",
        description: "Passwords do not match",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        variant: "destructive",
        title: "Weak password",
        description: "Password must be at least 6 characters",
      });
      return;
    }

    setLoading(true);

    try {
      // Generate wallet for new user
      const wallet = generateWallet();
      setWalletData(wallet);

      // Encrypt private key with user's password
      const encryptedKey = await encryptPrivateKey(wallet.privateKey, password);

      const emailToUse = email || `${phoneNumber}@virtualbank.app`;
      
      const { data, error } = await supabase.auth.signUp({
        email: emailToUse,
        password,
        options: {
          data: {
            full_name: fullName,
            phone_number: phoneNumber,
            wallet_address: wallet.address,
            account_type: accountType,
          },
          emailRedirectTo: `${window.location.origin}/`,
        }
      });

      if (error) throw error;

      if (data.user) {
        // Save wallet to user_wallets table
        const { error: walletSaveError } = await supabase
          .from('user_wallets')
          .insert({
            user_id: data.user.id,
            wallet_address: wallet.address,
            encrypted_private_key: encryptedKey,
          });

        if (walletSaveError) {
          console.error('Error saving wallet:', walletSaveError);
        }

        // Show wallet dialog with private key
        setShowWalletDialog(true);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message,
      });
      setWalletData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-primary/20">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-yellow-600 bg-clip-text text-transparent">
            Create Account
          </CardTitle>
          <CardDescription>Register for a new account</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email (Optional)
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
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
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
              className="w-full bg-gradient-to-r from-primary to-yellow-600 hover:opacity-90"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Register'}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <button
                type="button"
                onClick={() => navigate('/auth')}
                className="text-primary hover:underline font-medium"
              >
                Sign In
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                <label className="text-sm font-medium">Wallet Address</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg text-xs break-all">
                    {walletData.address}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(walletData.address, 'address')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === 'address' && <span className="text-xs text-green-500">Copied!</span>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-destructive">Private Key (KEEP SECRET!)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-destructive/10 rounded-lg text-xs break-all border border-destructive/20">
                    {walletData.privateKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(walletData.privateKey, 'privateKey')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === 'privateKey' && <span className="text-xs text-green-500">Copied!</span>}
              </div>

              {walletData.mnemonic && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-destructive">Recovery Phrase (KEEP SECRET!)</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-destructive/10 rounded-lg text-xs break-all border border-destructive/20">
                      {walletData.mnemonic}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(walletData.mnemonic!, 'mnemonic')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {copiedField === 'mnemonic' && <span className="text-xs text-green-500">Copied!</span>}
                </div>
              )}

              <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Your private key is encrypted and stored securely. However, you should still save a backup of your private key and recovery phrase in a safe place.
                </p>
              </div>

              <Button
                className="w-full"
                onClick={handleCloseWalletDialog}
              >
                I've Saved My Keys - Continue
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
