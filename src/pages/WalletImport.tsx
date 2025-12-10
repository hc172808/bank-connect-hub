import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, FileText, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ethers } from 'ethers';
import { encryptPrivateKey } from '@/lib/wallet';

export default function WalletImport() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [importMethod, setImportMethod] = useState<'privateKey' | 'mnemonic'>('privateKey');

  const validateAndImport = async () => {
    if (!password || password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      let walletAddress: string;
      let walletPrivateKey: string;

      if (importMethod === 'privateKey') {
        if (!privateKey.trim()) {
          throw new Error('Please enter a private key');
        }
        // Validate and create wallet from private key
        const wallet = new ethers.Wallet(privateKey.trim());
        walletAddress = wallet.address;
        walletPrivateKey = wallet.privateKey;
      } else {
        if (!mnemonic.trim()) {
          throw new Error('Please enter a mnemonic phrase');
        }
        // Validate and create wallet from mnemonic
        const hdWallet = ethers.Wallet.fromPhrase(mnemonic.trim());
        walletAddress = hdWallet.address;
        walletPrivateKey = hdWallet.privateKey;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if user already has a wallet
      const { data: existingWallet } = await supabase
        .from('user_wallets')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingWallet) {
        toast({ title: 'Error', description: 'You already have a wallet. Please contact support to change it.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Encrypt the private key
      const encryptedKey = await encryptPrivateKey(walletPrivateKey, password);

      // Save to user_wallets
      const { error: walletError } = await supabase
        .from('user_wallets')
        .insert({
          user_id: user.id,
          wallet_address: walletAddress,
          encrypted_private_key: encryptedKey,
        });

      if (walletError) throw walletError;

      // Update profile with wallet address
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          wallet_address: walletAddress,
          wallet_created_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast({ title: 'Success', description: 'Wallet imported successfully!' });
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Import error:', error);
      toast({ 
        title: 'Import Failed', 
        description: error.message || 'Invalid private key or mnemonic phrase', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Import Wallet</CardTitle>
            <CardDescription>
              Import an existing blockchain wallet using your private key or mnemonic phrase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={importMethod} onValueChange={(v) => setImportMethod(v as 'privateKey' | 'mnemonic')}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="privateKey" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Private Key
                </TabsTrigger>
                <TabsTrigger value="mnemonic" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Mnemonic
                </TabsTrigger>
              </TabsList>

              <TabsContent value="privateKey" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="privateKey">Private Key</Label>
                  <div className="relative">
                    <Input
                      id="privateKey"
                      type={showPrivateKey ? 'text' : 'password'}
                      placeholder="Enter your private key (0x...)"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                    >
                      {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="mnemonic" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mnemonic">Mnemonic Phrase (12 or 24 words)</Label>
                  <Textarea
                    id="mnemonic"
                    placeholder="Enter your mnemonic phrase separated by spaces"
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                    rows={3}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-4 mt-6">
              <div className="space-y-2">
                <Label htmlFor="password">Encryption Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter a password to encrypt your wallet"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <Button 
                onClick={validateAndImport} 
                disabled={loading} 
                className="w-full"
              >
                {loading ? 'Importing...' : 'Import Wallet'}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Your private key will be encrypted and stored securely. Never share your private key or mnemonic phrase with anyone.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
