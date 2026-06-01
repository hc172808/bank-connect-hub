import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck } from "lucide-react";

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
  selfie_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

const AdminKYCReview = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<KYC[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
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
      for (const path of [k.document_front_url, k.selfie_url]) {
        if (path && !map[path]) {
          const { data: s } = await supabase.storage.from("kyc-documents").createSignedUrl(path, 3600);
          if (s) map[path] = s.signedUrl;
        }
      }
    }
    setSigned(map);
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
                    <img src={signed[k.document_front_url]} alt="doc" className="w-24 h-24 object-cover rounded" />
                  </a>
                )}
                {k.selfie_url && signed[k.selfie_url] && (
                  <a href={signed[k.selfie_url]} target="_blank" rel="noreferrer">
                    <img src={signed[k.selfie_url]} alt="selfie" className="w-24 h-24 object-cover rounded" />
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