import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const quickAmounts = [5, 10, 20, 50, 100];

const TopUp = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");

  const handleTopUp = () => {
    if (!phoneNumber || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    toast({
      title: "Top-up Successful",
      description: `$${amount} has been added to ${phoneNumber}`,
    });
    navigate("/client");
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

        <h1 className="text-2xl font-bold mb-6">Mobile Top-up</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone size={24} />
              Top Up Phone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Phone Number</label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Quick Select</label>
              <div className="grid grid-cols-5 gap-2">
                {quickAmounts.map((amt) => (
                  <Button
                    key={amt}
                    variant={amount === String(amt) ? "default" : "outline"}
                    onClick={() => setAmount(String(amt))}
                    className="h-12"
                  >
                    ${amt}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Or Enter Amount</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>

            <Button onClick={handleTopUp} className="w-full h-12">
              Top Up Now
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TopUp;
