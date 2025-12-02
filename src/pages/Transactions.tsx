import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

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

const Transactions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTransactions();
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={20} />
              Recent Transactions
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
      </div>
    </div>
  );
};

export default Transactions;
