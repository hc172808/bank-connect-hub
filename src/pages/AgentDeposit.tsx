import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, XCircle, Clock } from "lucide-react";

const AgentDeposit = () => {
  const [amount, setAmount] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingDeposits();
  }, []);

  const fetchPendingDeposits = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("pending_deposits")
      .select(`
        *,
        profiles:user_id(full_name)
      `)
      .eq("agent_id", user.id)
      .order("created_at", { ascending: false });

    if (data) setPendingDeposits(data);
  };

  const searchUsers = async () => {
    if (!userSearch.trim()) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .or(`full_name.ilike.%${userSearch}%,id.eq.${userSearch}`)
      .limit(5);

    setSearchResults(data || []);
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      toast({
        title: "Error",
        description: "Please select a user",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("pending_deposits")
        .insert({
          agent_id: user.id,
          user_id: selectedUser.id,
          amount: parseFloat(amount),
        });

      if (error) throw error;

      toast({
        title: "Deposit Request Submitted",
        description: `Awaiting admin approval for $${amount} deposit to ${selectedUser.full_name}.`,
      });
      setAmount("");
      setSelectedUser(null);
      setUserSearch("");
      fetchPendingDeposits();
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="text-green-500" size={20} />;
      case "rejected":
        return <XCircle className="text-red-500" size={20} />;
      default:
        return <Clock className="text-yellow-500" size={20} />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/agent-dashboard")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Agent Deposit</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">New Deposit</h2>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <Label>User (Name or ID)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name or ID"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <Button type="button" onClick={searchUsers}>
                    Search
                  </Button>
                </div>
                
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {searchResults.map((user) => (
                      <Button
                        key={user.id}
                        type="button"
                        variant={selectedUser?.id === user.id ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => {
                          setSelectedUser(user);
                          setSearchResults([]);
                        }}
                      >
                        {user.full_name || "Unknown"} ({user.id.slice(0, 8)}...)
                      </Button>
                    ))}
                  </div>
                )}

                {selectedUser && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {selectedUser.full_name}
                  </p>
                )}
              </div>

              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Submitting..." : "Submit for Approval"}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Pending Deposits</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {pendingDeposits.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No pending deposits
                </p>
              ) : (
                pendingDeposits.map((deposit) => (
                  <div
                    key={deposit.id}
                    className="p-3 border rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {deposit.profiles?.full_name || "Unknown User"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ${deposit.amount}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(deposit.status)}
                      <span className="text-sm capitalize">{deposit.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AgentDeposit;
