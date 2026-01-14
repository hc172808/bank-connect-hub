import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Link2, Coins, Globe, Hash, Wallet, Key, Percent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BlockchainSettings {
  id: string;
  rpc_url: string;
  chain_id: string;
  native_coin_symbol: string;
  native_coin_name: string;
  explorer_url: string;
  is_active: boolean;
  liquidity_pool_address: string;
  fee_wallet_address: string;
  fee_wallet_encrypted_key: string;
  gas_fee_gyd: number;
}

export default function BlockchainSettings() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BlockchainSettings>({
    id: '',
    rpc_url: '',
    chain_id: '',
    native_coin_symbol: 'GYD',
    native_coin_name: 'GYD Coin',
    explorer_url: '',
    is_active: false,
    liquidity_pool_address: '',
    fee_wallet_address: '',
    fee_wallet_encrypted_key: '',
    gas_fee_gyd: 0.01,
  });

  useEffect(() => {
    // Wait for auth to finish loading before checking role
    if (authLoading) return;
    
    if (role !== 'admin') {
      navigate('/admin');
      return;
    }
    fetchSettings();
  }, [role, authLoading]);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blockchain_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load blockchain settings",
      });
    }

    if (data) {
      setSettings({
        id: data.id,
        rpc_url: data.rpc_url || '',
        chain_id: data.chain_id || '',
        native_coin_symbol: data.native_coin_symbol || 'GYD',
        native_coin_name: data.native_coin_name || 'GYD Coin',
        explorer_url: data.explorer_url || '',
        is_active: data.is_active || false,
        liquidity_pool_address: data.liquidity_pool_address || '',
        fee_wallet_address: data.fee_wallet_address || '',
        fee_wallet_encrypted_key: data.fee_wallet_encrypted_key || '',
        gas_fee_gyd: data.gas_fee_gyd || 0.01,
      });
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);

    const updateData = {
      rpc_url: settings.rpc_url || null,
      chain_id: settings.chain_id || null,
      native_coin_symbol: settings.native_coin_symbol,
      native_coin_name: settings.native_coin_name,
      explorer_url: settings.explorer_url || null,
      is_active: settings.is_active,
      liquidity_pool_address: settings.liquidity_pool_address || null,
      fee_wallet_address: settings.fee_wallet_address || null,
      fee_wallet_encrypted_key: settings.fee_wallet_encrypted_key || null,
      gas_fee_gyd: settings.gas_fee_gyd,
      updated_by: user.id,
    };

    const { error } = await supabase
      .from('blockchain_settings')
      .update(updateData)
      .eq('id', settings.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message,
      });
    } else {
      toast({
        title: "Settings saved",
        description: "Blockchain settings have been updated successfully",
      });
    }

    setSaving(false);
  };

  const testConnection = async () => {
    if (!settings.rpc_url) {
      toast({
        variant: "destructive",
        title: "RPC URL required",
        description: "Please enter an RPC URL to test the connection",
      });
      return;
    }

    try {
      const response = await fetch(settings.rpc_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
      });

      const data = await response.json();

      if (data.result) {
        const chainId = parseInt(data.result, 16).toString();
        setSettings({ ...settings, chain_id: chainId });
        toast({
          title: "Connection successful",
          description: `Connected to chain ID: ${chainId}`,
        });
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: "Could not connect to the RPC endpoint",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background p-4 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card className="shadow-xl border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Coins className="w-6 h-6 text-primary" />
                  Blockchain Settings
                </CardTitle>
                <CardDescription>
                  Configure your blockchain RPC connection for GYD native coin
                </CardDescription>
              </div>
              <Badge variant={settings.is_active ? "default" : "secondary"}>
                {settings.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Enable Blockchain</p>
                  <p className="text-sm text-muted-foreground">
                    Activate blockchain features for your application
                  </p>
                </div>
                <Switch
                  checked={settings.is_active}
                  onCheckedChange={(checked) => setSettings({ ...settings, is_active: checked })}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    RPC URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.rpc_url}
                      onChange={(e) => setSettings({ ...settings, rpc_url: e.target.value })}
                      placeholder="https://your-blockchain-rpc-url.com"
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={testConnection}>
                      Test
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter your blockchain RPC endpoint URL
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    Chain ID
                  </label>
                  <Input
                    value={settings.chain_id}
                    onChange={(e) => setSettings({ ...settings, chain_id: e.target.value })}
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-detected when testing RPC connection
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      Coin Symbol
                    </label>
                    <Input
                      value={settings.native_coin_symbol}
                      onChange={(e) => setSettings({ ...settings, native_coin_symbol: e.target.value })}
                      placeholder="GYD"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Coins className="w-4 h-4" />
                      Coin Name
                    </label>
                    <Input
                      value={settings.native_coin_name}
                      onChange={(e) => setSettings({ ...settings, native_coin_name: e.target.value })}
                      placeholder="GYD Coin"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Block Explorer URL
                  </label>
                  <Input
                    value={settings.explorer_url}
                    onChange={(e) => setSettings({ ...settings, explorer_url: e.target.value })}
                    placeholder="https://explorer.your-blockchain.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional: Link to view transactions on block explorer
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Liquidity Pool Address
                  </label>
                  <Input
                    value={settings.liquidity_pool_address}
                    onChange={(e) => setSettings({ ...settings, liquidity_pool_address: e.target.value })}
                    placeholder="0x..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Wallet address for liquidity pool operations
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Fee Wallet Address (Bank)
                  </label>
                  <Input
                    value={settings.fee_wallet_address}
                    onChange={(e) => setSettings({ ...settings, fee_wallet_address: e.target.value })}
                    placeholder="0x..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Bank wallet address that sponsors gas fees and receives transaction fees
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Fee Wallet Private Key (Encrypted)
                  </label>
                  <Input
                    type="password"
                    value={settings.fee_wallet_encrypted_key}
                    onChange={(e) => setSettings({ ...settings, fee_wallet_encrypted_key: e.target.value })}
                    placeholder="Enter encrypted private key..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Private key for the bank fee wallet (used to sponsor gas for user transactions)
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Percent className="w-4 h-4" />
                    Gas Fee in GYD
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={settings.gas_fee_gyd}
                    onChange={(e) => setSettings({ ...settings, gas_fee_gyd: parseFloat(e.target.value) || 0 })}
                    placeholder="0.01"
                  />
                  <p className="text-xs text-muted-foreground">
                    Fee in GYD charged to users for gas sponsorship (bank pays actual gas, users see this fixed fee)
                  </p>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-yellow-600"
                disabled={saving}
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
