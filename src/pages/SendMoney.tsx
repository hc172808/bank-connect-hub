import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { QRScanner } from "@/components/QRScanner";
import { ArrowLeft, QrCode, User, Wallet, Info, Fuel, ArrowRightLeft, AlertTriangle, Search, RotateCcw, X } from "lucide-react";
import { isValidAddress, sendSponsoredTransaction, decryptPrivateKey, estimateGas } from "@/lib/wallet";
import { useDashboardHome } from "@/hooks/useDashboardHome";
import { checkFirewall } from "@/lib/aiFirewall";
import { sendTransactionSms } from "@/lib/smsAlerts";
import { sendTransactionEmail } from "@/lib/emailAlerts";
import { TransferAnimation, TransferState } from "@/components/TransferAnimation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BlockchainSettings {
  rpc_url: string | null;
  chain_id: string | null;
  native_coin_symbol: string;
  is_active: boolean;
  liquidity_pool_address: string | null;
  fee_wallet_address: string | null;
  fee_wallet_encrypted_key: string | null;
  gas_fee_gyd: number;
}

interface SupportedCoin {
  id: string;
  coin_name: string;
  coin_symbol: string;
  is_native: boolean;
}

interface ConversionFee {
  from_coin: string;
  to_coin: string;
  fee_percentage: number;
}

const ANIM_SUCCESS_DURATION = 2200;
const ANIM_BLOCKED_DURATION = 3200;

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
  const [senderName, setSenderName] = useState("You");

  const [selectedCoin, setSelectedCoin] = useState("");
  const [supportedCoins, setSupportedCoins] = useState<SupportedCoin[]>([]);
  const [conversionFees, setConversionFees] = useState<ConversionFee[]>([]);
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [nativeCoinSymbol, setNativeCoinSymbol] = useState("");

  // Transfer animation
  const [animState, setAnimState] = useState<TransferState>("idle");
  const [animReason, setAnimReason] = useState<string | undefined>();

  // User lookup + recent recipients
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; full_name: string | null; phone_number: string | null; wallet_address: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [recentRecipients, setRecentRecipients] = useState<Array<{ id: string; full_name: string | null; phone_number: string | null; last_amount: number }>>([]);

  const navigate = useNavigate();
  const { toast } = useToast();
  const homeRoute = useDashboardHome();

  useEffect(() => {
    fetchBlockchainSettings();
    fetchUserWallet();
    fetchSupportedCoins();
    fetchRecentRecipients();
  }, []);

  // Debounced lookup of users by name/phone
  useEffect(() => {
    if (sendMode !== "internal") return;
    if (receiverId) return; // already locked to a recipient
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, wallet_address")
        .or(`full_name.ilike.%${q}%,phone_number.ilike.%${q}%`)
        .limit(8);
      setSearchResults(data || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, sendMode, receiverId]);

  const fetchRecentRecipients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: txs } = await supabase
      .from("transactions")
      .select("receiver_id, amount, created_at")
      .eq("sender_id", user.id)
      .eq("transaction_type", "transfer")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!txs?.length) return;
    const seen = new Set<string>();
    const unique: Array<{ id: string; amount: number }> = [];
    for (const t of txs) {
      if (t.receiver_id && t.receiver_id !== user.id && !seen.has(t.receiver_id)) {
        seen.add(t.receiver_id);
        unique.push({ id: t.receiver_id, amount: Number(t.amount) });
      }
      if (unique.length >= 5) break;
    }
    if (!unique.length) return;
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number")
      .in("id", unique.map((u) => u.id));
    setRecentRecipients(
      unique
        .map((u) => {
          const p = profs?.find((pr) => pr.id === u.id);
          return p ? { id: p.id, full_name: p.full_name, phone_number: p.phone_number, last_amount: u.amount } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    );
  };

  const selectRecipient = (r: { id: string; full_name: string | null; phone_number: string | null; wallet_address?: string | null }) => {
    setReceiverId(r.id);
    setReceiverName(r.full_name || r.phone_number || "User");
    setReceiverWalletAddress(r.wallet_address || "");
    setSearchQuery("");
    setSearchResults([]);
  };

  const clearRecipient = () => {
    setReceiverId("");
    setReceiverName("");
    setReceiverWalletAddress("");
    setSearchQuery("");
    setSearchResults([]);
  };

  const resendTo = (r: { id: string; full_name: string | null; phone_number: string | null; last_amount: number }) => {
    selectRecipient(r);
    setAmount(String(r.last_amount));
  };

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
      .select("rpc_url, chain_id, native_coin_symbol, is_active, liquidity_pool_address, fee_wallet_address, fee_wallet_encrypted_key, gas_fee_gyd")
      .maybeSingle();
    if (data) {
      setBlockchainSettings({
        ...data,
        fee_wallet_encrypted_key: data.fee_wallet_encrypted_key || null,
        gas_fee_gyd: data.gas_fee_gyd || 0.01,
      });
    }
  };

  const fetchUserWallet = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("wallet_address, full_name")
      .eq("id", user.id)
      .single();
    if (data?.wallet_address) setUserWalletAddress(data.wallet_address);
    if (data?.full_name) setSenderName(data.full_name);
  };

  const fetchSupportedCoins = async () => {
    const [coinsRes, feesRes] = await Promise.all([
      supabase.from("supported_coins").select("*").eq("is_active", true),
      supabase.from("conversion_fees").select("from_coin, to_coin, fee_percentage").eq("is_active", true),
    ]);
    if (coinsRes.data) {
      setSupportedCoins(coinsRes.data);
      const nativeCoin = coinsRes.data.find(c => c.is_native);
      if (nativeCoin) { setSelectedCoin(nativeCoin.coin_symbol); setNativeCoinSymbol(nativeCoin.coin_symbol); }
    }
    if (feesRes.data) setConversionFees(feesRes.data);
  };

  const isNativeCoin = (coinSymbol: string) =>
    supportedCoins.find(c => c.coin_symbol === coinSymbol)?.is_native ?? false;

  const getConversionFee = (fromCoin: string, toCoin: string) =>
    conversionFees.find(f => f.from_coin === fromCoin && f.to_coin === toCoin)?.fee_percentage ?? 0;

  const calculateConvertedAmount = () => {
    if (!selectedCoin || !nativeCoinSymbol || selectedCoin === nativeCoinSymbol) return parseFloat(amount) || 0;
    return (parseFloat(amount) || 0) * (1 - getConversionFee(selectedCoin, nativeCoinSymbol) / 100);
  };

  const estimateGasFee = async () => {
    if (!blockchainSettings?.rpc_url || !userWalletAddress) return;
    const targetAddress = walletAddress || receiverWalletAddress;
    if (!targetAddress || !isValidAddress(targetAddress) || !amount) return;
    setEstimatingGas(true);
    try {
      const gas = await estimateGas(blockchainSettings.rpc_url, userWalletAddress, targetAddress, amount);
      setGasEstimate(gas);
    } catch { setGasEstimate(null); }
    setEstimatingGas(false);
  };

  const handleScanSuccess = async (userId: string) => {
    setReceiverId(userId);
    setShowScanner(false);
    const { data } = await supabase.from("profiles").select("full_name, wallet_address").eq("id", userId).single();
    if (data) { setReceiverName(data.full_name || "Unknown User"); setReceiverWalletAddress(data.wallet_address || ""); }
  };

  // ── AI Firewall check (runs before every transfer) ────────────────────────
  const runFirewallCheck = async (txType: "internal" | "blockchain"): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const result = await checkFirewall({
      senderId: user.id,
      receiverId: receiverId || undefined,
      toAddress: walletAddress || receiverWalletAddress || undefined,
      amount: parseFloat(amount) || 0,
      txType,
    });

    if (result.blocked) {
      setAnimReason(result.reason);
      setAnimState("blocked");
      setTimeout(() => {
        setAnimState("idle");
        setAnimReason(undefined);
        setLoading(false);
        setPendingBlockchainTx(false);
      }, ANIM_BLOCKED_DURATION);
      return false;
    }

    return true;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (sendMode === "blockchain") {
      if (selectedCoin && !isNativeCoin(selectedCoin)) { setShowConversionDialog(true); return; }
      const targetAddress = walletAddress || receiverWalletAddress;
      if (!targetAddress || !isValidAddress(targetAddress)) {
        toast({ title: "Invalid Address", description: "Please enter a valid wallet address", variant: "destructive" });
        return;
      }
      setShowPasswordDialog(true);
      return;
    }

    await processInternalTransfer();
  };

  const handleConvertAndSend = () => {
    setShowConversionDialog(false);
    navigate(`/coin-convert?from=${selectedCoin}&to=${nativeCoinSymbol}&amount=${amount}&returnTo=/send-money`);
  };

  // ── Internal transfer ─────────────────────────────────────────────────────
  const processInternalTransfer = async () => {
    setLoading(true);
    setAnimState("sending");

    const passed = await runFirewallCheck("internal");
    if (!passed) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("process_transaction", {
        _sender_id: user.id,
        _receiver_id: receiverId,
        _amount: parseFloat(amount),
        _transaction_type: "transfer",
        _description: "Money transfer",
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; fee?: number; sender_cashback?: number; };

      if (result.success) {
        setAnimState("success");

        // Fire-and-forget SMS + email alerts (non-blocking — never delays the UI)
        supabase.from("profiles").select("phone_number, email").eq("id", user.id).single().then(({ data: sp }) => {
          if (sp?.phone_number) {
            sendTransactionSms({ to: sp.phone_number, type: "sent", amount: parseFloat(amount), to_name: receiverName });
          }
          if (sp?.email) {
            sendTransactionEmail({ to: sp.email, type: "sent", amount: parseFloat(amount), to_name: receiverName });
          }
        });
        if (receiverId) {
          supabase.from("profiles").select("phone_number").eq("id", receiverId).single().then(({ data: rp }) => {
            if (rp?.phone_number) {
              sendTransactionSms({ to: rp.phone_number, type: "received", amount: parseFloat(amount), from_name: "a NETLIFE CASH user" });
            }
          });
        }

        setTimeout(() => {
          setAnimState("idle");
          toast({
            title: "Transfer Successful",
            description: `Sent $${amount} to ${receiverName}. Fee: $${result.fee?.toFixed(2)} (Cashback: $${result.sender_cashback?.toFixed(2)})`,
          });
          navigate(homeRoute);
        }, ANIM_SUCCESS_DURATION);
      } else {
        setAnimState("idle");
        toast({ title: "Transfer Failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (error: any) {
      setAnimState("idle");
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Blockchain transfer ───────────────────────────────────────────────────
  const processBlockchainTransfer = async () => {
    if (!blockchainSettings?.rpc_url) {
      toast({ title: "Blockchain Not Configured", description: "Please contact admin to configure blockchain settings", variant: "destructive" });
      return;
    }
    if (!blockchainSettings?.fee_wallet_address || !blockchainSettings?.fee_wallet_encrypted_key) {
      toast({ title: "Bank Fee Wallet Not Configured", description: "Please contact admin to configure the bank fee wallet for gas sponsorship", variant: "destructive" });
      return;
    }

    setPendingBlockchainTx(true);
    setShowPasswordDialog(false);
    setAnimState("sending");

    const passed = await runFirewallCheck("blockchain");
    if (!passed) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: walletData, error: walletError } = await supabase
        .from("user_wallets").select("encrypted_private_key").eq("user_id", user.id).single();
      if (walletError || !walletData) throw new Error("Wallet not found. Please contact support.");

      let userPrivateKey: string;
      try { userPrivateKey = await decryptPrivateKey(walletData.encrypted_private_key, password); }
      catch { throw new Error("Incorrect password"); }

      const targetAddress = walletAddress || receiverWalletAddress;
      const gasFeeGyd = blockchainSettings.gas_fee_gyd.toString();

      const result = await sendSponsoredTransaction(
        blockchainSettings.rpc_url,
        userPrivateKey,
        blockchainSettings.fee_wallet_encrypted_key,
        targetAddress,
        amount,
        gasFeeGyd,
        blockchainSettings.fee_wallet_address,
        blockchainSettings.chain_id || undefined,
      );

      if (result.success) {
        await supabase.from("transactions").insert({
          sender_id: user.id,
          receiver_id: user.id,
          amount: parseFloat(amount),
          fee: blockchainSettings.gas_fee_gyd,
          status: "completed",
          transaction_type: "blockchain_transfer",
          description: `Blockchain transfer to ${targetAddress.slice(0, 8)}...${targetAddress.slice(-6)}. TX: ${result.txHash}`,
          completed_at: new Date().toISOString(),
        });

        setAnimState("success");
        setTimeout(() => {
          setAnimState("idle");
          toast({
            title: "Blockchain Transfer Successful",
            description: `Sent ${amount} ${blockchainSettings.native_coin_symbol} to ${targetAddress.slice(0, 8)}...${targetAddress.slice(-6)}.`,
          });
          navigate(homeRoute);
        }, ANIM_SUCCESS_DURATION);
      } else {
        setAnimState("idle");
        toast({ title: "Transfer Failed", description: result.error || "Blockchain transaction failed", variant: "destructive" });
      }
    } catch (error: any) {
      setAnimState("idle");
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setPendingBlockchainTx(false);
      setPassword("");
    }
  };

  const isBusy = loading || pendingBlockchainTx;
  const toLabel = receiverName
    || ((walletAddress || receiverWalletAddress)
      ? `${(walletAddress || receiverWalletAddress).slice(0, 8)}…`
      : "Recipient");

  return (
    <div className="min-h-screen bg-background p-4">
      {/* ── Courier transfer animation overlay ── */}
      <TransferAnimation
        state={animState}
        from={senderName}
        to={toLabel}
        amount={amount || "0"}
        currency={sendMode === "blockchain" ? (blockchainSettings?.native_coin_symbol || "COIN") : "GYD"}
        reason={animReason}
      />

      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(homeRoute)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Send Money</h1>

        {blockchainSettings?.is_active && (
          <div className="flex gap-2 mb-4">
            <Button variant={sendMode === "internal" ? "default" : "outline"} onClick={() => setSendMode("internal")} className="flex-1">
              <User size={16} className="mr-2" /> Internal
            </Button>
            <Button variant={sendMode === "blockchain" ? "default" : "outline"} onClick={() => setSendMode("blockchain")} className="flex-1">
              <Wallet size={16} className="mr-2" /> Blockchain
            </Button>
          </div>
        )}

        {showScanner ? (
          <QRScanner onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSend} className="space-y-4">
              {sendMode === "internal" ? (
                <div className="space-y-3">
                  <Label>Receiver</Label>
                  {receiverId ? (
                    <div className="flex items-center justify-between rounded-lg border border-input bg-muted/40 p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <User size={16} className="text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{receiverName || "Selected user"}</p>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={clearRecipient} aria-label="Clear">
                        <X size={16} />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search by name or phone (+592…)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                            data-testid="input-receiver"
                          />
                        </div>
                        <Button type="button" variant="outline" onClick={() => setShowScanner(true)} aria-label="Scan QR">
                          <QrCode size={20} />
                        </Button>
                      </div>
                      {searchQuery.trim().length >= 2 && (
                        <div className="rounded-lg border border-input divide-y max-h-56 overflow-y-auto">
                          {searching && <p className="p-3 text-xs text-muted-foreground">Searching…</p>}
                          {!searching && searchResults.length === 0 && (
                            <p className="p-3 text-xs text-muted-foreground">No users found.</p>
                          )}
                          {searchResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => selectRecipient(u)}
                              className="w-full text-left p-3 hover:bg-muted/60 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{u.full_name || "Unnamed user"}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.phone_number || u.id.slice(0, 8)}</p>
                              </div>
                              <User size={14} className="text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {recentRecipients.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                            <RotateCcw size={12} /> Resend to recent recipients
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {recentRecipients.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => resendTo(r)}
                                className="text-xs rounded-full border border-input bg-background px-3 py-1.5 hover:bg-muted/60"
                              >
                                <span className="font-medium">{r.full_name || r.phone_number || "User"}</span>
                                <span className="text-muted-foreground"> · ${r.last_amount}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <Label>Wallet Address</Label>
                    <Input
                      placeholder="0x..."
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      required
                      data-testid="input-wallet-address"
                    />
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Info size={12} /> Enter the recipient's {blockchainSettings?.native_coin_symbol} wallet address
                    </p>
                  </div>

                  {supportedCoins.length > 1 && (
                    <div>
                      <Label>Select Coin</Label>
                      <Select value={selectedCoin} onValueChange={setSelectedCoin}>
                        <SelectTrigger data-testid="select-coin">
                          <SelectValue placeholder="Select coin" />
                        </SelectTrigger>
                        <SelectContent>
                          {supportedCoins.map((coin) => (
                            <SelectItem key={coin.id} value={coin.coin_symbol}>
                              {coin.coin_name} ({coin.coin_symbol}){coin.is_native && " - Native"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedCoin && !isNativeCoin(selectedCoin) && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} /> This coin will be converted to {nativeCoinSymbol} before sending
                        </p>
                      )}
                    </div>
                  )}
                </>
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
                  data-testid="input-amount"
                />
                {sendMode === "internal" ? (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Info size={12} /> 60% of fees returned to you as cashback
                  </p>
                ) : (
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Fuel size={14} /> Transaction Fee
                      </span>
                      <span className="font-medium">
                        {blockchainSettings?.gas_fee_gyd || 0.01} {blockchainSettings?.native_coin_symbol}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gas fees are sponsored by the bank. You pay a fixed fee in {blockchainSettings?.native_coin_symbol}.
                    </p>
                    {amount && (
                      <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between text-sm font-medium">
                          <span>Total Deducted</span>
                          <span>
                            {(parseFloat(amount || "0") + (blockchainSettings?.gas_fee_gyd || 0.01)).toFixed(6)} {blockchainSettings?.native_coin_symbol}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {amount} {blockchainSettings?.native_coin_symbol} to recipient + {blockchainSettings?.gas_fee_gyd || 0.01} {blockchainSettings?.native_coin_symbol} fee
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isBusy} data-testid="button-send">
                {isBusy ? "Processing…" : `Send ${sendMode === "blockchain" ? blockchainSettings?.native_coin_symbol : "Money"}`}
              </Button>
            </form>
          </Card>
        )}
      </div>

      {/* Password Dialog */}
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
                data-testid="input-password"
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
              data-testid="button-confirm-send"
            >
              Confirm & Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conversion Dialog */}
      <Dialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft size={20} /> Conversion Required
            </DialogTitle>
            <DialogDescription>
              You can only send {nativeCoinSymbol} on the blockchain. Your {selectedCoin} needs to be converted first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount to convert</span>
                <span>{amount} {selectedCoin}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conversion fee</span>
                <span>{getConversionFee(selectedCoin, nativeCoinSymbol)}%</span>
              </div>
              <div className="flex justify-between font-medium border-t pt-2">
                <span>You'll receive (approx)</span>
                <span>{calculateConvertedAmount().toFixed(6)} {nativeCoinSymbol}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Conversion fees go to the liquidity pool.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConversionDialog(false)}>Cancel</Button>
            <Button onClick={handleConvertAndSend}>Convert & Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SendMoney;
