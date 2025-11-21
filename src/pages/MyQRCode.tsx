import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { ArrowLeft } from "lucide-react";

const MyQRCode = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">My QR Code</h1>

        <QRCodeDisplay />

        <p className="text-sm text-muted-foreground text-center mt-6">
          Others can scan this QR code to send you money instantly.
          Your QR code is unique to your account.
        </p>
      </div>
    </div>
  );
};

export default MyQRCode;
