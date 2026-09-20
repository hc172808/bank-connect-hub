import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QRCodeSVG } from "qrcode.react";
import { useDashboardHome } from "@/hooks/useDashboardHome";

const ReceiveMoney = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const homeRoute = useDashboardHome();
  const userId = user?.id || "";

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
          title: "My private ledger account",
          text: `Send GYD through the private ledger.\nUser ID: ${userId}`,
        });
      } catch (error) {
          copyAddress(userId, "User ID");
      }
    } else {
      copyAddress(userId, "User ID");
    }
  };

  // QR data identifies the private-ledger recipient. No public wallet address is exposed.
  const qrData = JSON.stringify({
    userId: userId,
    type: "private_ledger_receive"
  });

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(homeRoute)}
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
            <CardTitle>Private Ledger Details</CardTitle>
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

            <div className="flex gap-2 pt-2">
              <Button onClick={shareAddress} className="flex-1 gap-2">
                <Share2 size={18} />
                Share
              </Button>
              <Button 
                onClick={() => copyAddress(userId, "User ID")} 
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
          Share your QR code or private ledger ID to receive GYD from others
        </p>
      </div>
    </div>
  );
};

export default ReceiveMoney;
