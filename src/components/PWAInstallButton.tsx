import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Check, Share } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAInstallButtonProps {
  variant?: "card" | "inline";
  className?: string;
}

export function PWAInstallButton({ variant = "card", className = "" }: PWAInstallButtonProps) {
  const { toast } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    // Detect already-installed (running in standalone mode)
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    // Detect iOS Safari (which doesn't fire beforeinstallprompt)
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iOS);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast({ title: "App installed", description: "Virtual Bank is now on your device." });
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [toast]);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSHelp(true);
      return;
    }
    if (!deferredPrompt) {
      toast({
        title: "Install not available yet",
        description:
          "Use the app a bit more and your browser will offer the install option, or open the browser menu and choose 'Install app'.",
      });
      return;
    }
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) {
    if (variant === "inline") {
      return (
        <div className={`flex items-center gap-2 text-sm text-green-600 ${className}`}>
          <Check className="w-4 h-4" /> Installed on this device
        </div>
      );
    }
    return (
      <div className={`p-4 rounded-xl border border-green-500/30 bg-green-500/10 flex items-center gap-3 ${className}`}>
        <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold">App installed</p>
          <p className="text-xs text-muted-foreground">Virtual Bank is on your home screen for quick access.</p>
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <Button
        onClick={handleInstall}
        variant="outline"
        size="sm"
        className={className}
        data-testid="button-pwa-install"
      >
        <Download className="w-4 h-4 mr-2" />
        Install app
      </Button>
    );
  }

  return (
    <div className={className}>
      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-0.5">Install Virtual Bank</p>
          <p className="text-xs text-muted-foreground mb-3">
            Add the app to your home screen for one-tap access, faster loads, and an app-like experience.
          </p>
          <Button
            onClick={handleInstall}
            size="sm"
            className="w-full sm:w-auto"
            data-testid="button-pwa-install"
          >
            <Download className="w-4 h-4 mr-2" />
            {isIOS ? "Show me how" : "Install app"}
          </Button>
        </div>
      </div>

      {showIOSHelp && isIOS && (
        <div className="mt-3 p-4 rounded-xl border border-primary/30 bg-card">
          <p className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Share className="w-4 h-4 text-primary" />
            Install on iPhone / iPad
          </p>
          <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
            <li>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
            <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> in the top-right.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
