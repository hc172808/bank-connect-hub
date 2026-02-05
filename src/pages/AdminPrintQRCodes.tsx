 import { useState, useEffect, useRef } from "react";
 import { useNavigate } from "react-router-dom";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Input } from "@/components/ui/input";
 import { ArrowLeft, Printer, Search, User } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { QRCodeSVG } from "qrcode.react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 
 interface UserProfile {
   id: string;
   full_name: string | null;
   phone_number: string | null;
   wallet_address: string | null;
 }
 
 const AdminPrintQRCodes = () => {
   const navigate = useNavigate();
   const [users, setUsers] = useState<UserProfile[]>([]);
   const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
   const [searchTerm, setSearchTerm] = useState("");
   const [loading, setLoading] = useState(true);
   const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
   const [showPrintDialog, setShowPrintDialog] = useState(false);
   const printRef = useRef<HTMLDivElement>(null);
 
   useEffect(() => {
     fetchUsers();
   }, []);
 
   useEffect(() => {
     if (searchTerm) {
       const filtered = users.filter(
         u =>
           u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           u.phone_number?.includes(searchTerm)
       );
       setFilteredUsers(filtered);
     } else {
       setFilteredUsers(users);
     }
   }, [searchTerm, users]);
 
   const fetchUsers = async () => {
     const { data } = await supabase
       .from("profiles")
       .select("id, full_name, phone_number, wallet_address")
       .order("full_name");
 
     if (data) {
       setUsers(data);
       setFilteredUsers(data);
     }
     setLoading(false);
   };
 
   const handlePrint = (user: UserProfile) => {
     setSelectedUser(user);
     setShowPrintDialog(true);
   };
 
   const doPrint = () => {
     if (printRef.current) {
       const printWindow = window.open("", "_blank");
       if (printWindow) {
         printWindow.document.write(`
           <html>
             <head>
               <title>QR Code - ${selectedUser?.full_name || "User"}</title>
               <style>
                 body { 
                   font-family: Arial, sans-serif; 
                   display: flex; 
                   flex-direction: column; 
                   align-items: center; 
                   justify-content: center; 
                   min-height: 100vh;
                   margin: 0;
                   padding: 20px;
                 }
                 .qr-container {
                   text-align: center;
                   padding: 30px;
                   border: 2px solid #000;
                   border-radius: 10px;
                 }
                 h2 { margin-bottom: 20px; }
                 .user-info { margin-top: 15px; font-size: 14px; color: #666; }
                 .instructions { margin-top: 20px; font-size: 12px; color: #888; }
               </style>
             </head>
             <body>
               <div class="qr-container">
                 <h2>GYD Payment QR Code</h2>
                 ${printRef.current.innerHTML}
                 <div class="user-info">
                   <strong>${selectedUser?.full_name || "User"}</strong><br/>
                   ${selectedUser?.phone_number || ""}
                 </div>
                 <div class="instructions">
                   Scan this code to pay, check balance, or request funds
                 </div>
               </div>
             </body>
           </html>
         `);
         printWindow.document.close();
         printWindow.print();
       }
     }
   };
 
   const getQRData = (user: UserProfile) => {
     return JSON.stringify({
       userId: user.id,
       walletAddress: user.wallet_address,
       type: "gyd_payment"
     });
   };
 
   return (
     <div className="min-h-screen bg-background p-4">
       <div className="max-w-4xl mx-auto">
         <Button
           variant="ghost"
           onClick={() => navigate("/admin")}
           className="mb-4"
         >
           <ArrowLeft size={20} className="mr-2" />
           Back to Dashboard
         </Button>
 
         <h1 className="text-2xl font-bold mb-6">Print User QR Codes</h1>
 
         <Card className="mb-6">
           <CardContent className="pt-6">
             <div className="relative">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={18} />
               <Input
                 placeholder="Search by name or phone number..."
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
                 className="pl-10"
               />
             </div>
           </CardContent>
         </Card>
 
         {loading ? (
           <div className="text-center py-8">Loading users...</div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {filteredUsers.map((user) => (
               <Card key={user.id} className="hover:shadow-lg transition-shadow">
                 <CardContent className="p-4">
                   <div className="flex items-center gap-3 mb-3">
                     <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                       <User size={20} className="text-primary" />
                     </div>
                     <div className="flex-1 min-w-0">
                       <p className="font-medium truncate">{user.full_name || "Unnamed"}</p>
                       <p className="text-sm text-muted-foreground">{user.phone_number || "No phone"}</p>
                     </div>
                   </div>
 
                   <div className="flex justify-center mb-3">
                     <div className="bg-white p-2 rounded">
                       <QRCodeSVG value={getQRData(user)} size={80} />
                     </div>
                   </div>
 
                   <Button
                     onClick={() => handlePrint(user)}
                     className="w-full gap-2"
                     variant="outline"
                   >
                     <Printer size={16} />
                     Print QR Code
                   </Button>
                 </CardContent>
               </Card>
             ))}
           </div>
         )}
 
         {!loading && filteredUsers.length === 0 && (
           <div className="text-center py-8 text-muted-foreground">
             No users found matching your search.
           </div>
         )}
 
         <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>Print QR Code for {selectedUser?.full_name}</DialogTitle>
             </DialogHeader>
             <div className="flex flex-col items-center gap-4 py-4">
               <div ref={printRef} className="bg-white p-4 rounded-lg">
                 {selectedUser && (
                   <QRCodeSVG value={getQRData(selectedUser)} size={200} />
                 )}
               </div>
               <p className="text-sm text-muted-foreground text-center">
                 {selectedUser?.phone_number}
               </p>
               <Button onClick={doPrint} className="w-full gap-2">
                 <Printer size={18} />
                 Print
               </Button>
             </div>
           </DialogContent>
         </Dialog>
       </div>
     </div>
   );
 };
 
 export default AdminPrintQRCodes;