import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { ArrowLeft, Printer, Clock, CheckCircle2, Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface QRRequest {
  id: string;
  status: "pending" | "fulfilled" | "cancelled";
  notes: string | null;
  created_at: string;
  fulfilled_at: string | null;
}

const MyQRCode = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [existingRequest, setExistingRequest] = useState<QRRequest | null>(null);
  const [reqLoading, setReqLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);

  useEffect(() => {
    if (user) fetchMyRequest();
  }, [user]);

  const fetchMyRequest = async () => {
    setReqLoading(true);
    const { data } = await supabase
      .from("qr_card_requests")
      .select("id, status, notes, created_at, fulfilled_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setExistingRequest(data as QRRequest | null);
    setReqLoading(false);
  };

  const submitRequest = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("qr_card_requests").insert({
      user_id: user.id,
      notes: notes.trim() || null,
      status: "pending",
    });
    if (error) {
      toast({ variant: "destructive", title: "Failed to submit", description: error.message });
    } else {
      toast({ title: "Request sent!", description: "An agent or admin will print your QR card soon." });
      setNotes("");
      setShowRequestForm(false);
      fetchMyRequest();
    }
    setSubmitting(false);
  };

  const cancelRequest = async () => {
    if (!existingRequest) return;
    await supabase.from("qr_card_requests").update({ status: "cancelled" }).eq("id", existingRequest.id);
    fetchMyRequest();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4" data-testid="button-back">
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <QrCode className="w-6 h-6 text-primary" />
          My QR Code
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Others can scan this QR code to send you money, check your balance (with your PIN), or pay you instantly.
        </p>

        <QRCodeDisplay />

        {/* ── Printed card request section ── */}
        <Card className="mt-6 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Printer className="w-4 h-4" />
              Get a Printed QR Card
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reqLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking request status…
              </div>
            ) : existingRequest && existingRequest.status !== "cancelled" ? (
              /* Status display */
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                  {existingRequest.status === "pending" ? (
                    <>
                      <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Your request is pending</p>
                        <p className="text-xs text-muted-foreground">
                          An agent or admin will print your card. Requested {new Date(existingRequest.created_at).toLocaleDateString()}.
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-auto border-yellow-400 text-yellow-600 text-[10px]">
                        Pending
                      </Badge>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Your card has been printed!</p>
                        <p className="text-xs text-muted-foreground">
                          Collect it from your nearest agent.
                          {existingRequest.fulfilled_at && ` Ready since ${new Date(existingRequest.fulfilled_at).toLocaleDateString()}.`}
                        </p>
                      </div>
                      <Badge className="ml-auto bg-green-600 hover:bg-green-600 text-[10px]">
                        Done
                      </Badge>
                    </>
                  )}
                </div>

                {existingRequest.status === "pending" && (
                  <Button variant="ghost" size="sm" onClick={cancelRequest} className="text-destructive hover:text-destructive w-full" data-testid="button-cancel-request">
                    Cancel request
                  </Button>
                )}

                {existingRequest.status === "fulfilled" && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setExistingRequest(null); setShowRequestForm(true); }} data-testid="button-new-request">
                    Request another card
                  </Button>
                )}
              </div>
            ) : showRequestForm ? (
              /* Request form */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Submit a request and an agent or admin will print your personalised QR card for you.
                </p>
                <Textarea
                  placeholder="Optional note — e.g. 'Please deliver to Branch 3' or 'I need it urgently'"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  data-testid="input-request-notes"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowRequestForm(false)} data-testid="button-cancel-form">
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={submitRequest} disabled={submitting} data-testid="button-submit-request">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send request"}
                  </Button>
                </div>
              </div>
            ) : (
              /* No request yet */
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Don't have a physical QR card? Request one and an agent will print it for you.
                </p>
                <Button className="w-full gap-2" onClick={() => setShowRequestForm(true)} data-testid="button-request-card">
                  <Printer className="w-4 h-4" />
                  Request a printed QR card
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MyQRCode;
