 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { supabase } from "@/integrations/supabase/client";
 import { useToast } from "@/hooks/use-toast";
 
 interface SetPinDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onPinSet: () => void;
 }
 
 export const SetPinDialog = ({ open, onOpenChange, onPinSet }: SetPinDialogProps) => {
   const [pin, setPin] = useState("");
   const [confirmPin, setConfirmPin] = useState("");
   const [loading, setLoading] = useState(false);
   const { toast } = useToast();
 
   const handleSetPin = async () => {
     if (pin.length !== 4) {
       toast({
         variant: "destructive",
         title: "Invalid PIN",
         description: "PIN must be exactly 4 digits",
       });
       return;
     }
 
     if (pin !== confirmPin) {
       toast({
         variant: "destructive",
         title: "PIN Mismatch",
         description: "PINs do not match. Please try again.",
       });
       return;
     }
 
     setLoading(true);
 
     const { data, error } = await supabase.rpc("set_user_pin", {
       user_pin: pin,
     });
 
     setLoading(false);
 
     if (error) {
       toast({
         variant: "destructive",
         title: "Error",
         description: "Failed to set PIN. Please try again.",
       });
       return;
     }
 
     toast({
       title: "PIN Set Successfully",
       description: "Your transaction PIN has been set.",
     });
 
     setPin("");
     setConfirmPin("");
     onPinSet();
     onOpenChange(false);
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent>
         <DialogHeader>
           <DialogTitle>Set Transaction PIN</DialogTitle>
         </DialogHeader>
         <div className="space-y-4 pt-4">
           <p className="text-sm text-muted-foreground">
             Create a 4-digit PIN to secure your transactions
           </p>
 
           <div className="space-y-2">
             <label className="text-sm font-medium">Enter PIN</label>
             <Input
               type="password"
               maxLength={4}
               value={pin}
               onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
               placeholder="••••"
               className="text-center text-2xl tracking-widest"
             />
           </div>
 
           <div className="space-y-2">
             <label className="text-sm font-medium">Confirm PIN</label>
             <Input
               type="password"
               maxLength={4}
               value={confirmPin}
               onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
               placeholder="••••"
               className="text-center text-2xl tracking-widest"
             />
           </div>
 
           <Button
             onClick={handleSetPin}
             disabled={loading || pin.length !== 4 || confirmPin.length !== 4}
             className="w-full"
           >
             {loading ? "Setting PIN..." : "Set PIN"}
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 };