import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck, UserPlus } from "lucide-react";

interface KYC {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string;
  address: string;
  country: string;
  document_type: string;
  document_number: string;
  document_front_url: string | null;
  document_back_url: string | null;
  proof_of_address_url: string | null;
  selfie_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

interface StaffUser {
  id: string;
  fullName: string | null;
  phone: string | null;
  role: string;
}

const AdminKYCReview = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<KYC[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manual, setManual] = useState({
    user_id: "",
    full_name: "",
    date_of_birth: "",
    address: "",
    country: "",
    document_type: "national_id",
    document_number: "",
  });

  useEffect(() => {
    void load();
    void loadStaffUsers();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("kyc_submissions" as never)
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data as KYC[]) || [];
    setItems(list);
    const map: Record<string, string> = {};
    for (const k of list) {
      for (const path of [k.document_front_url, k.document_back_url, k.proof_of_address_url, k.selfie_url]) {
        if (path && !map[path]) {
          const { data: s } = await supabase.storage.from("kyc-documents").createSignedUrl(path, 3600);
          if (s) map[path] = s.signedUrl;
        }
      }
    }
    setSigned(map);
  };

  const loadStaffUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch("/api/auth/all-users", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) return;
    const result = await response.json().catch(() => ({}));
    setStaffUsers((result.users || []).map((item: any) => ({
      id: item.id,
      fullName: item.fullName || null,
      phone: item.phone || null,
      role: item.role || "client",
    })));
  };

  const createManualKyc = async () => {
    if (!manual.user_id || !manual.full_name.trim() || !manual.date_of_birth || !manual.address.trim() || !manual.country.trim() || !manual.document_number.trim()) {
      toast.error("Choose a user and complete the identity details");
      return;
    }
    setManualSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your staff session has expired. Sign in again.");
      const response = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: manual.user_id,
          fullName: manual.full_name,
          dateOfBirth: manual.date_of_birth,
          address: manual.address,
          country: manual.country,
          documentType: manual.document_type,
          documentNumber: manual.document_number,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "KYC could not be added.");
      toast.success("KYC added and verified");
      setManual({
        user_id: "",
        full_name: "",
        date_of_birth: "",
        address: "",
        country: "",
        document_type: "national_id",
        document_number: "",
      });
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setManualSaving(false);
    }
  };

  const review = async (id: string, status: "approved" | "rejected", userId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const updates: Record<string, unknown> = {
      status,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    };
    if (status === "rejected") updates.rejection_reason = reason[id] || "Not specified";
    const { error } = await supabase.from("kyc_submissions" as never).update(updates as never).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("profiles").update({
      kyc_status: status === "approved" ? "verified" : "rejected",
    } as never).eq("id", userId);
    await supabase.rpc("log_audit_event" as never, {
      _action: `kyc_${status}`, _entity_type: "kyc", _entity_id: id,
    } as never);
    toast.success(`KYC ${status}`);
    void load();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> KYC Review</h1>
      </header>

      <div className="p-4 space-y-3">
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-5 w-5" /> Add KYC manually</CardTitle>
            <p className="text-sm text-muted-foreground">Use this for a user whose documents were verified outside the app. This creates an approved KYC record and unlocks KYC-gated transfers.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2"
              value={manual.user_id}
              onChange={(e) => {
                const selected = staffUsers.find((item) => item.id === e.target.value);
                setManual((current) => ({ ...current, user_id: e.target.value, full_name: selected?.fullName || current.full_name }));
              }}
            >
              <option value="">Choose a user</option>
              {staffUsers.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.phone || item.id} · {item.role}</option>)}
            </select>
            <Input placeholder="Full legal name" value={manual.full_name} onChange={(e) => setManual({ ...manual, full_name: e.target.value })} />
            <Input type="date" value={manual.date_of_birth} onChange={(e) => setManual({ ...manual, date_of_birth: e.target.value })} />
            <Input placeholder="Address" value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} />
            <Input placeholder="Country" value={manual.country} onChange={(e) => setManual({ ...manual, country: e.target.value })} />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={manual.document_type} onChange={(e) => setManual({ ...manual, document_type: e.target.value })}>
              <option value="national_id">National ID</option>
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's License</option>
            </select>
            <Input placeholder="Document number" value={manual.document_number} onChange={(e) => setManual({ ...manual, document_number: e.target.value })} />
            <Button onClick={() => void createManualKyc()} disabled={manualSaving} className="gap-2 sm:col-span-2">
              {manualSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {manualSaving ? "Saving…" : "Add and verify KYC"}
            </Button>
          </CardContent>
        </Card>
        {items.map((k) => (
          <Card key={k.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {k.full_name} <Badge variant={k.status === "approved" ? "default" : k.status === "rejected" ? "destructive" : "secondary"}>{k.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><b>DOB:</b> {k.date_of_birth}</p>
              <p><b>Country:</b> {k.country}</p>
              <p><b>Address:</b> {k.address}</p>
              <p><b>Document:</b> {k.document_type} — {k.document_number}</p>
              <div className="flex gap-2 my-2">
                {k.document_front_url && signed[k.document_front_url] && (
                  <a href={signed[k.document_front_url]} target="_blank" rel="noreferrer">
                    <img src={signed[k.document_front_url]} alt="ID front" className="w-24 h-24 object-cover rounded" />
                  </a>
                )}
                {k.document_back_url && signed[k.document_back_url] && (
                  <a href={signed[k.document_back_url]} target="_blank" rel="noreferrer">
                    <img src={signed[k.document_back_url]} alt="ID back" className="w-24 h-24 object-cover rounded" />
                  </a>
                )}
                {k.proof_of_address_url && signed[k.proof_of_address_url] && (
                  <a href={signed[k.proof_of_address_url]} target="_blank" rel="noreferrer">
                    <img src={signed[k.proof_of_address_url]} alt="Proof of address" className="w-24 h-24 object-cover rounded" />
                  </a>
                )}
                {k.selfie_url && signed[k.selfie_url] && (
                  <a href={signed[k.selfie_url]} target="_blank" rel="noreferrer">
                    <img src={signed[k.selfie_url]} alt="Selfie" className="w-24 h-24 object-cover rounded" />
                  </a>
                )}
              </div>
              {k.status === "pending" && (
                <div className="space-y-2">
                  <Input
                    placeholder="Rejection reason (if rejecting)"
                    value={reason[k.id] || ""}
                    onChange={(e) => setReason({ ...reason, [k.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => review(k.id, "approved", k.user_id)}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => review(k.id, "rejected", k.user_id)}>Reject</Button>
                  </div>
                </div>
              )}
              {k.rejection_reason && <p className="text-destructive text-xs">Reason: {k.rejection_reason}</p>}
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-center text-muted-foreground">No submissions.</p>}
      </div>
    </div>
  );
};

export default AdminKYCReview;