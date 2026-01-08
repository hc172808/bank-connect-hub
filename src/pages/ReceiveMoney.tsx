import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ReceiveMoney = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const walletId = user?.id?.slice(0, 8).toUpperCase() || "XXXXXXXX";

  const copyWalletId = () => {
    navigator.clipboard.writeText(walletId);
    toast({
      title: "Copied!",
      description: "Wallet ID copied to clipboard",
    });
  };

  const shareWalletId = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My GYD Wallet",
          text: `Send money to my wallet: ${walletId}`,
        });
      } catch (error) {
        copyWalletId();
      }
    } else {
      copyWalletId();
    }
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

        <h1 className="text-2xl font-bold mb-6">Receive Money</h1>

        <QRCodeDisplay />

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Or Share Wallet ID</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Your Wallet ID</p>
              <span className="text-xl font-bold tracking-wider">{walletId}</span>
            </div>

            <div className="flex gap-2">
              <Button onClick={copyWalletId} variant="outline" className="flex-1 gap-2">
                <Copy size={18} />
                Copy
              </Button>
              <Button onClick={shareWalletId} className="flex-1 gap-2">
                <Share2 size={18} />
                Share
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mt-6">
          Share your QR code or wallet ID to receive money from others
        </p>
      </div>
    </div>
  );
};

export default ReceiveMoney;
