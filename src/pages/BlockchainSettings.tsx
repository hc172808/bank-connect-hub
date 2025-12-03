import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save, Link2, Coins, Globe, Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface BlockchainSettings {
  id: string;
  rpc_url: string;
  chain_id: string;
  native_coin_symbol: string;
  native_coin_name: string;
  explorer_url: string;
  is_active: boolean;
}

export default function BlockchainSettings() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BlockchainSettings>({
    id: '',
    rpc_url: '',
    chain_id: '',
    native_coin_symbol: 'GYD',
    native_coin_name: 'GYD Coin',
    explorer_url: '',
    is_active: false,
  });

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/admin');
      return;
    }
    fetchSettings();
  }, [role]);

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
