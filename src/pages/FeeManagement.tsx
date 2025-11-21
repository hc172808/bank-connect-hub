import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const FeeManagement = () => {
  const [fees, setFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchFees();
  }, []);

  const fetchFees = async () => {
    const { data } = await supabase
      .from("transaction_fees")
      .select("*")
      .order("transaction_type");
    
    if (data) setFees(data);
  };

  const updateFee = async (id: string, feePercentage: number, fixedFee: number) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("transaction_fees")
        .update({
          fee_percentage: feePercentage,
          fixed_fee: fixedFee,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Fee Updated",
        description: "Transaction fee has been updated successfully.",
      });
      fetchFees();
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
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Fee Management</h1>

        <div className="space-y-4">
          {fees.map((fee) => (
            <Card key={fee.id} className="p-6">
              <h3 className="text-lg font-semibold mb-4 capitalize">
                {fee.transaction_type} Fees
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Percentage Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    defaultValue={fee.fee_percentage}
                    onChange={(e) => {
                      fee.fee_percentage = parseFloat(e.target.value);
                    }}
                  />
                </div>

                <div>
                  <Label>Fixed Fee ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={fee.fixed_fee}
                    onChange={(e) => {
                      fee.fixed_fee = parseFloat(e.target.value);
                    }}
                  />
                </div>
              </div>

              <Button
                className="mt-4"
                onClick={() => updateFee(fee.id, fee.fee_percentage, fee.fixed_fee)}
                disabled={loading}
              >
                Update Fee
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeeManagement;
