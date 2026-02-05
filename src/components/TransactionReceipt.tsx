 import { Button } from "@/components/ui/button";
 import { Card, CardContent } from "@/components/ui/card";
 import { CheckCircle, XCircle } from "lucide-react";
 
 interface TransactionReceiptProps {
   success: boolean;
   type: "payment" | "balance_check" | "receive";
   amount?: number;
   balance?: number;
   recipientName?: string;
   transactionId?: string;
   fee?: number;
   onDone: () => void;
 }
 
 export const TransactionReceipt = ({
   success,
   type,
   amount,
   balance,
   recipientName,
   transactionId,
   fee,
   onDone,
 }: TransactionReceiptProps) => {
   const getTitle = () => {
     if (!success) return "Transaction Failed";
     switch (type) {
       case "payment":
         return "Payment Successful";
       case "balance_check":
         return "Balance Check";
       case "receive":
         return "Funds Received";
       default:
         return "Transaction Complete";
     }
   };
 
   const getIcon = () => {
     if (success) {
       return <CheckCircle className="w-16 h-16 text-green-500" />;
     }
     return <XCircle className="w-16 h-16 text-red-500" />;
   };
 
   return (
     <Card className="w-full max-w-sm mx-auto">
       <CardContent className="pt-6">
         <div className="flex flex-col items-center text-center space-y-4">
           {getIcon()}
 
           <h2 className="text-xl font-bold">{getTitle()}</h2>
 
           {type === "payment" && amount !== undefined && (
             <div className="space-y-2 w-full">
               <div className="flex justify-between py-2 border-b">
                 <span className="text-muted-foreground">Amount</span>
                 <span className="font-semibold">${amount.toFixed(2)}</span>
               </div>
               {fee !== undefined && fee > 0 && (
                 <div className="flex justify-between py-2 border-b">
                   <span className="text-muted-foreground">Fee</span>
                   <span className="font-semibold">${fee.toFixed(4)}</span>
                 </div>
               )}
               {recipientName && (
                 <div className="flex justify-between py-2 border-b">
                   <span className="text-muted-foreground">To</span>
                   <span className="font-semibold">{recipientName}</span>
                 </div>
               )}
               {transactionId && (
                 <div className="flex justify-between py-2 border-b">
                   <span className="text-muted-foreground">Transaction ID</span>
                   <span className="font-mono text-xs">{transactionId.slice(0, 12)}...</span>
                 </div>
               )}
             </div>
           )}
 
           {type === "balance_check" && balance !== undefined && (
             <div className="bg-muted p-4 rounded-xl w-full">
               <p className="text-sm text-muted-foreground">Current Balance</p>
               <p className="text-3xl font-bold">${balance.toFixed(2)}</p>
             </div>
           )}
 
           {type === "receive" && amount !== undefined && (
             <div className="bg-green-500/10 p-4 rounded-xl w-full">
               <p className="text-sm text-green-600">Amount Received</p>
               <p className="text-3xl font-bold text-green-600">${amount.toFixed(2)}</p>
             </div>
           )}
 
           <p className="text-xs text-muted-foreground">
             {new Date().toLocaleString()}
           </p>
 
           <Button onClick={onDone} className="w-full mt-4">
             Done
           </Button>
         </div>
       </CardContent>
     </Card>
   );
 };