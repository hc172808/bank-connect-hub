import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Store, Search, Package, User } from "lucide-react";

interface Vendor {
  id: string;
  full_name: string | null;
  store_name: string | null;
  avatar_url: string | null;
  product_count: number;
}

const VendorList = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      // Get all vendor user IDs
      const { data: vendorRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendor");

      if (!vendorRoles || vendorRoles.length === 0) {
        setVendors([]);
        setLoading(false);
        return;
      }

      const vendorIds = vendorRoles.map((r) => r.user_id);

      // Get vendor profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, store_name, avatar_url")
        .in("id", vendorIds);

      // Get product counts for each vendor
      const { data: products } = await supabase
        .from("vendor_products")
        .select("vendor_id")
        .in("vendor_id", vendorIds)
        .eq("is_active", true);

      const productCounts: Record<string, number> = {};
      products?.forEach((p) => {
        productCounts[p.vendor_id] = (productCounts[p.vendor_id] || 0) + 1;
      });

      const vendorList: Vendor[] = (profiles || []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        store_name: p.store_name,
        avatar_url: p.avatar_url,
        product_count: productCounts[p.id] || 0,
      }));

      setVendors(vendorList);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredVendors = vendors.filter(
    (v) =>
      (v.store_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
            <Store size={28} />
            Browse Vendors
          </h1>
          <p className="text-muted-foreground">
            Find vendors and explore their stores
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={20} />
          <Input
            placeholder="Search vendors by name or store..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Vendors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVendors.map((vendor) => (
            <Card
              key={vendor.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/vendor-store?vendor=${vendor.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  {vendor.avatar_url ? (
                    <img
                      src={vendor.avatar_url}
                      alt={vendor.store_name || vendor.full_name || "Vendor"}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User size={24} className="text-primary" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-lg">
                      {vendor.store_name || vendor.full_name || "Unnamed Store"}
                    </CardTitle>
                    {vendor.store_name && vendor.full_name && (
                      <p className="text-sm text-muted-foreground">by {vendor.full_name}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Package size={16} />
                  <span>{vendor.product_count} products</span>
                </div>
                <Button className="w-full mt-3" variant="outline">
                  Visit Store
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredVendors.length === 0 && !loading && (
          <Card className="p-8 text-center">
            <Store size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Vendors Found</h3>
            <p className="text-muted-foreground">
              {searchTerm ? "Try a different search term." : "No vendors have registered yet."}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VendorList;