import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initSupabase } from "@/integrations/supabase/client";
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
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    date_of_birth: "",
    address: "",
    country: "",
    document_type: "passport",
    document_number: "",
  });
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [proofOfAddressFile, setProofOfAddressFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    try {
      await initSupabase();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;
      const { data, error } = await supabase
        .from("kyc_submissions" as never)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setExisting(data as KYC | null);
      setLoadError("");
    } catch (error) {
      setLoadError(friendlyKycError(error));
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file: File, userId: string, prefix: string) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${prefix}-${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("kyc-documents").upload(path, file);
    if (error) throw error;
    return path;
  };

  const friendlyKycError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    const normalized = message.toLowerCase();
    if (normalized.includes("bucket") || normalized.includes("storage")) {
      return "KYC document storage is not configured in Supabase yet. Ask the administrator to apply the KYC storage migration.";
    }
    if (
      normalized.includes("proof_of_address_url") ||
      normalized.includes("schema cache") ||
      normalized.includes("relation") ||
      normalized.includes("kyc_submissions")
    ) {
      return "The KYC database migration is not applied to this Supabase project yet. Ask the administrator to apply the migrations, then try again.";
    }
    if (normalized.includes("row-level security") || normalized.includes("permission denied")) {
      return "Supabase blocked this KYC request with a security policy. Ask the administrator to apply the latest KYC RLS policies.";
    }
    return message;
  };

  const submit = async () => {
    if (!frontFile || !backFile || !proofOfAddressFile || !selfieFile) {
      toast.error("Upload ID front, ID back, proof of address, and a selfie");
      return;
    }
    if (!form.full_name.trim() || !form.date_of_birth || !form.address.trim() || !form.country.trim() || !form.document_number.trim()) {
      toast.error("Complete all identity details before uploading documents");
      return;
    }
    const files = [frontFile, backFile, proofOfAddressFile, selfieFile];
    const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      toast.error("Each uploaded file must be 10 MB or smaller");
      return;
    }
    setSubmitting(true);
    const uploadedPaths: string[] = [];
    let submissionCreated = false;
    try {
      await initSupabase();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Your session has expired. Sign in again and retry.");

      const doc = await uploadFile(frontFile, user.id, "id-front");
      uploadedPaths.push(doc);
      const docBack = await uploadFile(backFile, user.id, "id-back");
      uploadedPaths.push(docBack);
      const proofOfAddress = await uploadFile(proofOfAddressFile, user.id, "proof-of-address");
      uploadedPaths.push(proofOfAddress);
      const selfie = await uploadFile(selfieFile, user.id, "selfie");
      uploadedPaths.push(selfie);

      const { error } = await supabase.from("kyc_submissions" as never).insert({
        user_id: user.id,
        ...form,
        document_front_url: doc,
        document_back_url: docBack,
        proof_of_address_url: proofOfAddress,
        selfie_url: selfie,
      } as never);
      if (error) throw error;
      submissionCreated = true;
      const { error: profileError } = await supabase.from("profiles").update({ kyc_status: "pending" } as never).eq("id", user.id);
      if (profileError) throw profileError;
      await supabase.rpc("log_audit_event" as never, {
        _action: "submit_kyc", _entity_type: "user", _entity_id: user.id,
      } as never);
      // N-07: notify user of KYC submission
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "📋 KYC Submission Received",
        message: "Your identity verification documents have been submitted. Our team will review within 1–3 business days.",
        type: "kyc_update",
      } as never);
      toast.success("KYC submitted for review");
      void load();
    } catch (e) {
      if (!submissionCreated && uploadedPaths.length) {
        await supabase.storage.from("kyc-documents").remove(uploadedPaths);
      }
      toast.error(friendlyKycError(e));
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
        {loadError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{loadError}</p>
            </CardContent>
          </Card>
        )}
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
              <div><Label>ID Card — Front</Label><Input type="file" accept="image/*,.pdf" onChange={(e) => setFrontFile(e.target.files?.[0] || null)} /></div>
              <div><Label>ID Card — Back</Label><Input type="file" accept="image/*,.pdf" onChange={(e) => setBackFile(e.target.files?.[0] || null)} /></div>
              <div><Label>Proof of Address</Label><Input type="file" accept="image/*,.pdf" onChange={(e) => setProofOfAddressFile(e.target.files?.[0] || null)} /></div>
              <div><Label>Selfie Photo</Label><Input type="file" accept="image/*" onChange={(e) => setSelfieFile(e.target.files?.[0] || null)} /></div>
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