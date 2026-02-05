import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

const ReceiveMoney = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWalletAddress = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("user_wallets")
        .select("wallet_address")
        .eq("user_id", user.id)
        .single();
      
      if (data) {
        setWalletAddress(data.wallet_address);
      }
      setLoading(false);
    };
    
    fetchWalletAddress();
  }, [user]);

  const userId = user?.id || "";
  const displayAddress = walletAddress || "No wallet found";

  const copyAddress = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const shareAddress = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My GYD Wallet",
          text: `Send GYD to my wallet:\nUser ID: ${userId}\nWallet Address: ${walletAddress || 'N/A'}`,
        });
      } catch (error) {
        copyAddress(walletAddress || userId, "Wallet info");
      }
    } else {
      copyAddress(walletAddress || userId, "Wallet info");
    }
  };

  // QR data includes both user ID (for internal transfers) and wallet address (for on-chain)
  const qrData = JSON.stringify({
    userId: userId,
    walletAddress: walletAddress,
    type: "gyd_receive"
  });

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

        {/* QR Code Card */}
        <Card className="p-6 flex flex-col items-center gap-4">
          <h3 className="text-lg font-semibold">Your Payment QR Code</h3>
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG value={qrData} size={200} />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Share this QR code to receive GYD payments
          </p>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Wallet Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* User ID for internal transfers */}
            <div className="bg-muted p-4 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">User ID (Internal)</p>
              <span className="text-sm font-mono break-all">{userId.slice(0, 16)}...</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyAddress(userId, "User ID")}
                className="ml-2"
              >
                <Copy size={14} />
              </Button>
            </div>

            {/* Blockchain wallet address */}
            <div className="bg-muted p-4 rounded-xl text-center">
              <p className="text-sm text-muted-foreground mb-1">Blockchain Wallet (GYD)</p>
              {loading ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : walletAddress ? (
                <span className="text-xs font-mono break-all">{walletAddress}</span>
              ) : (
                <span className="text-sm text-muted-foreground">No wallet created yet</span>
              )}
              {walletAddress && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyAddress(walletAddress, "Wallet address")}
                  className="ml-2"
                >
                  <Copy size={14} />
                </Button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={shareAddress} className="flex-1 gap-2">
                <Share2 size={18} />
                Share
              </Button>
              <Button 
                onClick={() => copyAddress(walletAddress || userId, "Wallet")} 
                variant="outline" 
                className="flex-1 gap-2"
              >
                <Copy size={18} />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center mt-6">
          Share your QR code or wallet address to receive GYD from others
        </p>
      </div>
    </div>
  );
};

export default ReceiveMoney;
