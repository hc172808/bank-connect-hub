import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, DollarSign, Save } from "lucide-react";

interface RegistrationFee {
  id: string;
  fee_name: string;
  fee_amount: number;
  is_active: boolean;
  updated_at: string;
}

const VendorRegistrationFees = () => {
  const [fee, setFee] = useState<RegistrationFee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feeAmount, setFeeAmount] = useState("");
  const [feeName, setFeeName] = useState("");
  const [isActive, setIsActive] = useState(true);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchFee();
  }, []);

  const fetchFee = async () => {
    try {
      const { data, error } = await supabase
        .from("vendor_registration_fees")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setFee(data);
        setFeeAmount(data.fee_amount.toString());
        setFeeName(data.fee_name);
        setIsActive(data.is_active);
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const updateData = {
        fee_name: feeName,
        fee_amount: parseFloat(feeAmount) || 0,
        is_active: isActive,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      if (fee) {
        const { error } = await supabase
          .from("vendor_registration_fees")
          .update(updateData)
          .eq("id", fee.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("vendor_registration_fees")
          .insert(updateData);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Vendor registration fee updated successfully.",
      });
      fetchFee();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <DollarSign size={28} />
          Vendor Registration Fees
        </h1>

        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label>Fee Name</Label>
              <Input
                value={feeName}
                onChange={(e) => setFeeName(e.target.value)}
                placeholder="e.g., Vendor Registration Fee"
              />
            </div>

            <div>
              <Label>Fee Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-sm text-muted-foreground">
                  Enable or disable vendor registration fee collection
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save size={18} className="mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Card>

        <Card className="p-4 mt-4 bg-muted/50">
          <h3 className="font-semibold mb-2">How it works</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• New vendors will be charged this fee when they register</li>
            <li>• The fee is deducted from their wallet balance</li>
            <li>• If disabled, vendors can register for free</li>
            <li>• Collected fees go to the admin account</li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default VendorRegistrationFees;