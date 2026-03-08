import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, User, Phone, MapPin, Calendar, Camera, FileText, Wallet, Copy, AlertTriangle, Lock, Fingerprint, ScanFace, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { generateWallet, encryptPrivateKey } from '@/lib/wallet';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SetPinDialog } from '@/components/SetPinDialog';
import { isBiometricAvailable, enrollBiometric, linkCredentialToPhone } from '@/lib/biometricAuth';

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [showCreateWallet, setShowCreateWallet] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [walletPassword, setWalletPassword] = useState('');
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [newWalletData, setNewWalletData] = useState<{ address: string; privateKey: string; mnemonic?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [showSetPinDialog, setShowSetPinDialog] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricDevices, setBiometricDevices] = useState<any[]>([]);
  const [enrollingBiometric, setEnrollingBiometric] = useState(false);
  const [profile, setProfile] = useState({
    full_name: '',
    phone_number: '',
    avatar_url: '',
    address: '',
    city: '',
    country: '',
    date_of_birth: '',
    bio: '',
  });

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchWallet();
      checkPinStatus();
      fetchBiometricDevices();
      isBiometricAvailable().then(setBiometricAvailable);
    }
  }, [user]);

  const fetchBiometricDevices = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('biometric_credentials')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setBiometricDevices(data || []);
  };

  const handleEnrollBiometric = async (type: 'fingerprint' | 'face') => {
    if (!user) return;
    setEnrollingBiometric(true);
    const result = await enrollBiometric(user.id, profile.phone_number || user.email || '', type);
    if (result.success) {
      const { data: creds } = await supabase
        .from('biometric_credentials')
        .select('credential_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (creds && creds.length > 0) {
        linkCredentialToPhone(creds[0].credential_id, profile.phone_number, '');
      }
      toast({ title: 'Biometric Enrolled!', description: `${type === 'face' ? 'Face ID' : 'Fingerprint'} is now set up.` });
      fetchBiometricDevices();
    } else if (result.error !== 'cancelled') {
      toast({ variant: 'destructive', title: 'Enrollment Failed', description: result.error });
    }
    setEnrollingBiometric(false);
  };

  const handleRemoveBiometric = async (id: string) => {
    const { error } = await supabase.from('biometric_credentials').delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to remove biometric' });
    } else {
      toast({ title: 'Removed', description: 'Biometric credential removed' });
      fetchBiometricDevices();
    }
  };


  const checkPinStatus = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('profiles')
      .select('pin_hash')
      .eq('id', user.id)
      .single();
    
    setHasPin(!!data?.pin_hash);
  };

  const fetchWallet = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_wallets')
      .select('wallet_address')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setWalletAddress(data.wallet_address);
    } else {
      setShowCreateWallet(true);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleCreateWallet = async () => {
    if (!user || !walletPassword) {
      toast({
        variant: "destructive",
        title: "Password required",
        description: "Please enter your password to create a wallet",
      });
      return;
    }

    setCreatingWallet(true);

    try {
      const wallet = generateWallet();
      const encryptedKey = await encryptPrivateKey(wallet.privateKey, walletPassword);

      const { error } = await supabase
        .from('user_wallets')
        .insert({
          user_id: user.id,
          wallet_address: wallet.address,
          encrypted_private_key: encryptedKey,
        });

      if (error) throw error;

      // Update profile with wallet address
      await supabase
        .from('profiles')
        .update({
          wallet_address: wallet.address,
          wallet_created_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      setWalletAddress(wallet.address);
      setNewWalletData(wallet);
      setShowCreateWallet(false);
      setShowWalletDialog(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setCreatingWallet(false);
      setWalletPassword('');
    }
  };

  const fetchProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, phone_number, avatar_url, address, city, country, date_of_birth, bio')
      .eq('id', user.id)
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load profile",
      });
      return;
    }

    if (data) {
      setProfile({
        full_name: data.full_name || '',
        phone_number: data.phone_number || '',
        avatar_url: data.avatar_url || '',
        address: data.address || '',
        city: data.city || '',
        country: data.country || '',
        date_of_birth: data.date_of_birth || '',
        bio: data.bio || '',
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: "Please select an image file",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please select an image under 2MB",
      });
      return;
    }

    setUploading(true);

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    // Delete old avatar if exists
    if (profile.avatar_url) {
      const oldPath = profile.avatar_url.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('avatars').remove([`${user.id}/${oldPath}`]);
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: uploadError.message,
      });
      setUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Update profile with new avatar URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl.publicUrl })
      .eq('id', user.id);

    if (updateError) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: updateError.message,
      });
    } else {
      setProfile({ ...profile, avatar_url: publicUrl.publicUrl });
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated",
      });
    }

    setUploading(false);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        address: profile.address,
        city: profile.city,
        country: profile.country,
        date_of_birth: profile.date_of_birth || null,
        bio: profile.bio,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl">My Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="w-24 h-24">
                  <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 rounded-full w-8 h-8"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Camera className="w-4 h-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              {uploading && <p className="text-sm text-muted-foreground">Uploading...</p>}
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Full Name
                  </label>
                  <Input
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </label>
                  <Input
                    value={profile.phone_number}
                    onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
                    placeholder="+1234567890"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    value={profile.date_of_birth}
                    onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Country
                  </label>
                  <Input
                    value={profile.country}
                    onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                    placeholder="United States"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    City
                  </label>
                  <Input
                    value={profile.city}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    placeholder="New York"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Address
                  </label>
                  <Input
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    placeholder="123 Main Street, Apt 4B"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Bio
                  </label>
                  <Textarea
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-yellow-600"
                disabled={loading}
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Wallet Address Card */}
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Blockchain Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            {walletAddress ? (
              <div className="space-y-3">
                <label className="text-sm font-medium text-muted-foreground">Your Wallet Address</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg text-xs break-all font-mono">
                    {walletAddress}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(walletAddress, 'walletAddress')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === 'walletAddress' && <span className="text-xs text-green-500">Copied!</span>}
              </div>
            ) : showCreateWallet ? (
              <div className="space-y-4">
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    You don't have a wallet yet. Create one to use blockchain features.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Enter your password to create wallet</label>
                  <Input
                    type="password"
                    value={walletPassword}
                    onChange={(e) => setWalletPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                <Button
                  onClick={handleCreateWallet}
                  disabled={creatingWallet || !walletPassword}
                  className="w-full"
                >
                  {creatingWallet ? 'Creating Wallet...' : 'Create Wallet'}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Loading wallet information...</p>
            )}
          </CardContent>
        </Card>

        {/* Transaction PIN Card */}
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Transaction PIN
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Your 4-digit PIN is used to verify transactions when others scan your QR code.
              </p>
              {hasPin ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 p-3 bg-green-500/10 rounded-lg text-green-600 text-sm">
                    ✓ PIN is set
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowSetPinDialog(true)}
                  >
                    Change PIN
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      No PIN set. Set a PIN to enable secure QR transactions.
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowSetPinDialog(true)}
                    className="w-full"
                  >
                    Set Transaction PIN
                  </Button>
                </div>
              )}
        {/* Biometric Authentication Card */}
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Fingerprint className="w-5 h-5" />
              Biometric Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use your fingerprint or face to sign in without a password.
            </p>

            {biometricDevices.length > 0 && (
              <div className="space-y-2">
                {biometricDevices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {device.auth_type === 'face' ? (
                        <ScanFace className="w-5 h-5 text-primary" />
                      ) : (
                        <Fingerprint className="w-5 h-5 text-primary" />
                      )}
                      <div>
                        <p className="text-sm font-medium capitalize">{device.auth_type === 'face' ? 'Face ID' : 'Fingerprint'}</p>
                        <p className="text-xs text-muted-foreground">{device.device_name} · Added {new Date(device.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveBiometric(device.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {biometricAvailable ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleEnrollBiometric('fingerprint')}
                  disabled={enrollingBiometric}
                >
                  <Fingerprint className="w-4 h-4 mr-2" />
                  Add Fingerprint
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleEnrollBiometric('face')}
                  disabled={enrollingBiometric}
                >
                  <ScanFace className="w-4 h-4 mr-2" />
                  Add Face ID
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Biometric authentication is not available on this device/browser.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Wallet Created Dialog */}
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

          {newWalletData && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Wallet Address</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded-lg text-xs break-all">
                    {newWalletData.address}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(newWalletData.address, 'newAddress')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === 'newAddress' && <span className="text-xs text-green-500">Copied!</span>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-destructive">Private Key (KEEP SECRET!)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-destructive/10 rounded-lg text-xs break-all border border-destructive/20">
                    {newWalletData.privateKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(newWalletData.privateKey, 'newPrivateKey')}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedField === 'newPrivateKey' && <span className="text-xs text-green-500">Copied!</span>}
              </div>

              {newWalletData.mnemonic && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-destructive">Recovery Phrase (KEEP SECRET!)</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-destructive/10 rounded-lg text-xs break-all border border-destructive/20">
                      {newWalletData.mnemonic}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(newWalletData.mnemonic!, 'newMnemonic')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {copiedField === 'newMnemonic' && <span className="text-xs text-green-500">Copied!</span>}
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => {
                  setShowWalletDialog(false);
                  setNewWalletData(null);
                }}
              >
                I've Saved My Keys - Continue
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SetPinDialog
        open={showSetPinDialog}
        onOpenChange={setShowSetPinDialog}
        onPinSet={() => setHasPin(true)}
      />
    </div>
  );
}
