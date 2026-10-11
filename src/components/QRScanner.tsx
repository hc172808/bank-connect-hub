import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Loader2, X } from "lucide-react";

interface QRScannerProps {
  onScanSuccess: (userId: string) => void;
  onClose?: () => void;
}

export const QRScanner = ({ onScanSuccess, onClose }: QRScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(false);
  const scanHandledRef = useRef(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      scannerRef.current = null;
      if (scanner.isScanning) void scanner.stop().catch(() => undefined);
    };
  }, []);

  const cameraErrorMessage = (error: unknown) => {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name || "")
        : "";
    const message = error instanceof Error ? error.message : String(error || "");
    const details = `${name} ${message}`.toLowerCase();

    if (/notallowed|permission|denied/.test(details)) {
      return "Camera access was denied. Allow camera permission in your browser or Android app settings, then try again.";
    }
    if (/notfound|no camera|device not found|overconstrained/.test(details)) {
      return "No compatible camera was found. Enable or connect a camera, then try again.";
    }
    if (/notreadable|in use|busy|track start/.test(details)) {
      return "The camera is being used by another app. Close that app and try again.";
    }
    if (/secure|https|insecure|origin/.test(details)) {
      return "Camera access requires a secure connection. Open the app over HTTPS or use the installed app.";
    }
    return "Could not start the camera. Check camera permission and try again.";
  };

  const startScanning = async () => {
    const scanner = scannerRef.current;
    if (!scanner || isStarting || scanner.isScanning) return;

    setCameraError(null);
    setIsStarting(true);
    scanHandledRef.current = false;
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras.length === 0) throw new Error("No camera was found.");
      const camera =
        cameras.find(({ label }) => /back|rear|environment/i.test(label)) || cameras[0];

      await scanner.start(
        camera.id,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          if (scanHandledRef.current) return;
          scanHandledRef.current = true;
          await stopScanning();
          if (mountedRef.current) onScanSuccess(decodedText);
        },
        () => undefined
      );
      if (!mountedRef.current) {
        if (scanner.isScanning) await scanner.stop().catch(() => undefined);
        return;
      }
      setIsScanning(true);
    } catch (err) {
      console.error("Error starting scanner:", err);
      if (mountedRef.current) {
        setIsScanning(false);
        setCameraError(cameraErrorMessage(err));
      }
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  };

  const stopScanning = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch (error) {
      if (mountedRef.current) setCameraError(cameraErrorMessage(error));
    } finally {
      if (mountedRef.current) setIsScanning(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Scan QR Code</h3>
        {onClose && (
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close scanner">
            <X size={20} />
          </Button>
        )}
      </div>
      
      <div id="qr-reader" className="w-full mb-4"></div>

      {cameraError && (
        <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {cameraError}
        </p>
      )}
      
      {!isScanning ? (
        <Button type="button" onClick={() => void startScanning()} className="w-full" disabled={isStarting}>
          {isStarting ? (
            <>
              <Loader2 size={20} className="mr-2 animate-spin" />
              Starting camera…
            </>
          ) : (
            <>
              <Camera size={20} className="mr-2" />
              Start Scanning
            </>
          )}
        </Button>
      ) : (
        <Button type="button" onClick={() => void stopScanning()} variant="destructive" className="w-full">
          Stop Scanning
        </Button>
      )}
    </Card>
  );
};
