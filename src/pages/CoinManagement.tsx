import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Coins, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Coin {
  id: string;
  coin_symbol: string;
  coin_name: string;
  contract_address: string | null;
  is_native: boolean;
  is_active: boolean;
}

export default function CoinManagement() {
  const { role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoin, setEditingCoin] = useState<Coin | null>(null);
  const [formData, setFormData] = useState({
    coin_symbol: '',
    coin_name: '',
    contract_address: '',
    is_native: false,
    is_active: true,
  });

  useEffect(() => {
    if (authLoading) return;
    if (role !== 'admin') {
      navigate('/admin');
      return;
    }
    fetchCoins();
  }, [role, authLoading]);

  const fetchCoins = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('supported_coins')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch coins', variant: 'destructive' });
    } else {
      setCoins(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!formData.coin_symbol || !formData.coin_name) {
      toast({ title: 'Error', description: 'Symbol and name are required', variant: 'destructive' });
      return;
    }

    try {
      if (editingCoin) {
        const { error } = await supabase
          .from('supported_coins')
          .update({
            coin_symbol: formData.coin_symbol.toUpperCase(),
            coin_name: formData.coin_name,
            contract_address: formData.contract_address || null,
            is_native: formData.is_native,
            is_active: formData.is_active,
          })
          .eq('id', editingCoin.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Coin updated successfully' });
      } else {
        const { error } = await supabase
          .from('supported_coins')
          .insert({
            coin_symbol: formData.coin_symbol.toUpperCase(),
            coin_name: formData.coin_name,
            contract_address: formData.contract_address || null,
            is_native: formData.is_native,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast({ title: 'Success', description: 'Coin added successfully' });
      }

      setDialogOpen(false);
      resetForm();
      fetchCoins();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleCoinStatus = async (coin: Coin) => {
    const { error } = await supabase
      .from('supported_coins')
      .update({ is_active: !coin.is_active })
      .eq('id', coin.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update coin status', variant: 'destructive' });
    } else {
      fetchCoins();
    }
  };

  const deleteCoin = async (id: string) => {
    const { error } = await supabase
      .from('supported_coins')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete coin', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Coin deleted' });
      fetchCoins();
    }
  };

  const openEditDialog = (coin: Coin) => {
    setEditingCoin(coin);
    setFormData({
      coin_symbol: coin.coin_symbol,
      coin_name: coin.coin_name,
      contract_address: coin.contract_address || '',
      is_native: coin.is_native,
      is_active: coin.is_active,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingCoin(null);
    setFormData({
      coin_symbol: '',
      coin_name: '',
      contract_address: '',
      is_native: false,
      is_active: true,
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/admin')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5" />
                Coin Management
              </CardTitle>
              <CardDescription>
                Manage supported coins for transactions. Only active coins can be sent.
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Coin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCoin ? 'Edit Coin' : 'Add New Coin'}</DialogTitle>
                  <DialogDescription>
                    {editingCoin ? 'Update coin details' : 'Add a new supported coin for transactions'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="symbol">Coin Symbol</Label>
                    <Input
                      id="symbol"
                      placeholder="e.g., ETH, BTC"
                      value={formData.coin_symbol}
                      onChange={(e) => setFormData({ ...formData, coin_symbol: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Coin Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Ethereum, Bitcoin"
                      value={formData.coin_name}
                      onChange={(e) => setFormData({ ...formData, coin_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contract">Contract Address (optional for tokens)</Label>
                    <Input
                      id="contract"
                      placeholder="0x..."
                      value={formData.contract_address}
                      onChange={(e) => setFormData({ ...formData, contract_address: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="native">Is Native Coin</Label>
                    <Switch
                      id="native"
                      checked={formData.is_native}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_native: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="active">Is Active</Label>
                    <Switch
                      id="active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit}>
                    {editingCoin ? 'Update' : 'Add'} Coin
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Native</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coins.map((coin) => (
                  <TableRow key={coin.id}>
                    <TableCell className="font-medium">{coin.coin_symbol}</TableCell>
                    <TableCell>{coin.coin_name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {coin.contract_address ? `${coin.contract_address.slice(0, 10)}...` : '-'}
                    </TableCell>
                    <TableCell>{coin.is_native ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Switch
                        checked={coin.is_active}
                        onCheckedChange={() => toggleCoinStatus(coin)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(coin)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteCoin(coin.id)}
                          disabled={coin.is_native}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {coins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No coins configured
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
