import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, MessageCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardHome } from "@/hooks/useDashboardHome";
import {
  buildWhatsAppLink,
  createWhatsAppVerificationRequest,
  fetchWhatsAppSettings,
  generateVerificationCode,
  getLatestWhatsAppVerificationRequest,
  getVerification,
  saveVerification,
  type WhatsAppSettings,
  type WhatsAppVerificationRequest,
} from "@/lib/whatsapp";

const VerifyWhatsApp = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const homeRoute = useDashboardHome();
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [request, setRequest] = useState<WhatsAppVerificationRequest | null>(null);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [config, profileResult] = await Promise.all([
      fetchWhatsAppSettings(),
      supabase.from("profiles").select("phone_number").eq("id", user.id).single(),
    ]);
    setSettings(config);
    setPhone(config.supportNumber);
    setUserPhone(profileResult.data?.phone_number || "");

    try {
      const latest = await getLatestWhatsAppVerificationRequest(user.id);
      setRequest(latest);
      setDatabaseReady(true);
      if (latest) setCode(latest.verification_code);
      else setCode(generateVerificationCode());
    } catch {
      // Keep the page usable while the migration is being applied.
      setDatabaseReady(false);
      const existing = getVerification(user.id);
      setCode(existing?.code || generateVerificationCode());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [user]);

  const message = `Hi, my NETLIFE CASH verification code is ${code}. My registered phone is ${userPhone || "the number on my account"}.`;

  const openWhatsApp = async () => {
    if (!user || !phone || !code) return;
    setSending(true);
    try {
      if (databaseReady) {
        const created = await createWhatsAppVerificationRequest({
          userId: user.id,
          phoneNumber: userPhone,
          code,
        });
        setRequest(created);
      } else {
        saveVerification({ userId: user.id, phone, code, sentAt: Date.now() });
      }
      window.open(buildWhatsAppLink(phone, message), "_blank", "noopener,noreferrer");
      toast({ title: "WhatsApp opened", description: "Send the pre-filled message, then return here and tap I sent it." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not start verification", description: error.message });
    } finally {
      setSending(false);
    }
  };

  const regenerate = () => {
    const newCode = generateVerificationCode();
    setCode(newCode);
    setRequest(null);
    if (user) saveVerification({ userId: user.id, phone, code: newCode, sentAt: 0 });
    toast({ title: "New code generated", description: "Use the new code in your next WhatsApp message." });
  };

  const status = request?.status || null;
  const sent = !!request || !!getVerification(user?.id || "")?.sentAt;

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(homeRoute)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="text-green-600" size={26} /> WhatsApp Verification
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Complete this after registration so an administrator can verify your account.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate("/whatsapp-guide")} aria-label="Open WhatsApp guide">
            <BookOpen size={19} />
          </Button>
        </div>

        {loading ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Loading verification settings…</CardContent></Card>
        ) : !settings?.enabled ? (
          <Card><CardContent className="py-8 text-center space-y-3">
            <ShieldAlert className="mx-auto text-yellow-600" size={45} />
            <h2 className="font-bold">Verification is temporarily unavailable</h2>
            <p className="text-sm text-muted-foreground">Please try again later or contact support through the Support Center.</p>
          </CardContent></Card>
        ) : status === "verified" ? (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="py-8 text-center space-y-3">
              <CheckCircle2 className="mx-auto text-green-600" size={56} />
              <Badge className="bg-green-600 text-white">Verified</Badge>
              <h2 className="text-xl font-bold">WhatsApp verified</h2>
              <p className="text-sm text-muted-foreground">Your account verification request was approved by support.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="text-primary" size={22} /> Send your verification request
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {status === "rejected" && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
                  <p className="font-semibold text-red-700 dark:text-red-300">Request needs attention</p>
                  <p className="text-muted-foreground mt-1">{request?.admin_notes || "Please generate a new code and send it again."}</p>
                </div>
              )}
              {status === "pending" && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm flex gap-2">
                  <Clock3 className="text-yellow-600 shrink-0" size={18} />
                  <span>Your request is pending review. You can resend only if support asks you to generate a new code.</span>
                </div>
              )}

              <div className="text-center bg-muted/40 rounded-xl py-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Your verification code</div>
                <div className="text-4xl font-bold font-mono tracking-widest" data-testid="text-code">{code}</div>
              </div>

              <div>
                <Label>Official WhatsApp number</Label>
                <Input value={phone} readOnly placeholder="Set by an administrator" data-testid="input-support-phone" />
                <p className="text-xs text-muted-foreground mt-1">{settings.businessName}. Do not use an unofficial number.</p>
              </div>

              <ol className="space-y-2 text-sm">
                <li className="flex gap-2"><span className="font-bold">1.</span> Tap Open WhatsApp.</li>
                <li className="flex gap-2"><span className="font-bold">2.</span> Send the pre-filled message exactly as shown.</li>
                <li className="flex gap-2"><span className="font-bold">3.</span> Return here. An administrator will approve the request.</li>
              </ol>

              <Button onClick={openWhatsApp} disabled={sending || !phone || (status === "pending")} className="w-full bg-green-600 hover:bg-green-700 text-white gap-2" size="lg" data-testid="button-open-whatsapp">
                <MessageCircle size={20} /> {sending ? "Preparing…" : "Open WhatsApp"}
              </Button>

              {sent && (
                <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  Request sent. Keep this code available so support can match your WhatsApp message.
                </div>
              )}

              <Button onClick={regenerate} variant="outline" className="w-full gap-2" disabled={status === "pending"} data-testid="button-regenerate">
                <RefreshCw size={15} /> Generate a new code
              </Button>

              <p className="text-xs text-muted-foreground">{settings.instructions}</p>
              {!databaseReady && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300">Database verification is not enabled yet. Ask an administrator to apply the WhatsApp verification migration.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VerifyWhatsApp;