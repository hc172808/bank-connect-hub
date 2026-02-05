 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { supabase } from "@/integrations/supabase/client";
 import { useToast } from "@/hooks/use-toast";
 
 interface PinInputProps {
   userId: string;
   onVerified: () => void;
   onCancel: () => void;
 }
 
 export const PinInput = ({ userId, onVerified, onCancel }: PinInputProps) => {
   const [pin, setPin] = useState("");
   const [loading, setLoading] = useState(false);
   const { toast } = useToast();
 
   const handleVerify = async () => {
     if (pin.length !== 4) {
       toast({
         variant: "destructive",
         title: "Invalid PIN",
         description: "PIN must be 4 digits",
       });
       return;
     }
 
     setLoading(true);
 
     const { data, error } = await supabase.rpc("verify_pin", {
       user_id: userId,
       pin: pin,
     });
 
     setLoading(false);
 
     if (error) {
       toast({
         variant: "destructive",
         title: "Error",
         description: "Failed to verify PIN",
       });
       return;
     }
 
     if (data) {
       onVerified();
     } else {
       toast({
         variant: "destructive",
         title: "Incorrect PIN",
         description: "Please try again",
       });
       setPin("");
     }
   };
 
   return (
     <div className="space-y-4">
       <div className="text-center">
         <h3 className="text-lg font-semibold mb-2">Enter Your PIN</h3>
         <p className="text-sm text-muted-foreground">
           Enter your 4-digit PIN to continue
         </p>
       </div>
 
       <Input
         type="password"
         maxLength={4}
         value={pin}
         onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
         placeholder="••••"
         className="text-center text-2xl tracking-widest"
         autoFocus
       />
 
       <div className="flex gap-2">
         <Button variant="outline" onClick={onCancel} className="flex-1">
           Cancel
         </Button>
         <Button onClick={handleVerify} disabled={loading || pin.length !== 4} className="flex-1">
           {loading ? "Verifying..." : "Verify"}
         </Button>
       </div>
     </div>
   );
 };