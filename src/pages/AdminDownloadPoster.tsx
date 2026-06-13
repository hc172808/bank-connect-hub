import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Printer, Download, Share, QrCode, Smartphone,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TAGLINES = [
  "Scan to install the app",
  "Your digital wallet — always in your pocket",
  "Fast · Secure · Always available",
  "Send money instantly, anywhere",
];

export default function AdminDownloadPoster() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const appUrl = `${window.location.origin}/download-app`;

  const [tagline, setTagline] = useState(TAGLINES[0]);
  const [customTagline, setCustomTagline] = useState("");
  const [qrSize, setQrSize] = useState<"sm" | "md" | "lg">("md");
  const [copied, setCopied] = useState(false);

  const displayTagline = customTagline.trim() || tagline;
  const qrPx = qrSize === "sm" ? 140 : qrSize === "md" ? 180 : 220;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) { toast({ title: "Canvas not ready", variant: "destructive" }); return; }
    const link = document.createElement("a");
    link.download = "netlifecash-qr-poster.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast({ title: "Poster saved!", description: "netlifecash-qr-poster.png downloaded." });
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Download NETLIFE CASH",
          text: displayTagline,
          url: appUrl,
        });
      } else {
        await navigator.clipboard.writeText(appUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({ title: "Link copied!", description: appUrl });
      }
    } catch { /* user dismissed */ }
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-lg leading-tight">Download QR Poster</h1>
          <p className="text-xs text-muted-foreground">Print or share a branded install poster</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleShare}>
          <Share className="h-4 w-4 mr-1.5" /> {copied ? "Copied!" : "Share Link"}
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-6 space-y-5">
        {/* Options */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Tagline</Label>
              <Select value={tagline} onValueChange={setTagline}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAGLINES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Custom tagline <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={customTagline}
                onChange={(e) => setCustomTagline(e.target.value)}
                placeholder="e.g. Download now and get started"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label>QR code size</Label>
              <div className="flex gap-2">
                {(["sm", "md", "lg"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={qrSize === s ? "default" : "outline"}
                    onClick={() => setQrSize(s)}
                    className="capitalize"
                  >
                    {s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Poster Preview */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5" /> Poster preview
          </p>
          <div ref={posterRef} className="poster-area">
            <Card className="overflow-hidden border-2 border-primary/20 shadow-lg">
              <CardContent className="p-0">
                {/* Top band */}
                <div className="bg-[#0B1B3F] px-6 py-5 text-white flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">NETLIFE CASH</h2>
                    <p className="text-xs text-blue-200 mt-0.5">Digital Wallet &amp; Payments</p>
                  </div>
                  <Badge className="ml-auto bg-green-500 text-white border-0 text-xs">Free</Badge>
                </div>

                {/* QR + instructions */}
                <div className="bg-white px-6 py-6 flex flex-col sm:flex-row items-center gap-6">
                  <div className="flex-shrink-0 p-3 rounded-2xl border-2 border-[#0B1B3F]/10 shadow-sm">
                    <QRCodeSVG
                      value={appUrl}
                      size={qrPx}
                      level="H"
                      includeMargin={false}
                      fgColor="#0B1B3F"
                    />
                  </div>
                  <div className="flex-1 space-y-3 text-center sm:text-left">
                    <p className="text-2xl font-bold text-[#0B1B3F] leading-tight">{displayTagline}</p>
                    <div className="space-y-1.5 text-sm text-gray-600">
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <span className="w-5 h-5 rounded-full bg-[#0B1B3F] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                        Open your phone camera
                      </div>
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <span className="w-5 h-5 rounded-full bg-[#0B1B3F] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                        Point at the QR code
                      </div>
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <span className="w-5 h-5 rounded-full bg-[#0B1B3F] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                        Tap the link to install
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 break-all font-mono bg-gray-50 rounded px-2 py-1">{appUrl}</p>
                  </div>
                </div>

                {/* Bottom band */}
                <div className="bg-[#0B1B3F]/5 px-6 py-3 flex items-center justify-between">
                  <p className="text-xs text-gray-500">Works on Android &amp; iOS · No app store required</p>
                  <div className="flex gap-1.5">
                    <Badge variant="outline" className="text-[10px]">Android APK</Badge>
                    <Badge variant="outline" className="text-[10px]">PWA</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Hidden canvas used for PNG export */}
        <div className="hidden">
          <QRCodeCanvas
            ref={canvasRef}
            value={appUrl}
            size={512}
            level="H"
            includeMargin
            fgColor="#0B1B3F"
          />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="outline" onClick={handlePrint} className="w-full">
            <Printer className="h-4 w-4 mr-2" /> Print Poster
          </Button>
          <Button size="lg" onClick={handleDownload} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Download PNG
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Tip: Print at A4 / Letter size and place near your service counter for walk-in customers.
        </p>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(.poster-area) { display: none !important; }
          .poster-area { display: block !important; }
          header, nav, footer, button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
