import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const QRCodeDisplay = () => {
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  if (!userId) return null;

  return (
    <Card className="p-6 flex flex-col items-center gap-4">
      <h3 className="text-lg font-semibold">Your Payment QR Code</h3>
      <div className="bg-white p-4 rounded-lg">
        <QRCodeSVG value={userId} size={200} />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Share this QR code to receive payments
      </p>
    </Card>
  );
};
