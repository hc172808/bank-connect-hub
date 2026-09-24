import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Camera, FileCheck, RotateCcw, Upload, X } from "lucide-react";

interface KYC {
  id: string;
  status: string;
  rejection_reason: string | null;
  full_name: string;
  created_at: string;
}

interface CameraCaptureProps {
  label: string;
  filePrefix: string;
  facingMode: "user" | "environment";
  allowUpload?: boolean;
  value: File | null;
  onCapture: (file: File | null) => void;
}

const CameraCapture = ({
  label,
  filePrefix,
  facingMode,
  allowUpload = false,
  value,
  onCapture,
}: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!value) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const openCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available in this browser.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setError("Camera permission was denied or the camera is unavailable.");
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("The camera could not capture a photo.");
        return;
      }
      onCapture(new File([blob], `${filePrefix}-${Date.now()}.jpg`, { type: "image/jpeg" }));
      stopCamera();
    }, "image/jpeg", 0.9);
  };

  const chooseUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onCapture(file);
    setError("");
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {value && <span className="text-xs text-muted-foreground">Photo captured</span>}
      </div>
      {active && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`max-h-64 w-full rounded-md bg-black object-contain ${facingMode === "user" ? "-scale-x-100" : ""}`}
          />
          <div className="flex gap-2">
            <Button type="button" onClick={capture} className="flex-1 gap-2">
              <Camera className="h-4 w-4" /> Capture photo
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={stopCamera} aria-label="Close camera">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {!active && (
        <div className={allowUpload ? "grid gap-2 sm:grid-cols-2" : undefined}>
          <Button type="button" variant={value ? "outline" : "secondary"} onClick={() => void openCamera()} className="w-full gap-2">
            {value ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {value ? "Retake with camera" : "Use camera"}
          </Button>
          {allowUpload && (
            <label className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
              <Upload className="h-4 w-4" />
              {value ? "Choose another file" : "Upload image"}
              <Input
                type="file"
                accept="image/*"
                onChange={chooseUpload}
                className="sr-only"
              />
            </label>
          )}
        </div>
      )}
      {value && !active && (
        <img src={previewUrl} alt={`${label} preview`} className="max-h-32 w-full rounded-md object-contain" />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};

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
              <p className="text-sm text-muted-foreground">Selfie must be captured with your front camera. For your ID and proof of address, you can upload an image or capture it with your rear camera.</p>
              <CameraCapture label="ID Card — Front" filePrefix="id-front" facingMode="environment" allowUpload value={frontFile} onCapture={setFrontFile} />
              <CameraCapture label="ID Card — Back" filePrefix="id-back" facingMode="environment" allowUpload value={backFile} onCapture={setBackFile} />
              <CameraCapture label="Proof of Address" filePrefix="proof-of-address" facingMode="environment" allowUpload value={proofOfAddressFile} onCapture={setProofOfAddressFile} />
              <CameraCapture label="Selfie Photo" filePrefix="selfie" facingMode="user" value={selfieFile} onCapture={setSelfieFile} />
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