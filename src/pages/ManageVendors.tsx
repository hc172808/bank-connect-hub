import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Store, Check, X, Eye, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Vendor {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  wallet_address: string | null;
  created_at: string;
  product_count: number;
}

interface VendorProduct {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
  category: string | null;
  is_active: boolean;
  logo_url: string | null;
}

const ManageVendors = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [showProductsDialog, setShowProductsDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      // First get all users with vendor role
      const { data: vendorRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendor");

      if (rolesError) throw rolesError;

      if (!vendorRoles || vendorRoles.length === 0) {
        setVendors([]);
        setLoading(false);
        return;
      }

      const vendorIds = vendorRoles.map(r => r.user_id);

      // Get vendor profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number, wallet_address, created_at")
        .in("id", vendorIds);

      if (profilesError) throw profilesError;

      // Get product counts for each vendor
      const vendorsWithCounts = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { count } = await supabase
            .from("vendor_products")
            .select("*", { count: "exact", head: true })
            .eq("vendor_id", profile.id);

          return {
            ...profile,
            product_count: count || 0,
          };
        })
      );

      setVendors(vendorsWithCounts);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load vendors",
      });
    } finally {
      setLoading(false);
    }
  };

  const viewVendorProducts = async (vendor: Vendor) => {
    setSelectedVendor(vendor);
    
    const { data, error } = await supabase
      .from("vendor_products")
      .select("id, name, price, discount_price, category, is_active, logo_url")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading products", variant: "destructive" });
      return;
    }

    setVendorProducts(data || []);
    setShowProductsDialog(true);
  };

  const revokeVendorAccess = async (vendorId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: "client" })
        .eq("user_id", vendorId);

      if (error) throw error;

      toast({ title: "Vendor access revoked" });
      fetchVendors();
    } catch (error) {
      console.error("Error revoking access:", error);
      toast({ title: "Failed to revoke access", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate("/admin")} variant="secondary" size="icon">
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-2">
            <Store size={24} />
            <h1 className="text-2xl font-bold text-foreground">Manage Vendors</h1>
          </div>
        </div>
      </header>

      <main className="p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Vendors ({vendors.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8">Loading vendors...</p>
            ) : vendors.length === 0 ? (
              <div className="text-center py-8">
                <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No vendors registered yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.full_name || "N/A"}</TableCell>
                        <TableCell>{vendor.phone_number || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            <Package className="w-3 h-3 mr-1" />
                            {vendor.product_count}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(vendor.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => viewVendorProducts(vendor)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Products
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => revokeVendorAccess(vendor.id)}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Revoke
                            </Button>
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

      {/* Products Dialog */}
      <Dialog open={showProductsDialog} onOpenChange={setShowProductsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Products by {selectedVendor?.full_name || "Vendor"}
            </DialogTitle>
          </DialogHeader>
          {vendorProducts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No products yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vendorProducts.map((product) => (
                <Card key={product.id} className={!product.is_active ? "opacity-60" : ""}>
                  <CardContent className="pt-4">
                    {product.logo_url && (
                      <img
                        src={product.logo_url}
                        alt={product.name}
                        className="w-full h-24 object-cover rounded mb-2"
                      />
                    )}
                    <h4 className="font-semibold">{product.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold">${product.price.toFixed(2)}</span>
                      {product.discount_price && (
                        <span className="text-sm text-green-600">
                          ${product.discount_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {product.category && (
                      <Badge variant="outline" className="mt-2">{product.category}</Badge>
                    )}
                    <Badge variant={product.is_active ? "default" : "secondary"} className="ml-2 mt-2">
                      {product.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageVendors;