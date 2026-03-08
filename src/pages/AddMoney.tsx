import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CreditCard, Building, Wallet, Smartphone } from "lucide-react";

const addOptions = [
  {
    icon: CreditCard,
    title: "Debit/Credit Card",
    description: "Add money using your card",
    color: "bg-blue-500",
    path: "/add-money/card",
  },
  {
    icon: Building,
    title: "Bank Transfer",
    description: "Transfer from your bank account",
    color: "bg-green-500",
    path: "/add-money/bank",
  },
  {
    icon: Smartphone,
    title: "Mobile Money / USSD",
    description: "Pay via mobile money or dial USSD code",
    color: "bg-orange-500",
    path: "/add-money/mobile",
  },
  {
    icon: Wallet,
    title: "Visit Agent",
    description: "Deposit cash at an agent location",
    color: "bg-purple-500",
    path: "/add-money/agent",
  },
];

const AddMoney = () => {
  const navigate = useNavigate();

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

        <h1 className="text-2xl font-bold mb-6">Add Money</h1>

        <Card>
          <CardHeader>
            <CardTitle>Choose Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {addOptions.map((option, index) => (
              <button
                key={index}
                onClick={() => navigate(option.path)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className={`w-12 h-12 ${option.color} rounded-full flex items-center justify-center`}>
                  <option.icon className="text-white" size={24} />
                </div>
                <div>
                  <p className="font-medium">{option.title}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mt-6">
          For cash deposits, please visit your nearest agent location
        </p>
      </div>
    </div>
  );
};

export default AddMoney;
