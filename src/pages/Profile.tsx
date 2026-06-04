import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, User, Phone, MapPin, Calendar, Camera, FileText, Wallet, Copy, AlertTriangle, Lock, Fingerprint, ScanFace, Trash2, MessageCircle, ShieldCheck, LogOut, Palette, Sun, Moon, Check, Smartphone, Download, Plus, Eye, EyeOff } from 'lucide-react';
import { isVerified as isWhatsAppVerified } from '@/lib/whatsapp';
import { useTheme } from '@/components/ThemeProvider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { generateWallet, encryptPrivateKey } from '@/lib/wallet';
import { ethers } from 'ethers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SetPinDialog } from '@/components/SetPinDialog';
import { isBiometricAvailable, enrollBiometric, linkCredentialToPhone, checkBiometricSupport, isInIframe } from '@/lib/biometricAuth';
import { PWAInstallButton } from '@/components/PWAInstallButton';
import { AppDownloadButton } from '@/components/AppDownloadButton';

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { themeId, mode, setThemeId, toggleMode, enabledPresets, themeLocked } = useTheme();
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
  const [biometricSupport, setBiometricSupport] = useState<{ ok: boolean; reason?: string; hint?: string }>({ ok: false });
  const [pwaInstallEnabled, setPwaInstallEnabled] = useState(true);
  // Wallet import state
  const [importKey, setImportKey] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [showImportKey, setShowImportKey] = useState(false);
  const [biometricDevices, setBiometricDevices] = useState<any[]>([]);
  const [enrollingBiometric, setEnrollingBiometric] = useState(false);
  const [showBiometricPasswordDialog, setShowBiometricPasswordDialog] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState('');
  const [pendingBiometricType, setPendingBiometricType] = useState<'fingerprint' | 'face'>('fingerprint');
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
      checkBiometricSupport().then(setBiometricSupport);
      // Check if admin has enabled the PWA install option
      supabase
        .from('feature_toggles')
        .select('is_enabled')
        .eq('feature_key', 'pwa_install')
        .maybeSingle()
        .then(({ data }) => {
          // Default ON when row is missing
          setPwaInstallEnabled(data ? !!data.is_enabled : true);
        });
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

  const startBiometricEnroll = (type: 'fingerprint' | 'face') => {
    setPendingBiometricType(type);
    setBiometricPassword('');
    setShowBiometricPasswordDialog(true);
  };

  const handleEnrollBiometric = async () => {
    if (!user || !biometricPassword) {
      toast({ variant: 'destructive', title: 'Password Required', description: 'Enter your password to link biometric login.' });
      return;
    }
    setShowBiometricPasswordDialog(false);
    setEnrollingBiometric(true);
    const result = await enrollBiometric(user.id, profile.phone_number || user.email || '', pendingBiometricType);
    if (result.success) {
      const { data: creds } = await supabase
        .from('biometric_credentials')
        .select('credential_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (creds && creds.length > 0) {
        linkCredentialToPhone(creds[0].credential_id, profile.phone_number, biometricPassword);
      }
      toast({ title: 'Biometric Enrolled!', description: `${pendingBiometricType === 'face' ? 'Face ID' : 'Fingerprint'} is now set up for quick login.` });
      fetchBiometricDevices();
    } else if (result.error !== 'cancelled') {
      toast({ variant: 'destructive', title: 'Enrollment Failed', description: result.error });
    }
    setEnrollingBiometric(false);
    setBiometricPassword('');
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

  const walletStorageKey = user ? `vb.wallet.${user.id}` : null;

  const fetchWallet = () => {
    if (!walletStorageKey) return;
    const raw = localStorage.getItem(walletStorageKey);
    if (raw) {
      try {
        const { address } = JSON.parse(raw);
        setWalletAddress(address);
      } catch {
        setShowCreateWallet(false);
      }
    } else {
      setShowCreateWallet(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const handleImportWallet = async (method: 'privateKey' | 'mnemonic') => {
    if (!user) return;
    if (!importPassword || importPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'At least 6 characters required.' });
      return;
    }
    setImporting(true);
    try {
      let wallet: ethers.Wallet | ethers.HDNodeWallet;
      if (method === 'privateKey') {
        const key = importKey.trim();
        if (!key) throw new Error('Enter a private key');
        wallet = new ethers.Wallet(key.startsWith('0x') ? key : `0x${key}`);
      } else {
        const phrase = importMnemonic.trim();
        if (!phrase) throw new Error('Enter a seed phrase');
        wallet = ethers.Wallet.fromPhrase(phrase);
      }
      const encryptedKey = await encryptPrivateKey(wallet.privateKey, importPassword);

      // Store ONLY in localStorage — private key never leaves this device
      if (!walletStorageKey) throw new Error('Not logged in');
      localStorage.setItem(walletStorageKey, JSON.stringify({
        address: wallet.address,
        encryptedJson: encryptedKey,
      }));
      setWalletAddress(wallet.address);
      setShowCreateWallet(false);
      setImportKey(''); setImportMnemonic(''); setImportPassword('');
      toast({ title: 'Wallet imported!', description: `Address: ${wallet.address.slice(0,10)}…` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Import failed', description: e.message ?? String(e) });
    } finally {
      setImporting(false);
    }
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

      // Store ONLY in localStorage — private key never leaves this device
      if (!walletStorageKey) throw new Error('Not logged in');
      localStorage.setItem(walletStorageKey, JSON.stringify({
        address: wallet.address,
        encryptedJson: encryptedKey,
      }));

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

        {/* Blockchain Wallet Card */}
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Blockchain Wallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            {walletAddress ? (
              /* ── Wallet exists ── */
              <div className="space-y-3">
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-green-700 dark:text-green-400 font-medium">Wallet connected</span>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Address</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-3 bg-muted rounded-lg text-xs break-all font-mono">
                      {walletAddress}
                    </code>
                    <Button size="icon" variant="outline" onClick={() => copyToClipboard(walletAddress, 'walletAddress')} data-testid="button-copy-wallet">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {copiedField === 'walletAddress' && <span className="text-xs text-green-500 mt-1 block">Copied!</span>}
                </div>
              </div>
            ) : showCreateWallet ? (
              /* ── No wallet yet — create or import ── */
              <div className="space-y-4">
                <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    No wallet yet. Create a new one or import an existing wallet.
                  </p>
                </div>

                <Tabs defaultValue="create">
                  <TabsList className="w-full">
                    <TabsTrigger value="create" className="flex-1 gap-1.5" data-testid="tab-create-wallet">
                      <Plus className="w-3.5 h-3.5" /> Create New
                    </TabsTrigger>
                    <TabsTrigger value="import" className="flex-1 gap-1.5" data-testid="tab-import-wallet">
                      <Download className="w-3.5 h-3.5" /> Import
                    </TabsTrigger>
                  </TabsList>

                  {/* Create tab */}
                  <TabsContent value="create" className="space-y-3 pt-3">
                    <p className="text-xs text-muted-foreground">
                      A brand-new wallet will be generated for you. Save your seed phrase — it's the only way to recover your wallet.
                    </p>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Encryption password</label>
                      <Input
                        type="password"
                        value={walletPassword}
                        onChange={(e) => setWalletPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        data-testid="input-create-wallet-password"
                      />
                      <p className="text-[11px] text-muted-foreground">Used to encrypt your private key on this device.</p>
                    </div>
                    <Button onClick={handleCreateWallet} disabled={creatingWallet || !walletPassword} className="w-full" data-testid="button-create-wallet">
                      {creatingWallet ? 'Creating…' : 'Generate wallet'}
                    </Button>
                  </TabsContent>

                  {/* Import tab */}
                  <TabsContent value="import" className="pt-3">
                    <Tabs defaultValue="privateKey">
                      <TabsList className="w-full mb-3">
                        <TabsTrigger value="privateKey" className="flex-1 text-xs" data-testid="tab-import-pk">Private Key</TabsTrigger>
                        <TabsTrigger value="mnemonic" className="flex-1 text-xs" data-testid="tab-import-mnemonic">Seed Phrase</TabsTrigger>
                      </TabsList>

                      {/* Private key import */}
                      <TabsContent value="privateKey" className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium">Private key</label>
                          <div className="flex gap-2">
                            <Input
                              type={showImportKey ? 'text' : 'password'}
                              value={importKey}
                              onChange={(e) => setImportKey(e.target.value)}
                              placeholder="0x… or without 0x prefix"
                              className="flex-1 font-mono text-xs"
                              data-testid="input-private-key"
                            />
                            <Button variant="ghost" size="icon" onClick={() => setShowImportKey((v) => !v)} type="button">
                              {showImportKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">Encryption password</label>
                          <Input type="password" value={importPassword} onChange={(e) => setImportPassword(e.target.value)} placeholder="Min 6 characters" data-testid="input-import-password-pk" />
                        </div>
                        <Button onClick={() => handleImportWallet('privateKey')} disabled={importing || !importKey || !importPassword} className="w-full" data-testid="button-import-pk">
                          {importing ? 'Importing…' : 'Import wallet'}
                        </Button>
                      </TabsContent>

                      {/* Mnemonic import */}
                      <TabsContent value="mnemonic" className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-sm font-medium">Seed phrase (12 or 24 words)</label>
                          <Textarea
                            value={importMnemonic}
                            onChange={(e) => setImportMnemonic(e.target.value)}
                            placeholder="word1 word2 word3 … word12"
                            rows={3}
                            className="font-mono text-xs resize-none"
                            data-testid="input-mnemonic"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-sm font-medium">Encryption password</label>
                          <Input type="password" value={importPassword} onChange={(e) => setImportPassword(e.target.value)} placeholder="Min 6 characters" data-testid="input-import-password-mn" />
                        </div>
                        <Button onClick={() => handleImportWallet('mnemonic')} disabled={importing || !importMnemonic || !importPassword} className="w-full" data-testid="button-import-mnemonic">
                          {importing ? 'Importing…' : 'Import wallet'}
                        </Button>
                      </TabsContent>
                    </Tabs>

                    <p className="text-[11px] text-muted-foreground mt-2 p-2 bg-muted rounded-lg">
                      Your private key / seed phrase never leaves your device. It is encrypted with your password before being stored.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              /* ── No wallet — explicit action required ── */
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 border border-border rounded-xl">
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <Wallet className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      You don't have a blockchain wallet yet. Your private key stays on this device only — it is never sent to our servers.
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="default"
                    onClick={() => setShowCreateWallet(true)}
                    className="gap-1.5"
                    data-testid="button-show-create-wallet"
                  >
                    <Plus className="w-4 h-4" /> Create New
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateWallet(true)}
                    className="gap-1.5"
                    data-testid="button-show-import-wallet"
                  >
                    <Download className="w-4 h-4" /> Import
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PWA Install Card (admin-toggleable via 'pwa_install' feature) */}
        {pwaInstallEnabled && (
          <Card className="shadow-xl border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Quick Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AppDownloadButton />
              <PWAInstallButton />
            </CardContent>
          </Card>
        )}

        {/* Appearance Card */}
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Display mode</p>
                <p className="text-xs text-muted-foreground">Switch between light and dark.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleMode}
                className="gap-2"
                data-testid="button-toggle-mode"
              >
                {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {mode === 'dark' ? 'Light' : 'Dark'}
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-sm">Color theme</p>
                {themeLocked && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Lock className="w-3 h-3" /> Set by admin
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {enabledPresets.map((p) => {
                  const active = themeId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => !themeLocked && setThemeId(p.id)}
                      disabled={themeLocked}
                      className={`text-left rounded-xl border-2 overflow-hidden transition-all ${
                        active
                          ? 'border-primary shadow-md'
                          : themeLocked
                          ? 'border-border opacity-70 cursor-not-allowed'
                          : 'border-border hover:border-primary/50 hover:shadow-sm'
                      }`}
                      data-testid={`theme-option-${p.id}`}
                    >
                      {/* Colour swatch header */}
                      <div
                        className="h-16 w-full flex items-center justify-center gap-2 relative"
                        style={{ background: p.swatch.bg }}
                      >
                        <span className="w-8 h-8 rounded-full border-2 border-white/40 shadow" style={{ background: p.swatch.primary }} />
                        <span className="w-5 h-5 rounded-full border-2 border-white/30" style={{ background: p.swatch.accent }} />
                        {active && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <div className="font-semibold text-sm">{p.name}</div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Security Card */}
        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Account Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => navigate('/verify-whatsapp')}
              data-testid="button-verify-whatsapp"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-600" />
                Verify with WhatsApp
              </span>
              <Badge
                variant={user && isWhatsAppVerified(user.id) ? 'default' : 'secondary'}
                className={user && isWhatsAppVerified(user.id) ? 'bg-green-600' : ''}
              >
                {user && isWhatsAppVerified(user.id) ? 'Verified' : 'Not yet'}
              </Badge>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={async () => {
                try {
                  await supabase.auth.signOut({ scope: 'global' });
                  toast({ title: 'Signed out everywhere', description: 'All sessions on every device were ended.' });
                  navigate('/auth');
                } catch (e: any) {
                  toast({ variant: 'destructive', title: 'Sign-out failed', description: e?.message || 'Please try again.' });
                }
              }}
              data-testid="button-signout-everywhere"
            >
              <LogOut className="w-4 h-4 text-destructive" />
              Sign out on all devices
            </Button>
            <p className="text-xs text-muted-foreground">
              Use this if your account was used on a device you no longer trust.
            </p>
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
            </div>
          </CardContent>
        </Card>

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

            {biometricSupport.ok ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => startBiometricEnroll('fingerprint')}
                  disabled={enrollingBiometric}
                  data-testid="button-add-fingerprint"
                >
                  <Fingerprint className="w-4 h-4 mr-2" />
                  Add Fingerprint
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => startBiometricEnroll('face')}
                  disabled={enrollingBiometric}
                  data-testid="button-add-faceid"
                >
                  <ScanFace className="w-4 h-4 mr-2" />
                  Add Face ID
                </Button>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 space-y-2">
                <p className="text-sm font-medium text-foreground flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <span>{biometricSupport.reason || "Biometric authentication is not available on this device/browser."}</span>
                </p>
                {biometricSupport.hint && (
                  <p className="text-xs text-muted-foreground pl-6">{biometricSupport.hint}</p>
                )}
                {isInIframe() && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => window.open(window.location.href, '_blank', 'noopener')}
                    data-testid="button-open-newtab"
                  >
                    Open app in new tab to enable biometrics →
                  </Button>
                )}
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

      {/* Biometric Password Dialog */}
      <Dialog open={showBiometricPasswordDialog} onOpenChange={setShowBiometricPasswordDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingBiometricType === 'face' ? <ScanFace className="w-5 h-5 text-primary" /> : <Fingerprint className="w-5 h-5 text-primary" />}
              Confirm Your Password
            </DialogTitle>
            <DialogDescription>
              Enter your account password to link {pendingBiometricType === 'face' ? 'Face ID' : 'Fingerprint'} for quick login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              value={biometricPassword}
              onChange={(e) => setBiometricPassword(e.target.value)}
              placeholder="Enter your password"
              onKeyDown={(e) => { if (e.key === 'Enter') handleEnrollBiometric(); }}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowBiometricPasswordDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleEnrollBiometric} disabled={!biometricPassword || enrollingBiometric} className="flex-1">
                {enrollingBiometric ? 'Setting up...' : 'Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
