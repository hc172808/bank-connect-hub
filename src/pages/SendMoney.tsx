import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { QRScanner } from "@/components/QRScanner";
import { ArrowLeft, QrCode, User, Wallet, Info, Fuel } from "lucide-react";
import { isValidAddress, sendTransaction, decryptPrivateKey, estimateGas } from "@/lib/wallet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BlockchainSettings {
  rpc_url: string | null;
  chain_id: string | null;
  native_coin_symbol: string;
  is_active: boolean;
  liquidity_pool_address: string | null;
}

const SendMoney = () => {
  const [amount, setAmount] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverWalletAddress, setReceiverWalletAddress] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendMode, setSendMode] = useState<"internal" | "blockchain">("internal");
  const [blockchainSettings, setBlockchainSettings] = useState<BlockchainSettings | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingBlockchainTx, setPendingBlockchainTx] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [userWalletAddress, setUserWalletAddress] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchBlockchainSettings();
    fetchUserWallet();
  }, []);

  // Estimate gas when amount or wallet address changes
  useEffect(() => {
    if (sendMode === "blockchain" && amount && (walletAddress || receiverWalletAddress)) {
      estimateGasFee();
    } else {
      setGasEstimate(null);
    }
  }, [amount, walletAddress, receiverWalletAddress, sendMode]);

  const fetchBlockchainSettings = async () => {
    const { data } = await supabase
      .from("blockchain_settings")
      .select("rpc_url, chain_id, native_coin_symbol, is_active, liquidity_pool_address")
      .maybeSingle();

    if (data) {
      setBlockchainSettings(data);
    }
  };

  const fetchUserWallet = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", user.id)
      .single();

    if (data?.wallet_address) {
      setUserWalletAddress(data.wallet_address);
    }
  };

  const estimateGasFee = async () => {
    if (!blockchainSettings?.rpc_url || !userWalletAddress) return;
    
    const targetAddress = walletAddress || receiverWalletAddress;
    if (!targetAddress || !isValidAddress(targetAddress) || !amount) return;

    setEstimatingGas(true);
    try {
      const gas = await estimateGas(
        blockchainSettings.rpc_url,
        userWalletAddress,
        targetAddress,
        amount
      );
      setGasEstimate(gas);
    } catch (error) {
      console.error("Gas estimation error:", error);
      setGasEstimate(null);
    }
    setEstimatingGas(false);
  };

  const handleScanSuccess = async (userId: string) => {
    setReceiverId(userId);
    setShowScanner(false);
    
    const { data } = await supabase
      .from("profiles")
      .select("full_name, wallet_address")
      .eq("id", userId)
      .single();
    
    if (data) {
      setReceiverName(data.full_name || "Unknown User");
      setReceiverWalletAddress(data.wallet_address || "");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (sendMode === "blockchain") {
      // Validate wallet address
      const targetAddress = walletAddress || receiverWalletAddress;
      if (!targetAddress || !isValidAddress(targetAddress)) {
        toast({
          title: "Invalid Address",
          description: "Please enter a valid wallet address",
          variant: "destructive",
        });
        return;
      }
      setShowPasswordDialog(true);
      return;
    }

    // Internal transfer
    await processInternalTransfer();
  };

  const processInternalTransfer = async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("process_transaction", {
        _sender_id: user.id,
        _receiver_id: receiverId,
        _amount: parseFloat(amount),
        _transaction_type: "transfer",
        _description: "Money transfer"
      });

      if (error) throw error;

      const result = data as { 
        success: boolean; 
        error?: string; 
        fee?: number;
        sender_cashback?: number;
        liquidity_pool_fee?: number;
      };
      
      if (result.success) {
        toast({
          title: "Transfer Successful",
          description: `Sent $${amount} to ${receiverName}. Fee: $${result.fee?.toFixed(2)} (Cashback: $${result.sender_cashback?.toFixed(2)})`,
        });
        navigate("/client-dashboard");
      } else {
        toast({
          title: "Transfer Failed",
          description: result.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const processBlockchainTransfer = async () => {
    if (!blockchainSettings?.rpc_url) {
      toast({
        title: "Blockchain Not Configured",
        description: "Please contact admin to configure blockchain settings",
        variant: "destructive",
      });
      return;
    }

    setPendingBlockchainTx(true);
    setShowPasswordDialog(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get encrypted private key
      const { data: walletData, error: walletError } = await supabase
        .from("user_wallets")
        .select("encrypted_private_key")
        .eq("user_id", user.id)
        .single();

      if (walletError || !walletData) {
        throw new Error("Wallet not found. Please contact support.");
      }

      // Decrypt private key
      let privateKey: string;
      try {
        privateKey = await decryptPrivateKey(walletData.encrypted_private_key, password);
      } catch {
        throw new Error("Incorrect password");
      }

      const targetAddress = walletAddress || receiverWalletAddress;
      
      // Send blockchain transaction
      const result = await sendTransaction(
        blockchainSettings.rpc_url,
        privateKey,
        targetAddress,
        amount,
        blockchainSettings.chain_id || undefined
      );

      if (result.success) {
        // If liquidity pool is configured, send 40% of a calculated fee there
        if (blockchainSettings.liquidity_pool_address) {
          const feeAmount = parseFloat(amount) * 0.01; // 1% fee example
          const liquidityAmount = (feeAmount * 0.40).toString();
          
          if (parseFloat(liquidityAmount) > 0) {
            await sendTransaction(
              blockchainSettings.rpc_url,
              privateKey,
              blockchainSettings.liquidity_pool_address,
              liquidityAmount,
              blockchainSettings.chain_id || undefined
            );
          }
        }

        toast({
          title: "Blockchain Transfer Successful",
          description: `Sent ${amount} ${blockchainSettings.native_coin_symbol} to ${targetAddress.slice(0, 8)}...${targetAddress.slice(-6)}. TX: ${result.txHash?.slice(0, 10)}...`,
        });
        navigate("/client-dashboard");
      } else {
        toast({
          title: "Transfer Failed",
          description: result.error || "Blockchain transaction failed",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setPendingBlockchainTx(false);
      setPassword("");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client-dashboard")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Send Money</h1>

        {/* Transfer Mode Selection */}
        {blockchainSettings?.is_active && (
          <div className="flex gap-2 mb-4">
            <Button
              variant={sendMode === "internal" ? "default" : "outline"}
              onClick={() => setSendMode("internal")}
              className="flex-1"
            >
              <User size={16} className="mr-2" />
              Internal
            </Button>
            <Button
              variant={sendMode === "blockchain" ? "default" : "outline"}
              onClick={() => setSendMode("blockchain")}
              className="flex-1"
            >
              <Wallet size={16} className="mr-2" />
              Blockchain
            </Button>
          </div>
        )}

        {showScanner ? (
          <QRScanner
            onScanSuccess={handleScanSuccess}
            onClose={() => setShowScanner(false)}
          />
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSend} className="space-y-4">
              {sendMode === "internal" ? (
                <div>
                  <Label>Receiver</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="User ID or Name"
                      value={receiverName || receiverId}
                      onChange={(e) => setReceiverId(e.target.value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowScanner(true)}
                    >
                      <QrCode size={20} />
                    </Button>
                  </div>
                  {receiverName && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <User size={14} />
                      {receiverName}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label>Wallet Address</Label>
                  <Input
                    placeholder="0x..."
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Info size={12} />
                    Enter the recipient's {blockchainSettings?.native_coin_symbol} wallet address
                  </p>
                </div>
              )}

              <div>
                <Label>Amount {sendMode === "blockchain" ? `(${blockchainSettings?.native_coin_symbol})` : ""}</Label>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                {sendMode === "internal" ? (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Info size={12} />
                    60% of fees returned to you as cashback
                  </p>
                ) : (
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Fuel size={14} />
                        Estimated Network Fee
                      </span>
                      {estimatingGas ? (
                        <span className="text-muted-foreground">Calculating...</span>
                      ) : gasEstimate ? (
                        <span className="font-medium">{parseFloat(gasEstimate).toFixed(6)} {blockchainSettings?.native_coin_symbol}</span>
                      ) : (
                        <span className="text-muted-foreground">Enter amount to estimate</span>
                      )}
                    </div>
                    {gasEstimate && (
                      <p className="text-xs text-muted-foreground">
                        Total: {(parseFloat(amount || "0") + parseFloat(gasEstimate)).toFixed(6)} {blockchainSettings?.native_coin_symbol}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || pendingBlockchainTx}
              >
                {loading || pendingBlockchainTx ? "Processing..." : `Send ${sendMode === "blockchain" ? blockchainSettings?.native_coin_symbol : "Money"}`}
              </Button>
            </form>
          </Card>
        )}
      </div>

      {/* Password Dialog for Blockchain Transactions */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Blockchain Transaction</DialogTitle>
            <DialogDescription>
              Enter your password to sign and send the blockchain transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your account password"
              />
            </div>
            <div className="bg-muted/50 p-3 rounded-lg text-sm">
              <p><strong>To:</strong> {(walletAddress || receiverWalletAddress).slice(0, 12)}...{(walletAddress || receiverWalletAddress).slice(-8)}</p>
              <p><strong>Amount:</strong> {amount} {blockchainSettings?.native_coin_symbol}</p>
            </div>
            <Button
              onClick={processBlockchainTransfer}
              className="w-full"
              disabled={!password}
            >
              Confirm & Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SendMoney;
