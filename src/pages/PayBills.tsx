import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Zap, Wifi, Tv, Droplets, Phone, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const billTypes = [
  { icon: Zap, label: "Electricity", color: "bg-yellow-500" },
  { icon: Wifi, label: "Internet", color: "bg-blue-500" },
  { icon: Tv, label: "Cable TV", color: "bg-purple-500" },
  { icon: Droplets, label: "Water", color: "bg-cyan-500" },
  { icon: Phone, label: "Phone", color: "bg-green-500" },
  { icon: CreditCard, label: "Other", color: "bg-gray-500" },
];

const PayBills = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");

  const handlePayBill = () => {
    if (!selectedBill || !accountNumber || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    toast({
      title: "Bill Payment Initiated",
      description: `Payment of $${amount} for ${selectedBill} is being processed`,
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

        <h1 className="text-2xl font-bold mb-6">Pay Bills</h1>

        <Card>
          <CardHeader>
            <CardTitle>Select Bill Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {billTypes.map((bill) => (
                <button
                  key={bill.label}
                  onClick={() => setSelectedBill(bill.label)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    selectedBill === bill.label
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className={`w-12 h-12 ${bill.color} rounded-full flex items-center justify-center`}>
                    <bill.icon className="text-white" size={24} />
                  </div>
                  <span className="text-xs font-medium">{bill.label}</span>
                </button>
              ))}
            </div>

            {selectedBill && (
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Account Number</label>
                  <Input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Enter account number"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Amount</label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                  />
                </div>
                <Button onClick={handlePayBill} className="w-full">
                  Pay Bill
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PayBills;
