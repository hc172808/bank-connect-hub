import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const AdminDeposit = () => {
  const [amount, setAmount] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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
      const { data, error } = await supabase.rpc("admin_add_funds", {
        _user_id: selectedUser.id,
        _amount: parseFloat(amount),
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      
      if (result.success) {
        toast({
          title: "Deposit Successful",
          description: `Added $${amount} to ${selectedUser.full_name}'s account.`,
        });
        setAmount("");
        setSelectedUser(null);
        setUserSearch("");
      } else {
        toast({
          title: "Deposit Failed",
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Add Funds to User</h1>

        <Card className="p-6">
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
              {loading ? "Processing..." : "Add Funds"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AdminDeposit;
