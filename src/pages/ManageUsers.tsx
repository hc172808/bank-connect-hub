import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Copy, ExternalLink, Ban, CheckCircle2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface User {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  wallet_address: string | null;
  role: string;
  disabled?: boolean;
}

interface BlockchainSettings {
  explorer_url: string | null;
  is_active: boolean;
}

const ManageUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockchainSettings, setBlockchainSettings] = useState<BlockchainSettings | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
    fetchBlockchainSettings();
  }, []);

  const fetchBlockchainSettings = async () => {
    const { data } = await supabase
      .from("blockchain_settings")
      .select("explorer_url, is_active")
      .single();
    
    if (data) {
      setBlockchainSettings(data);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, wallet_address, disabled");

      if (error) {
        console.error("Error fetching profiles:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load users. Make sure you have admin access.",
        });
        setLoading(false);
        return;
      }

      if (profiles) {
        const usersWithRoles = await Promise.all(
          profiles.map(async (profile) => {
            const { data: roleData } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", profile.id)
              .single();

            return {
              ...profile,
              role: roleData?.role || "client"
            };
          })
        );
        setUsers(usersWithRoles);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: "admin" | "agent" | "client" | "vendor") => {
    try {
      // Check if user has a role entry
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existingRole) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole });
        if (error) throw error;
      }

      toast({ title: "Role updated successfully" });
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    toast({ title: "Address copied to clipboard" });
  };

  const openExplorer = (address: string) => {
    if (blockchainSettings?.explorer_url) {
      window.open(`${blockchainSettings.explorer_url}/address/${address}`, '_blank');
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const toggleDisabled = async (user: User) => {
    const next = !user.disabled;
    const { error } = await supabase
      .from("profiles")
      .update({ disabled: next, disabled_at: next ? new Date().toISOString() : null })
      .eq("id", user.id);
    if (error) {
      toast({ title: "Failed to update user", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "User disabled" : "User re-enabled" });
    fetchUsers();
  };

  const deleteUser = async (user: User) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: user.id },
    });
    if (error || (data as any)?.error) {
      toast({
        title: "Failed to delete user",
        description: (data as any)?.error || error?.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "User deleted" });
    fetchUsers();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate("/admin")} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Manage Users</h1>
        </div>
      </header>

      <main className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Users ({users.length})</span>
              {blockchainSettings?.is_active && (
                <Badge variant="secondary">Blockchain Active</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading users...</p>
            ) : users.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Wallet Address</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name || "N/A"}</TableCell>
                        <TableCell>{user.phone_number || "N/A"}</TableCell>
                        <TableCell>
                          {user.wallet_address ? (
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {truncateAddress(user.wallet_address)}
                              </code>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => copyAddress(user.wallet_address!)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                              {blockchainSettings?.explorer_url && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => openExplorer(user.wallet_address!)}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No wallet</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            user.role === 'admin' ? 'default' : 
                            user.role === 'agent' ? 'secondary' : 
                            user.role === 'vendor' ? 'destructive' : 'outline'
                          }>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.disabled ? (
                            <Badge variant="destructive">Disabled</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select
                              value={user.role}
                              onValueChange={(value) => updateUserRole(user.id, value as "admin" | "agent" | "client" | "vendor")}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="client">Client</SelectItem>
                                <SelectItem value="vendor">Vendor</SelectItem>
                                <SelectItem value="agent">Agent</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleDisabled(user)}
                              title={user.disabled ? "Re-enable user" : "Disable user"}
                            >
                              {user.disabled ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Ban className="w-4 h-4 text-amber-600" />}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" title="Delete user">
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This permanently removes {user.full_name || user.phone_number || "the user"} and their auth account. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteUser(user)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ManageUsers;
