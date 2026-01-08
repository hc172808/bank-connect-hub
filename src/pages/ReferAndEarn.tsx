import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Gift, Copy, Share2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const ReferAndEarn = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const referralCode = user?.id?.slice(0, 8).toUpperCase() || "XXXXXXXX";

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast({
      title: "Copied!",
      description: "Referral code copied to clipboard",
    });
  };

  const shareCode = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join GYD Wallet",
          text: `Use my referral code ${referralCode} to sign up and get $5 bonus!`,
          url: window.location.origin,
        });
      } catch (error) {
        copyCode();
      }
    } else {
      copyCode();
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

        <h1 className="text-2xl font-bold mb-6">Refer & Earn</h1>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-primary to-primary/80">
            <CardContent className="p-6 text-center">
              <Gift size={48} className="mx-auto mb-4 text-primary-foreground" />
              <h2 className="text-2xl font-bold text-primary-foreground mb-2">
                Earn $5 per Referral
              </h2>
              <p className="text-primary-foreground/80">
                Share your code with friends and family. Get $5 when they sign up!
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Referral Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-xl text-center">
                <span className="text-2xl font-bold tracking-wider">{referralCode}</span>
              </div>

              <div className="flex gap-2">
                <Button onClick={copyCode} variant="outline" className="flex-1 gap-2">
                  <Copy size={18} />
                  Copy
                </Button>
                <Button onClick={shareCode} className="flex-1 gap-2">
                  <Share2 size={18} />
                  Share
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users size={20} />
                How it Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                  <span>Share your referral code with friends</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                  <span>They sign up using your code</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                  <span>Both of you get $5 bonus!</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ReferAndEarn;
