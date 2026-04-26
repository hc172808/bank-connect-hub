import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MessageCircle, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardHome } from "@/hooks/useDashboardHome";
import {
  WHATSAPP_SUPPORT_NUMBER,
  buildWhatsAppLink,
  generateVerificationCode,
  getVerification,
  saveVerification,
} from "@/lib/whatsapp";

const VerifyWhatsApp = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const homeRoute = useDashboardHome();

  const [code, setCode] = useState("");
  const [phone, setPhone] = useState(WHATSAPP_SUPPORT_NUMBER);
  const [userPhone, setUserPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("phone_number")
        .eq("id", user.id)
        .single();
      setUserPhone(data?.phone_number || "");

      const existing = getVerification(user.id);
      if (existing) {
        setCode(existing.code);
        setSentAt(existing.sentAt);
        setConfirmed(!!existing.confirmedAt);
      } else {
        const newCode = generateVerificationCode();
        setCode(newCode);
      }
      setLoading(false);
    };
    init();
  }, [user]);

  const message = `Hi, my Virtual Bank verification code is ${code} (account: ${userPhone || user?.email || user?.id || ""}).`;

  const openWhatsApp = () => {
    if (!user) return;
    const url = buildWhatsAppLink(phone, message);
    const now = Date.now();
    setSentAt(now);
    saveVerification({
      userId: user.id,
      phone,
      code,
      sentAt: now,
      confirmedAt: confirmed ? Date.now() : undefined,
    });
    window.open(url, "_blank");
  };

  const regenerate = () => {
    const newCode = generateVerificationCode();
    setCode(newCode);
    setSentAt(null);
    setConfirmed(false);
    if (user) {
      saveVerification({ userId: user.id, phone, code: newCode, sentAt: 0 });
    }
    toast({ title: "New code generated", description: "Send the new code on WhatsApp." });
  };

  const markSent = () => {
    if (!user || !sentAt) {
      toast({ variant: "destructive", title: "Open WhatsApp first" });
      return;
    }
    setConfirmed(true);
    saveVerification({
      userId: user.id,
      phone,
      code,
      sentAt,
      confirmedAt: Date.now(),
    });
    toast({
      title: "Marked as sent",
      description: "Our team will confirm your verification shortly.",
    });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(homeRoute)} className="mb-4" data-testid="button-back">
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <MessageCircle className="text-green-600" size={26} />
          WhatsApp Verification
        </h1>
        <p className="text-muted-foreground mb-6">
          Verify your account with WhatsApp in three quick steps.
        </p>

        {loading ? (
          <Card><CardContent className="py-10 text-center">Loading…</CardContent></Card>
        ) : confirmed ? (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="py-8 text-center space-y-3">
              <CheckCircle2 className="mx-auto text-green-600" size={56} />
              <h2 className="text-xl font-bold">Code sent</h2>
              <p className="text-sm text-muted-foreground">
                Your code <span className="font-mono font-bold">{code}</span> was forwarded to support.
                We'll mark your account as verified once they confirm receipt.
              </p>
              <Button variant="outline" onClick={regenerate} className="gap-2">
                <RefreshCw size={16} />
                Generate a new code
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="text-primary" size={22} />
                Your verification code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="text-center bg-muted/40 rounded-xl py-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Your code</div>
                <div className="text-4xl font-bold font-mono tracking-widest" data-testid="text-code">{code}</div>
              </div>

              <div>
                <Label>Send to (WhatsApp number)</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15555555555"
                  data-testid="input-support-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is your Virtual Bank support line. Set it via VITE_WHATSAPP_SUPPORT_NUMBER or override here.
                </p>
              </div>

              <ol className="space-y-2 text-sm">
                <li className="flex gap-2"><span className="font-bold">1.</span> Tap the button below to open WhatsApp.</li>
                <li className="flex gap-2"><span className="font-bold">2.</span> WhatsApp opens with your code already typed — just press send.</li>
                <li className="flex gap-2"><span className="font-bold">3.</span> Come back and tap "I sent it".</li>
              </ol>

              <Button
                onClick={openWhatsApp}
                className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                size="lg"
                data-testid="button-open-whatsapp"
              >
                <MessageCircle size={20} />
                Open WhatsApp
              </Button>

              <Button
                onClick={markSent}
                variant="outline"
                className="w-full gap-2"
                disabled={!sentAt}
                data-testid="button-mark-sent"
              >
                <CheckCircle2 size={18} />
                I sent it
              </Button>

              <Button
                onClick={regenerate}
                variant="ghost"
                className="w-full gap-2 text-xs"
                data-testid="button-regenerate"
              >
                <RefreshCw size={14} />
                Generate a new code
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VerifyWhatsApp;
