import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ArrowRightLeft, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ConversionFee {
  id: string;
  from_coin: string;
  to_coin: string;
  fee_percentage: number;
  is_active: boolean;
}

interface Coin {
  coin_symbol: string;
  coin_name: string;
}

export default function ConversionFees() {
  const { role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<ConversionFee[]>([]);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<ConversionFee | null>(null);
  const [formData, setFormData] = useState({
    from_coin: '',
    to_coin: '',
    fee_percentage: '1.0',
    is_active: true,
  });

  useEffect(() => {
    if (authLoading) return;
    if (role !== 'admin') {
      navigate('/admin');
      return;
    }
    fetchData();
  }, [role, authLoading]);

  const fetchData = async () => {
    setLoading(true);
    const [feesRes, coinsRes] = await Promise.all([
      supabase.from('conversion_fees').select('*').order('created_at', { ascending: true }),
      supabase.from('supported_coins').select('coin_symbol, coin_name').eq('is_active', true),
    ]);

    if (feesRes.error) {
      toast({ title: 'Error', description: 'Failed to fetch conversion fees', variant: 'destructive' });
    } else {
      setFees(feesRes.data || []);
    }

    if (coinsRes.data) {
      setCoins(coinsRes.data);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!formData.from_coin || !formData.to_coin) {
      toast({ title: 'Error', description: 'Please select both coins', variant: 'destructive' });
      return;
    }

    if (formData.from_coin === formData.to_coin) {
      toast({ title: 'Error', description: 'From and To coins must be different', variant: 'destructive' });
      return;
    }

    const feePercentage = parseFloat(formData.fee_percentage);
    if (isNaN(feePercentage) || feePercentage < 0) {
      toast({ title: 'Error', description: 'Invalid fee percentage', variant: 'destructive' });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (editingFee) {
        const { error } = await supabase
          .from('conversion_fees')
          .update({
            from_coin: formData.from_coin,
            to_coin: formData.to_coin,
            fee_percentage: feePercentage,
            is_active: formData.is_active,
            updated_by: user?.id,
          })
          .eq('id', editingFee.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Conversion fee updated' });
      } else {
        const { error } = await supabase
          .from('conversion_fees')
          .insert({
            from_coin: formData.from_coin,
            to_coin: formData.to_coin,
            fee_percentage: feePercentage,
            is_active: formData.is_active,
            updated_by: user?.id,
          });

        if (error) throw error;
        toast({ title: 'Success', description: 'Conversion fee added' });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleFeeStatus = async (fee: ConversionFee) => {
    const { error } = await supabase
      .from('conversion_fees')
      .update({ is_active: !fee.is_active })
      .eq('id', fee.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } else {
      fetchData();
    }
  };

  const deleteFee = async (id: string) => {
    const { error } = await supabase
      .from('conversion_fees')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Conversion fee deleted' });
      fetchData();
    }
  };

  const openEditDialog = (fee: ConversionFee) => {
    setEditingFee(fee);
    setFormData({
      from_coin: fee.from_coin,
      to_coin: fee.to_coin,
      fee_percentage: fee.fee_percentage.toString(),
      is_active: fee.is_active,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingFee(null);
    setFormData({
      from_coin: '',
      to_coin: '',
      fee_percentage: '1.0',
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
                <ArrowRightLeft className="h-5 w-5" />
                Conversion Fees
              </CardTitle>
              <CardDescription>
                Set fees for converting between coins. Fees go to the liquidity pool.
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Fee
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingFee ? 'Edit Conversion Fee' : 'Add Conversion Fee'}</DialogTitle>
                  <DialogDescription>
                    Set the fee percentage for converting between coins
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>From Coin</Label>
                    <Select value={formData.from_coin} onValueChange={(v) => setFormData({ ...formData, from_coin: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select coin" />
                      </SelectTrigger>
                      <SelectContent>
                        {coins.map((coin) => (
                          <SelectItem key={coin.coin_symbol} value={coin.coin_symbol}>
                            {coin.coin_symbol} - {coin.coin_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To Coin</Label>
                    <Select value={formData.to_coin} onValueChange={(v) => setFormData({ ...formData, to_coin: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select coin" />
                      </SelectTrigger>
                      <SelectContent>
                        {coins.map((coin) => (
                          <SelectItem key={coin.coin_symbol} value={coin.coin_symbol}>
                            {coin.coin_symbol} - {coin.coin_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee">Fee Percentage (%)</Label>
                    <Input
                      id="fee"
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="e.g., 1.5"
                      value={formData.fee_percentage}
                      onChange={(e) => setFormData({ ...formData, fee_percentage: e.target.value })}
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
                    {editingFee ? 'Update' : 'Add'} Fee
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Fee %</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell className="font-medium">{fee.from_coin}</TableCell>
                    <TableCell className="font-medium">{fee.to_coin}</TableCell>
                    <TableCell>{fee.fee_percentage}%</TableCell>
                    <TableCell>
                      <Switch
                        checked={fee.is_active}
                        onCheckedChange={() => toggleFeeStatus(fee)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(fee)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteFee(fee.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {fees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No conversion fees configured
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
