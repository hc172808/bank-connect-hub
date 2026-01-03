import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRightLeft, Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SupportedCoin {
  id: string;
  coin_name: string;
  coin_symbol: string;
  is_native: boolean;
}

interface ConversionFee {
  id: string;
  from_coin: string;
  to_coin: string;
  fee_percentage: number;
}

const CoinConvert = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [coins, setCoins] = useState<SupportedCoin[]>([]);
  const [fees, setFees] = useState<ConversionFee[]>([]);
  const [fromCoin, setFromCoin] = useState(searchParams.get("from") || "");
  const [toCoin, setToCoin] = useState(searchParams.get("to") || "");
  const [amount, setAmount] = useState(searchParams.get("amount") || "");
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [coinsRes, feesRes] = await Promise.all([
      supabase.from("supported_coins").select("*").eq("is_active", true),
      supabase.from("conversion_fees").select("*").eq("is_active", true),
    ]);

    if (coinsRes.data) setCoins(coinsRes.data);
    if (feesRes.data) setFees(feesRes.data);
    setLoading(false);
  };

  const getConversionFee = () => {
    const fee = fees.find(
      (f) => f.from_coin === fromCoin && f.to_coin === toCoin
    );
    return fee?.fee_percentage || 0;
  };

  const calculateOutput = () => {
    const inputAmount = parseFloat(amount) || 0;
    const feePercentage = getConversionFee();
    const feeAmount = inputAmount * (feePercentage / 100);
    return {
      feeAmount,
      outputAmount: inputAmount - feeAmount,
    };
  };

  const handleConvert = async () => {
    if (!fromCoin || !toCoin || !amount) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (fromCoin === toCoin) {
      toast({
        title: "Error",
        description: "Cannot convert to the same coin",
        variant: "destructive",
      });
      return;
    }

    setConverting(true);

    // In a real implementation, this would interact with blockchain/smart contracts
    // For now, we'll just show a success message
    
    const { feeAmount, outputAmount } = calculateOutput();

    setTimeout(() => {
      toast({
        title: "Conversion Successful",
        description: `Converted ${amount} ${fromCoin} to ${outputAmount.toFixed(6)} ${toCoin} (Fee: ${feeAmount.toFixed(6)} ${fromCoin})`,
      });
      setConverting(false);
      
      // If came from SendMoney, go back with converted coin
      const returnTo = searchParams.get("returnTo");
      if (returnTo) {
        navigate(returnTo);
      } else {
        navigate("/client-dashboard");
      }
    }, 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const { feeAmount, outputAmount } = calculateOutput();
  const feePercentage = getConversionFee();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Convert Coins</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft size={24} />
              Coin Conversion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>From</Label>
              <Select value={fromCoin} onValueChange={setFromCoin}>
                <SelectTrigger>
                  <SelectValue placeholder="Select coin" />
                </SelectTrigger>
                <SelectContent>
                  {coins.map((coin) => (
                    <SelectItem key={coin.id} value={coin.coin_symbol}>
                      {coin.coin_name} ({coin.coin_symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <ArrowRightLeft size={20} />
              </div>
            </div>

            <div>
              <Label>To</Label>
              <Select value={toCoin} onValueChange={setToCoin}>
                <SelectTrigger>
                  <SelectValue placeholder="Select coin" />
                </SelectTrigger>
                <SelectContent>
                  {coins
                    .filter((c) => c.coin_symbol !== fromCoin)
                    .map((coin) => (
                      <SelectItem key={coin.id} value={coin.coin_symbol}>
                        {coin.coin_name} ({coin.coin_symbol})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {fromCoin && toCoin && amount && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Conversion Fee ({feePercentage}%)</span>
                  <span>{feeAmount.toFixed(6)} {fromCoin}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>You will receive</span>
                  <span>{outputAmount.toFixed(6)} {toCoin}</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                  <Info size={12} />
                  Fee goes to the liquidity pool
                </p>
              </div>
            )}

            <Button
              onClick={handleConvert}
              className="w-full"
              disabled={converting || !fromCoin || !toCoin || !amount}
            >
              {converting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Converting...
                </>
              ) : (
                "Convert"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CoinConvert;
