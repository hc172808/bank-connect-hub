import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, Loader2, MessageCircle, Save, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchWhatsAppSettings, type WhatsAppSettings, type WhatsAppVerificationRequest } from "@/lib/whatsapp";

const AdminWhatsAppVerification = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<WhatsAppSettings>({
    enabled: true,
    supportNumber: "",
    businessName: "NETLIFE CASH Support",
    instructions: "",
  });
  const [requests, setRequests] = useState<WhatsAppVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(true);

  const load = async () => {
    setLoading(true);
    setSettings(await fetchWhatsAppSettings());
    const { data, error } = await (supabase as any)
      .from("whatsapp_verification_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(100);
    if (error) {
      setDatabaseReady(false);
      setRequests([]);
    } else {
      setDatabaseReady(true);
      setRequests((data || []) as WhatsAppVerificationRequest[]);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const saveSettings = async () => {
    setSaving(true);
    const rows = [
      { key: "whatsapp_verification_enabled", value: settings.enabled },
      { key: "whatsapp_support_number", value: settings.supportNumber.trim() },
      { key: "whatsapp_business_name", value: settings.businessName.trim() },
      { key: "whatsapp_verification_instructions", value: settings.instructions.trim() },
    ];
    const { error } = await supabase.from("app_settings").upsert(
      rows.map((row) => ({ ...row, updated_at: new Date().toISOString(), updated_by: user?.id })) as never,
      { onConflict: "key" },
    );
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Settings could not be saved", description: error.message });
      return;
    }
    toast({ title: "WhatsApp settings saved", description: "New users will see the updated support details." });
  };

  const updateRequest = async (request: WhatsAppVerificationRequest, status: "verified" | "rejected") => {
    const notes = status === "verified"
      ? "Matched against the official WhatsApp conversation."
      : "The WhatsApp message could not be matched. Please send a new code.";
    const { error } = await (supabase as any)
      .from("whatsapp_verification_requests")
      .update({ status, admin_notes: notes, verified_at: status === "verified" ? new Date().toISOString() : null, verified_by: status === "verified" ? user?.id : null })
      .eq("id", request.id);
    if (error) {
      toast({ variant: "destructive", title: "Request could not be updated", description: error.message });
      return;
    }
    setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status, admin_notes: notes } : item));
    toast({ title: status === "verified" ? "Request approved" : "Request rejected" });
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Admin Dashboard
        </Button>
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><MessageCircle className="text-green-600" /> WhatsApp Verification</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure the official WhatsApp line and review new-user verification requests.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/whatsapp-guide")} className="gap-2"><BookOpen size={16} /> User guide</Button>
        </div>

        <Card className="mb-5">
          <CardHeader>
            <CardTitle>WhatsApp setup</CardTitle>
            <CardDescription>Use an E.164 number, including the country code. This is the number opened by the verification button.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><p className="font-medium">Allow WhatsApp verification</p><p className="text-xs text-muted-foreground">Turn this off temporarily if support is unavailable.</p></div>
              <Switch checked={settings.enabled} onCheckedChange={(enabled) => setSettings((current) => ({ ...current, enabled }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>Official WhatsApp number</Label><Input value={settings.supportNumber} onChange={(e) => setSettings((current) => ({ ...current, supportNumber: e.target.value }))} placeholder="+5926000000" data-testid="input-admin-whatsapp-number" /></div>
              <div className="space-y-2"><Label>Business/support name</Label><Input value={settings.businessName} onChange={(e) => setSettings((current) => ({ ...current, businessName: e.target.value }))} placeholder="NETLIFE CASH Support" /></div>
            </div>
            <div className="space-y-2"><Label>Instructions shown to users</Label><Textarea value={settings.instructions} onChange={(e) => setSettings((current) => ({ ...current, instructions: e.target.value }))} rows={3} placeholder="Tell users what to send and what support will never ask for." /></div>
            <Button onClick={saveSettings} disabled={saving} className="gap-2">{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save WhatsApp settings</Button>
            <p className="text-xs text-muted-foreground">Recommended: use a WhatsApp Business account with a profile name and greeting that users can recognize.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle>Verification requests</CardTitle><CardDescription>Match the user, phone number, and code with the official WhatsApp conversation.</CardDescription></div>
            <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
          </CardHeader>
          <CardContent>
            {!databaseReady ? (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm flex gap-3"><ShieldAlert className="text-yellow-600 shrink-0" /><span>Requests are unavailable until the WhatsApp verification migration is applied to Supabase.</span></div>
            ) : loading ? (
              <div className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto animate-spin mb-2" />Loading requests…</div>
            ) : requests.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground"><MessageCircle className="mx-auto mb-2 opacity-30" /><p>No verification requests yet.</p></div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{request.phone_number}</p>
                        <p className="text-xs text-muted-foreground">{new Date(request.requested_at).toLocaleString()}</p>
                      </div>
                      <Badge variant={request.status === "verified" ? "default" : request.status === "rejected" ? "destructive" : "secondary"} className={request.status === "verified" ? "bg-green-600 text-white" : ""}>
                        {request.status === "pending" ? <Clock3 size={13} className="mr-1" /> : request.status === "verified" ? <CheckCircle2 size={13} className="mr-1" /> : <XCircle size={13} className="mr-1" />}
                        {request.status}
                      </Badge>
                    </div>
                    <div className="mt-3 rounded-lg bg-muted p-3 font-mono text-lg tracking-widest">{request.verification_code}</div>
                    {request.admin_notes && <p className="mt-2 text-xs text-muted-foreground">{request.admin_notes}</p>}
                    {request.status === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => void updateRequest(request, "verified")}><CheckCircle2 size={15} /> Verify</Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => void updateRequest(request, "rejected")}><XCircle size={15} /> Reject</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-5 border-blue-500/30 bg-blue-500/5">
          <CardHeader><CardTitle className="text-base">Admin operating guide</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Save and test the official WhatsApp number before inviting users to register.</p>
            <p>2. When a request arrives, open the official WhatsApp Business inbox and match the registered phone number and six-digit code.</p>
            <p>3. Approve only an exact match. Reject mismatches and ask the user to generate a new code.</p>
            <p>4. Never request a password, PIN, full card number, or secret key in WhatsApp.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminWhatsAppVerification;