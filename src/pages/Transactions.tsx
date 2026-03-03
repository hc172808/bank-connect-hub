import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Clock, Wallet, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ethers } from "ethers";
import { getSafeProvider } from "@/lib/wallet";

interface Transaction {
  id: string;
  amount: number;
  fee: number;
  status: string;
  transaction_type: string;
  description: string | null;
  created_at: string;
  sender_id: string;
  receiver_id: string;
}

interface BlockchainTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp?: number;
  isOutgoing: boolean;
}

interface BlockchainSettings {
  rpc_url: string | null;
  explorer_url: string | null;
  native_coin_symbol: string;
  is_active: boolean;
}

const Transactions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [blockchainTxs, setBlockchainTxs] = useState<BlockchainTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBlockchain, setLoadingBlockchain] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [blockchainSettings, setBlockchainSettings] = useState<BlockchainSettings | null>(null);

  useEffect(() => {
    if (user) {
      fetchTransactions();
      fetchBlockchainSettings();
      fetchWalletAddress();
    }
  }, [user]);

  const fetchTransactions = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTransactions(data);
    }
    setLoading(false);
  };

  const fetchBlockchainSettings = async () => {
    const { data } = await supabase
      .from("blockchain_settings")
      .select("rpc_url, explorer_url, native_coin_symbol, is_active")
      .maybeSingle();

    if (data) {
      setBlockchainSettings(data);
    }
  };

  const fetchWalletAddress = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", user.id)
      .single();

    if (data?.wallet_address) {
      setWalletAddress(data.wallet_address);
    }
  };

  const fetchBlockchainTransactions = async () => {
    if (!walletAddress || !blockchainSettings?.rpc_url) return;

    setLoadingBlockchain(true);
    try {
      const provider = await getSafeProvider(blockchainSettings.rpc_url);
      if (!provider) {
        setLoadingBlockchain(false);
        return;
      }
      const currentBlock = await provider.getBlockNumber();
      const blocksToScan = Math.min(currentBlock, 1000); // Scan last 1000 blocks
      
      const txs: BlockchainTransaction[] = [];
      
      // Get transaction count to find transactions
      const txCount = await provider.getTransactionCount(walletAddress);
      
      // Scan recent blocks for transactions involving this address
      for (let i = currentBlock; i > currentBlock - blocksToScan && i >= 0; i -= 10) {
        try {
          const block = await provider.getBlock(i, true);
          if (block && block.prefetchedTransactions) {
            for (const tx of block.prefetchedTransactions) {
              if (tx.from?.toLowerCase() === walletAddress.toLowerCase() ||
                  tx.to?.toLowerCase() === walletAddress.toLowerCase()) {
                txs.push({
                  hash: tx.hash,
                  from: tx.from || '',
                  to: tx.to || '',
                  value: ethers.formatEther(tx.value),
                  blockNumber: block.number,
                  timestamp: block.timestamp,
                  isOutgoing: tx.from?.toLowerCase() === walletAddress.toLowerCase(),
                });
              }
            }
          }
        } catch (e) {
          // Skip blocks that fail to load
        }
        
        // Limit to 20 transactions
        if (txs.length >= 20) break;
      }
      
      setBlockchainTxs(txs);
    } catch (error) {
      console.error("Error fetching blockchain transactions:", error);
    }
    setLoadingBlockchain(false);
  };

  const getTransactionIcon = (transaction: Transaction) => {
    if (transaction.sender_id === user?.id) {
      return <ArrowUpRight className="text-destructive" size={20} />;
    }
    return <ArrowDownLeft className="text-green-500" size={20} />;
  };

  const getTransactionAmount = (transaction: Transaction) => {
    const isOutgoing = transaction.sender_id === user?.id;
    const sign = isOutgoing ? "-" : "+";
    const color = isOutgoing ? "text-destructive" : "text-green-500";
    return (
      <span className={`font-bold ${color}`}>
        {sign}${transaction.amount.toFixed(2)}
      </span>
    );
  };

  const openExplorer = (txHash: string) => {
    if (blockchainSettings?.explorer_url) {
      window.open(`${blockchainSettings.explorer_url}/tx/${txHash}`, "_blank");
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Transactions</h1>

        <Tabs defaultValue="internal" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="internal" className="flex items-center gap-2">
              <Clock size={16} />
              Internal
            </TabsTrigger>
            <TabsTrigger 
              value="blockchain" 
              className="flex items-center gap-2"
              disabled={!blockchainSettings?.is_active}
            >
              <Wallet size={16} />
              Blockchain
            </TabsTrigger>
          </TabsList>

          <TabsContent value="internal">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock size={20} />
                  Internal Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading transactions...
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No transactions yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                            {getTransactionIcon(transaction)}
                          </div>
                          <div>
                            <p className="font-medium capitalize">
                              {transaction.transaction_type.replace("_", " ")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(transaction.created_at), "MMM d, yyyy h:mm a")}
                            </p>
                          </div>
                        </div>
                        {getTransactionAmount(transaction)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blockchain">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Wallet size={20} />
                    {blockchainSettings?.native_coin_symbol || "GYD"} Transactions
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={fetchBlockchainTransactions}
                    disabled={loadingBlockchain}
                  >
                    <RefreshCw size={16} className={loadingBlockchain ? "animate-spin" : ""} />
                  </Button>
                </div>
                {walletAddress && (
                  <p className="text-xs text-muted-foreground">
                    Wallet: {formatAddress(walletAddress)}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {!walletAddress ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No wallet address found
                  </div>
                ) : loadingBlockchain ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Scanning blockchain for transactions...
                  </div>
                ) : blockchainTxs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">
                      Click refresh to load blockchain transactions
                    </p>
                    <Button onClick={fetchBlockchainTransactions} variant="outline">
                      <RefreshCw size={16} className="mr-2" />
                      Load Transactions
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blockchainTxs.map((tx) => (
                      <div
                        key={tx.hash}
                        className="flex items-center justify-between p-3 rounded-xl bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center">
                            {tx.isOutgoing ? (
                              <ArrowUpRight className="text-destructive" size={20} />
                            ) : (
                              <ArrowDownLeft className="text-green-500" size={20} />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">
                              {tx.isOutgoing ? "Sent" : "Received"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tx.isOutgoing ? `To: ${formatAddress(tx.to)}` : `From: ${formatAddress(tx.from)}`}
                            </p>
                            {tx.timestamp && (
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(tx.timestamp * 1000), "MMM d, yyyy h:mm a")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold ${tx.isOutgoing ? "text-destructive" : "text-green-500"}`}>
                            {tx.isOutgoing ? "-" : "+"}{parseFloat(tx.value).toFixed(4)} {blockchainSettings?.native_coin_symbol}
                          </span>
                          {blockchainSettings?.explorer_url && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="p-1 h-auto"
                              onClick={() => openExplorer(tx.hash)}
                            >
                              <ExternalLink size={12} />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Transactions;