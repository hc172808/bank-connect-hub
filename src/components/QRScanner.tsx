import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, X } from "lucide-react";

interface QRScannerProps {
  onScanSuccess: (userId: string) => void;
  onClose: () => void;
}

export const QRScanner = ({ onScanSuccess, onClose }: QRScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop();
      }
    };
  }, []);

  const startScanning = async () => {
    if (!scannerRef.current) return;

    try {
      setIsScanning(true);
      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScanSuccess(decodedText);
          stopScanning();
        },
        (errorMessage) => {
          console.log("QR scan error:", errorMessage);
        }
      );
    } catch (err) {
      console.error("Error starting scanner:", err);
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setIsScanning(false);
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Scan QR Code</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={20} />
        </Button>
      </div>
      
      <div id="qr-reader" className="w-full mb-4"></div>
      
      {!isScanning ? (
        <Button onClick={startScanning} className="w-full">
          <Camera size={20} className="mr-2" />
          Start Scanning
        </Button>
      ) : (
        <Button onClick={stopScanning} variant="destructive" className="w-full">
          Stop Scanning
        </Button>
      )}
    </Card>
  );
};
