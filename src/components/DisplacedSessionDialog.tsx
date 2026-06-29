import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DisplacedSessionDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm text-center" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader className="items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-orange-100">
            <AlertCircle className="text-orange-500" size={30} />
          </div>
          <DialogTitle className="text-lg">Signed Out</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Your account was signed in on another device. For your security,
            this session has been ended.
            <br /><br />
            If this wasn't you, change your password immediately.
          </DialogDescription>
        </DialogHeader>
        <Button className="w-full mt-2" onClick={onClose}>
          Sign In Again
        </Button>
      </DialogContent>
    </Dialog>
  );
}
