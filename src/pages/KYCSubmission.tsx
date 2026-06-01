import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, FileCheck } from "lucide-react";

interface KYC {
  id: string;
  status: string;
  rejection_reason: string | null;
  full_name: string;
  created_at: string;
}

const KYCSubmission = () => {
  const navigate = useNavigate();
  const [existing, setExisting] = useState<KYC | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    date_of_birth: "",
    address: "",
    country: "",
    document_type: "passport",
    document_number: "",
  });
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("kyc_submissions" as never)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setExisting(data as KYC | null);
    setLoading(false);
  };

  const uploadFile = async (file: File, userId: string, prefix: string) => {
    const path = `${userId}/${prefix}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("kyc-documents").upload(path, file);
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    if (!frontFile || !selfieFile) {
      toast.error("Please upload document and selfie");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const doc = await uploadFile(frontFile, user.id, "doc");
      const selfie = await uploadFile(selfieFile, user.id, "selfie");
      const { error } = await supabase.from("kyc_submissions" as never).insert({
        user_id: user.id,
        ...form,
        document_front_url: doc,
        selfie_url: selfie,
      } as never);
      if (error) throw error;
      await supabase.from("profiles").update({ kyc_status: "pending" } as never).eq("id", user.id);
      await supabase.rpc("log_audit_event" as never, {
        _action: "submit_kyc", _entity_type: "user", _entity_id: user.id,
      } as never);
      toast.success("KYC submitted for review");
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) =>
    s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><FileCheck className="h-5 w-5" /> Identity Verification</h1>
      </header>

      <div className="p-4 space-y-4">
        {loading && <p>Loading...</p>}
        {existing && existing.status !== "rejected" && (
          <Card>
            <CardHeader>
              <CardTitle>Your Submission</CardTitle>
              <CardDescription>Submitted {new Date(existing.created_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={statusColor(existing.status)}>{existing.status.toUpperCase()}</Badge>
              {existing.status === "pending" && (
                <p className="text-sm text-muted-foreground mt-2">Your documents are being reviewed.</p>
              )}
              {existing.status === "approved" && (
                <p className="text-sm text-muted-foreground mt-2">Your identity has been verified!</p>
              )}
            </CardContent>
          </Card>
        )}

        {(!existing || existing.status === "rejected") && !loading && (
          <Card>
            <CardHeader>
              <CardTitle>Submit KYC</CardTitle>
              {existing?.rejection_reason && (
                <CardDescription className="text-destructive">
                  Previous rejected: {existing.rejection_reason}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div>
                <Label>Document Type</Label>
                <select
                  className="w-full border rounded p-2 bg-background"
                  value={form.document_type}
                  onChange={(e) => setForm({ ...form, document_type: e.target.value })}
                >
                  <option value="passport">Passport</option>
                  <option value="national_id">National ID</option>
                  <option value="drivers_license">Driver's License</option>
                </select>
              </div>
              <div><Label>Document Number</Label><Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} /></div>
              <div><Label>Document Photo</Label><Input type="file" accept="image/*" onChange={(e) => setFrontFile(e.target.files?.[0] || null)} /></div>
              <div><Label>Selfie</Label><Input type="file" accept="image/*" onChange={(e) => setSelfieFile(e.target.files?.[0] || null)} /></div>
              <Button onClick={submit} disabled={submitting} className="w-full">
                {submitting ? "Submitting..." : "Submit for Review"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default KYCSubmission;