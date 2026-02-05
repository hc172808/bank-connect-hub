 import { useEffect, useState } from "react";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { supabase } from "@/integrations/supabase/client";
 import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
 import { ethers } from "ethers";
 
 interface BlockchainSettings {
   fee_wallet_address: string | null;
   rpc_url: string | null;
   native_coin_symbol: string;
 }
 
 interface FeeStats {
   totalCollected: number;
   totalSpent: number;
   netBalance: number;
 }
 
 export const AdminFeeWalletWidget = () => {
   const [settings, setSettings] = useState<BlockchainSettings | null>(null);
   const [walletBalance, setWalletBalance] = useState<string>("0");
   const [feeStats, setFeeStats] = useState<FeeStats>({ totalCollected: 0, totalSpent: 0, netBalance: 0 });
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     const fetchData = async () => {
       // Fetch blockchain settings
       const { data: blockchainData } = await supabase
         .from("blockchain_settings")
         .select("fee_wallet_address, rpc_url, native_coin_symbol")
         .eq("is_active", true)
         .single();
 
       if (blockchainData) {
         setSettings(blockchainData);
 
         // Fetch on-chain balance if RPC and address available
         if (blockchainData.rpc_url && blockchainData.fee_wallet_address) {
           try {
             const provider = new ethers.JsonRpcProvider(blockchainData.rpc_url);
             const balance = await provider.getBalance(blockchainData.fee_wallet_address);
             setWalletBalance(ethers.formatEther(balance));
           } catch (error) {
             console.error("Error fetching fee wallet balance:", error);
           }
         }
       }
 
       // Fetch gas fee ledger stats
       const { data: ledgerData } = await supabase
         .from("gas_fee_ledger")
         .select("transaction_type, amount");
 
       if (ledgerData) {
         const collected = ledgerData
           .filter(l => l.transaction_type === "collected")
           .reduce((sum, l) => sum + Number(l.amount), 0);
         const spent = ledgerData
           .filter(l => l.transaction_type === "spent")
           .reduce((sum, l) => sum + Number(l.amount), 0);
 
         setFeeStats({
           totalCollected: collected,
           totalSpent: spent,
           netBalance: collected - spent
         });
       }
 
       setLoading(false);
     };
 
     fetchData();
   }, []);
 
   if (loading) {
     return (
       <Card>
         <CardContent className="p-6">
           <div className="animate-pulse">Loading fee wallet data...</div>
         </CardContent>
       </Card>
     );
   }
 
   const symbol = settings?.native_coin_symbol || "GYD";
 
   return (
     <Card>
       <CardHeader>
         <CardTitle className="flex items-center gap-2">
           <Wallet size={20} />
           Bank Fee Wallet
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         <div className="bg-muted p-4 rounded-xl">
           <p className="text-sm text-muted-foreground">On-Chain Balance</p>
           <p className="text-2xl font-bold">{parseFloat(walletBalance).toFixed(4)} {symbol}</p>
           {settings?.fee_wallet_address && (
             <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
               {settings.fee_wallet_address}
             </p>
           )}
         </div>
 
         <div className="grid grid-cols-2 gap-3">
           <div className="bg-green-500/10 p-3 rounded-lg">
             <div className="flex items-center gap-2 text-green-600">
               <TrendingUp size={16} />
               <span className="text-sm">Collected</span>
             </div>
             <p className="text-lg font-bold text-green-600">
               {feeStats.totalCollected.toFixed(4)} {symbol}
             </p>
           </div>
 
           <div className="bg-red-500/10 p-3 rounded-lg">
             <div className="flex items-center gap-2 text-red-600">
               <TrendingDown size={16} />
               <span className="text-sm">Spent (Gas)</span>
             </div>
             <p className="text-lg font-bold text-red-600">
               {feeStats.totalSpent.toFixed(4)} {symbol}
             </p>
           </div>
         </div>
 
         <div className="border-t pt-3">
           <div className="flex justify-between items-center">
             <span className="text-sm text-muted-foreground">Net Profit</span>
             <span className={`font-bold ${feeStats.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
               {feeStats.netBalance >= 0 ? '+' : ''}{feeStats.netBalance.toFixed(4)} {symbol}
             </span>
           </div>
         </div>
       </CardContent>
     </Card>
   );
 };