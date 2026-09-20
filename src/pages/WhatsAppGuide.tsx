import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, MessageCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardHome } from "@/hooks/useDashboardHome";
import { fetchWhatsAppSettings, type WhatsAppSettings } from "@/lib/whatsapp";

const WhatsAppGuide = () => {
  const navigate = useNavigate();
  const homeRoute = useDashboardHome();
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);

  useEffect(() => {
    fetchWhatsAppSettings().then(setSettings);
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(homeRoute)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-start gap-3 mb-6">
          <div className="rounded-2xl bg-green-600/10 p-3">
            <BookOpen className="text-green-600" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">WhatsApp Verification Guide</h1>
            <p className="text-muted-foreground text-sm mt-1">
              How customers verify their account and how support keeps the process safe.
            </p>
          </div>
        </div>

        <Card className="mb-4 border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="text-green-600" size={19} />
              For customers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              "Register with the mobile number you use on WhatsApp.",
              "Open WhatsApp Verification from the registration prompt or your Profile.",
              "Tap Open WhatsApp and send the pre-filled message to the official support number.",
              "Return to the app and tap I sent it. An administrator will review the request.",
              "Wait for the Verified status before using features that require account verification.",
            ].map((step, index) => (
              <div className="flex gap-3" key={step}>
                <Badge className="h-6 w-6 shrink-0 justify-center rounded-full p-0">{index + 1}</Badge>
                <span>{step}</span>
              </div>
            ))}
            <div className="rounded-lg bg-background p-3 text-xs text-muted-foreground">
              {settings?.instructions || "Send the pre-filled message exactly as shown. Support will confirm your request."}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4 border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="text-red-600" size={19} />
              Safety rules
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>NETLIFE CASH support will never ask for your password, transaction PIN, or banking credentials.</p>
            <p>Only use the WhatsApp number shown inside the app. Do not trust copied numbers from unofficial messages.</p>
            <p>If a message looks suspicious, stop and contact support through the Support Center.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="text-primary" size={19} />
              What happens after you send it?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Your request is stored with a pending status and a short verification code.</p>
            <p>An administrator matches the code and phone number in the official WhatsApp conversation.</p>
            <p>Once approved, the request becomes verified. Rejected requests can be resubmitted with a new code.</p>
            <Button onClick={() => navigate("/verify-whatsapp")} className="mt-2 gap-2 bg-green-600 hover:bg-green-700 text-white">
              <MessageCircle size={17} /> Start verification
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WhatsAppGuide;