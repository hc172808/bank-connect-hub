import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const RequestFunds = () => {
  const [amount, setAmount] = useState("");
  const [payerSearch, setPayerSearch] = useState("");
  const [selectedPayer, setSelectedPayer] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const searchUsers = async () => {
    if (!payerSearch.trim()) return;

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .or(`full_name.ilike.%${payerSearch}%,id.eq.${payerSearch}`)
      .limit(5);

    setSearchResults(data || []);
  };

  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayer) {
      toast({
        title: "Error",
        description: "Please select a payer",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const verificationCode = generateVerificationCode();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiry

      const { error } = await supabase
        .from("fund_requests")
        .insert({
          requester_id: user.id,
          payer_id: selectedPayer.id,
          amount: parseFloat(amount),
          verification_code: verificationCode,
          expires_at: expiresAt.toISOString(),
        });

      if (error) throw error;

      toast({
        title: "Request Sent",
        description: `Verification code: ${verificationCode}. Share this with ${selectedPayer.full_name}.`,
      });
      navigate("/client-dashboard");
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
          onClick={() => navigate("/client-dashboard")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Request Funds</h1>

        <Card className="p-6">
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <Label>From User (Name or ID)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name or ID"
                  value={payerSearch}
                  onChange={(e) => setPayerSearch(e.target.value)}
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
                      variant={selectedPayer?.id === user.id ? "default" : "outline"}
                      className="w-full justify-start"
                      onClick={() => {
                        setSelectedPayer(user);
                        setSearchResults([]);
                      }}
                    >
                      {user.full_name || "Unknown"} ({user.id.slice(0, 8)}...)
                    </Button>
                  ))}
                </div>
              )}

              {selectedPayer && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {selectedPayer.full_name}
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
              {loading ? "Sending Request..." : "Request Funds"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              A verification code will be generated and must be shared with the payer.
              Request expires in 15 minutes.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default RequestFunds;
