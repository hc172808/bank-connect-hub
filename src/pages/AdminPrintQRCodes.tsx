import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Printer, Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  wallet_address: string | null;
  store_name?: string | null;
}

const AdminPrintQRCodes = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const frontQrRef = useRef<HTMLDivElement>(null);
  const backQrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      setFilteredUsers(
        users.filter(
          (u) =>
            u.full_name?.toLowerCase().includes(q) ||
            u.phone_number?.includes(searchTerm) ||
            u.store_name?.toLowerCase().includes(q)
        )
      );
    } else {
      setFilteredUsers(users);
    }
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number, wallet_address, store_name")
      .order("full_name");

    if (data) {
      setUsers(data as UserProfile[]);
      setFilteredUsers(data as UserProfile[]);
    }
    setLoading(false);
  };

  const handlePrint = (user: UserProfile) => {
    setSelectedUser(user);
    setShowPrintDialog(true);
  };

  const formatWallet = (addr: string | null | undefined) => {
    if (!addr) return "Not assigned";
    if (addr.length <= 18) return addr;
    return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
  };

  const doPrint = () => {
    if (!selectedUser || !frontQrRef.current || !backQrRef.current) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    const frontSvg = frontQrRef.current.innerHTML;
    const backSvg = backQrRef.current.innerHTML;
    const fullName = selectedUser.full_name || "Unnamed User";
    const phone = selectedUser.phone_number || "—";
    const wallet = selectedUser.wallet_address || "Not assigned";
    const store = selectedUser.store_name || "";
    const idShort = selectedUser.id.slice(0, 8).toUpperCase();
    const issued = new Date().toLocaleDateString();

    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>QR Card – ${fullName}</title>
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; color: #111; }
  .sheet { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; }
  .card {
    width: 85.6mm; height: 54mm;
    background: #fff;
    border-radius: 3mm;
    box-shadow: 0 2px 6px rgba(0,0,0,.15);
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .card:last-child { page-break-after: auto; }
  /* FRONT */
  .front {
    display: grid;
    grid-template-columns: 28mm 1fr;
    align-items: center;
    padding: 4mm;
    gap: 4mm;
    background: linear-gradient(135deg, #fffbe6 0%, #ffffff 60%);
    border: 1px solid #facc15;
  }
  .qr-box { background: #fff; padding: 1.5mm; border: 1px solid #e5e7eb; border-radius: 2mm; display: flex; align-items: center; justify-content: center; }
  .qr-box svg { width: 25mm; height: 25mm; display: block; }
  .front-info { min-width: 0; }
  .brand-bar { display: flex; align-items: center; gap: 2mm; margin-bottom: 1.5mm; }
  .brand-dot { width: 4mm; height: 4mm; border-radius: 1mm; background: #facc15; }
  .brand-name { font-size: 9pt; font-weight: 700; letter-spacing: .3px; }
  .name { font-size: 12pt; font-weight: 700; line-height: 1.1; margin: 0 0 1mm; word-break: break-word; }
  .phone { font-size: 9pt; color: #374151; margin: 0 0 1mm; }
  .store { font-size: 8pt; color: #6b7280; margin: 0; font-style: italic; }
  .scan-hint { position: absolute; bottom: 2mm; right: 3mm; font-size: 6.5pt; color: #6b7280; }
  /* BACK */
  .back {
    padding: 4mm 5mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: #111827;
    color: #f9fafb;
  }
  .back-header { display: flex; justify-content: space-between; align-items: center; }
  .back-title { font-size: 8pt; font-weight: 700; letter-spacing: 1px; color: #facc15; text-transform: uppercase; }
  .back-id { font-size: 7pt; font-family: "Courier New", monospace; color: #9ca3af; }
  .back-body { display: flex; gap: 4mm; align-items: center; }
  .back-qr { background: #fff; padding: 1mm; border-radius: 1.5mm; }
  .back-qr svg { width: 18mm; height: 18mm; display: block; }
  .back-fields { flex: 1; min-width: 0; font-size: 7.5pt; line-height: 1.35; }
  .field-label { color: #9ca3af; text-transform: uppercase; font-size: 6pt; letter-spacing: .5px; }
  .field-value { color: #f9fafb; word-break: break-all; margin-bottom: 1.2mm; font-family: "Courier New", monospace; }
  .back-footer { font-size: 6pt; color: #9ca3af; text-align: center; border-top: 1px solid #374151; padding-top: 1.5mm; }
  .controls { display: flex; gap: 8px; }
  .controls button { padding: 8px 14px; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .btn-print { background: #facc15; color: #111; }
  .btn-close { background: #e5e7eb; color: #111; }
  @media print {
    body { background: #fff; }
    .controls, .preview-label { display: none !important; }
    .sheet { padding: 0; gap: 0; }
    .card { box-shadow: none; border-radius: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="preview-label" style="font-size:12px;color:#6b7280;">Front (QR for payments)</div>
    <div class="card front">
      <div class="qr-box">${frontSvg}</div>
      <div class="front-info">
        <div class="brand-bar"><div class="brand-dot"></div><div class="brand-name">VIRTUAL BANK</div></div>
        <p class="name">${fullName}</p>
        <p class="phone">${phone}</p>
        ${store ? `<p class="store">${store}</p>` : ""}
      </div>
      <div class="scan-hint">Scan to pay • Issued ${issued}</div>
    </div>

    <div class="preview-label" style="font-size:12px;color:#6b7280;">Back (Account details)</div>
    <div class="card back">
      <div class="back-header">
        <div class="back-title">Account Details</div>
        <div class="back-id">ID: ${idShort}</div>
      </div>
      <div class="back-body">
        <div class="back-qr">${backSvg}</div>
        <div class="back-fields">
          <div class="field-label">Holder</div>
          <div class="field-value" style="font-family:inherit">${fullName}</div>
          <div class="field-label">Mobile</div>
          <div class="field-value">${phone}</div>
          <div class="field-label">Wallet</div>
          <div class="field-value">${wallet}</div>
        </div>
      </div>
      <div class="back-footer">
        If found, please return to the nearest Virtual Bank agent. Issued ${issued}.
      </div>
    </div>

    <div class="controls">
      <button class="btn-print" onclick="window.print()">Print both sides</button>
      <button class="btn-close" onclick="window.close()">Close</button>
    </div>
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function(){ window.focus(); window.print(); }, 300);
    });
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  const getPaymentQR = (user: UserProfile) =>
    JSON.stringify({
      userId: user.id,
      walletAddress: user.wallet_address,
      type: "gyd_payment",
    });

  const getInfoQR = (user: UserProfile) =>
    JSON.stringify({
      userId: user.id,
      walletAddress: user.wallet_address,
      name: user.full_name,
      phone: user.phone_number,
      type: "gyd_account_info",
    });

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
          data-testid="button-back-dashboard"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Dashboard
        </Button>

        <h1 className="text-2xl font-bold mb-6">Print User QR Codes</h1>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Search by name, phone or store..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-users"
              />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="text-center py-8">Loading users...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((user) => (
              <Card key={user.id} className="hover:shadow-lg transition-shadow" data-testid={`card-user-${user.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User size={20} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" data-testid={`text-name-${user.id}`}>{user.full_name || "Unnamed"}</p>
                      <p className="text-sm text-muted-foreground">{user.phone_number || "No phone"}</p>
                    </div>
                  </div>

                  <div className="flex justify-center mb-3">
                    <div className="bg-white p-2 rounded">
                      <QRCodeSVG value={getPaymentQR(user)} size={80} />
                    </div>
                  </div>

                  <Button
                    onClick={() => handlePrint(user)}
                    className="w-full gap-2"
                    variant="outline"
                    data-testid={`button-print-${user.id}`}
                  >
                    <Printer size={16} />
                    Print Card
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && filteredUsers.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No users found matching your search.
          </div>
        )}

        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Print QR Card – {selectedUser?.full_name || "User"}</DialogTitle>
            </DialogHeader>

            {selectedUser && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                {/* Front preview */}
                <div className="rounded-lg border bg-yellow-50 p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">FRONT</p>
                  <div className="flex items-center gap-3">
                    <div ref={frontQrRef} className="bg-white p-2 rounded border">
                      <QRCodeSVG value={getPaymentQR(selectedUser)} size={120} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold tracking-wider text-yellow-700">VIRTUAL BANK</p>
                      <p className="font-bold truncate">{selectedUser.full_name || "Unnamed"}</p>
                      <p className="text-sm text-muted-foreground">{selectedUser.phone_number || "—"}</p>
                      {selectedUser.store_name && (
                        <p className="text-xs italic text-muted-foreground">{selectedUser.store_name}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Back preview */}
                <div className="rounded-lg border bg-gray-900 text-gray-100 p-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold tracking-wider text-yellow-400">ACCOUNT DETAILS</p>
                    <p className="text-[10px] font-mono text-gray-400">ID: {selectedUser.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="flex gap-3 items-center">
                    <div ref={backQrRef} className="bg-white p-1 rounded">
                      <QRCodeSVG value={getInfoQR(selectedUser)} size={90} />
                    </div>
                    <div className="text-xs space-y-1 min-w-0 flex-1">
                      <div>
                        <div className="text-[9px] uppercase text-gray-400">Holder</div>
                        <div className="truncate">{selectedUser.full_name || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-gray-400">Wallet</div>
                        <div className="font-mono text-[10px] break-all">{formatWallet(selectedUser.wallet_address)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center -mt-1">
              Standard credit-card size (85.6 × 54 mm). Print double-sided (flip on long edge).
            </p>

            <Button onClick={doPrint} className="w-full gap-2" data-testid="button-print-card">
              <Printer size={18} />
              Open print preview
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminPrintQRCodes;
