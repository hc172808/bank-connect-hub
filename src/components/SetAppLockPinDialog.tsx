import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { isValidAppLockPin } from "@/lib/appLockPin";

interface SetAppLockPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPinSet: () => void;
}

export function SetAppLockPinDialog({
  open,
  onOpenChange,
  onPinSet,
}: SetAppLockPinDialogProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => {
    setPin("");
    setConfirmPin("");
    onOpenChange(false);
  };

  const handleSetPin = async () => {
    if (!isValidAppLockPin(pin)) {
      toast.error("Use 4–10 letters, numbers, or symbols. Spaces are not allowed.");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("The passcodes do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc(
        "set_app_lock_pin" as never,
        { user_pin: pin } as never,
      );
      if (error) throw error;

      toast.success("App Lock passcode saved.");
      onPinSet();
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the App Lock passcode.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPin("");
          setConfirmPin("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create App Lock passcode</DialogTitle>
          <DialogDescription>
            Use 4–10 characters. Letters, numbers, and symbols are allowed; spaces are not.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="app-lock-pin">Passcode</Label>
            <Input
              id="app-lock-pin"
              type="password"
              inputMode="text"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="4–10 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-lock-pin-confirm">Confirm passcode</Label>
            <Input
              id="app-lock-pin-confirm"
              type="password"
              inputMode="text"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={10}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSetPin()}
              placeholder="Re-enter passcode"
            />
          </div>
          <Button
            className="w-full"
            onClick={() => void handleSetPin()}
            disabled={loading || !isValidAppLockPin(pin) || pin !== confirmPin}
          >
            {loading ? "Saving…" : "Save passcode"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
