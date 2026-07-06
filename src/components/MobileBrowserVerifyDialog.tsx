import { useEffect, useState } from "react";
import { Smartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SESSION_KEY = "vbank_mobile_browser_verified";

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768;
}

function isRunningAsStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isNativeApp(): boolean {
  // Capacitor injects window.Capacitor when running inside the native APK/iOS shell.
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; platform?: string };
  };
  if (w.Capacitor) {
    if (typeof w.Capacitor.isNativePlatform === "function") {
      return w.Capacitor.isNativePlatform();
    }
    if (w.Capacitor.platform && w.Capacitor.platform !== "web") return true;
  }
  // Fallback: Capacitor's Android WebView UA contains this token.
  return /VirtualBank|Capacitor/i.test(navigator.userAgent);
}

interface Props {
  isLoggedIn: boolean;
}

export function MobileBrowserVerifyDialog({ isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    // Only show if: user is logged in, on a mobile device, and in browser (not PWA)
    const shouldShow =
      isMobileDevice() &&
      !isRunningAsStandalone() &&
      !isNativeApp() &&
      !sessionStorage.getItem(SESSION_KEY);

    if (shouldShow) {
      // Small delay so the app loads before showing the dialog
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [isLoggedIn]);

  const handleVerify = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) return; }}>
      <DialogContent
        className="max-w-sm text-center"
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader className="items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
            <Smartphone className="text-primary" size={28} />
          </div>
          <DialogTitle className="text-lg">Browser Access Detected</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            You're accessing <strong>NETLIFE CASH</strong> in your mobile browser.
            <br /><br />
            For the best experience and security, please verify that it's you before continuing.
          </DialogDescription>
        </DialogHeader>
        <Button className="w-full mt-2 gap-2" onClick={handleVerify}>
          <ShieldCheck size={16} />
          Verify &amp; Continue
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          Install the app for a faster, more secure experience.
        </p>
      </DialogContent>
    </Dialog>
  );
}
