import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Store,
  Plus,
  Package,
  DollarSign,
  Percent,
  Image,
  LogOut,
  Edit2,
  Trash2,
  User,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

interface Product {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  price: number;
  discount_price: number | null;
  category: string | null;
  is_active: boolean;
}

interface ProfileData {
  full_name: string;
  store_name: string | null;
}

const VendorDashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showStoreDialog, setShowStoreDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDiscountPrice, setProductDiscountPrice] = useState("");
  const [productLogoUrl, setProductLogoUrl] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productActive, setProductActive] = useState(true);
  const [storeName, setStoreName] = useState("");

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [productsRes, profileRes] = await Promise.all([
      supabase.from("vendor_products").select("*").eq("vendor_id", user.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("full_name, store_name").eq("id", user.id).single(),
    ]);

    if (productsRes.data) setProducts(productsRes.data);
    if (profileRes.data) setProfile(profileRes.data);
    setLoading(false);
  };

  const resetForm = () => {
    setProductName("");
    setProductDescription("");
    setProductPrice("");
    setProductDiscountPrice("");
    setProductLogoUrl("");
    setProductCategory("");
    setProductActive(true);
    setEditingProduct(null);
  };

  const openAddDialog = () => {
    resetForm();
    setShowProductDialog(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductDescription(product.description || "");
    setProductPrice(product.price.toString());
    setProductDiscountPrice(product.discount_price?.toString() || "");
    setProductLogoUrl(product.logo_url || "");
    setProductCategory(product.category || "");
    setProductActive(product.is_active);
    setShowProductDialog(true);
  };

  const handleSaveProduct = async () => {
    if (!productName || !productPrice) {
      toast({ title: "Error", description: "Name and price are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const productData = {
      vendor_id: user.id,
      name: productName,
      description: productDescription || null,
      logo_url: productLogoUrl || null,
      price: parseFloat(productPrice),
      discount_price: productDiscountPrice ? parseFloat(productDiscountPrice) : null,
      category: productCategory || null,
      is_active: productActive,
    };

    if (editingProduct) {
      const { error } = await supabase
        .from("vendor_products")
        .update(productData)
        .eq("id", editingProduct.id);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Product updated" });
        setShowProductDialog(false);
        resetForm();
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from("vendor_products")
        .insert(productData);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Product added" });
        setShowProductDialog(false);
        resetForm();
        fetchData();
      }
    }
    setSaving(false);
  };

  const handleDeleteProduct = async (id: string) => {
    const { error } = await supabase.from("vendor_products").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Product deleted" });
      fetchData();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  const handleSaveStoreName = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ store_name: storeName })
      .eq("id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Store name updated" });
      setShowStoreDialog(false);
      fetchData();
    }
    setSaving(false);
  };

  const openStoreDialog = () => {
    setStoreName(profile?.store_name || "");
    setShowStoreDialog(true);
  };

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.is_active).length;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Store size={28} />
              {profile?.store_name || "My Store"}
            </h1>
            <p className="text-muted-foreground">Welcome, {profile?.full_name || "Vendor"}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="outline" onClick={openStoreDialog}>
              <Edit2 size={18} className="mr-2" />
              Edit Store
            </Button>
            <Button variant="outline" onClick={() => navigate("/profile")}>
              <User size={18} className="mr-2" />
              Profile
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut size={18} className="mr-2" />
              Logout
            </Button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="text-primary" size={24} />
                <div>
                  <p className="text-2xl font-bold">{totalProducts}</p>
                  <p className="text-sm text-muted-foreground">Total Products</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="text-green-600" size={24} />
                <div>
                  <p className="text-2xl font-bold">{activeProducts}</p>
                  <p className="text-sm text-muted-foreground">Active Products</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Product Button */}
        <Button onClick={openAddDialog} className="mb-6">
          <Plus size={18} className="mr-2" />
          Add Product
        </Button>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Card key={product.id} className={!product.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                {product.logo_url && (
                  <img
                    src={product.logo_url}
                    alt={product.name}
                    className="w-full h-32 object-cover rounded-lg mb-2"
                  />
                )}
                <CardTitle className="text-lg flex items-center justify-between">
                  {product.name}
                  {!product.is_active && (
                    <span className="text-xs bg-muted px-2 py-1 rounded">Inactive</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {product.description && (
                  <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl font-bold">${product.price.toFixed(2)}</span>
                  {product.discount_price && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <Percent size={14} />
                      ${product.discount_price.toFixed(2)}
                    </span>
                  )}
                </div>
                {product.category && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    {product.category}
                  </span>
                )}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(product)}>
                    <Edit2 size={14} className="mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteProduct(product.id)}
                  >
                    <Trash2 size={14} className="mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {products.length === 0 && !loading && (
          <Card className="p-8 text-center">
            <Package size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Products Yet</h3>
            <p className="text-muted-foreground mb-4">Add your first product to start selling.</p>
            <Button onClick={openAddDialog}>
              <Plus size={18} className="mr-2" />
              Add Product
            </Button>
          </Card>
        )}
      </div>

      {/* Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product Name *</Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Enter product name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Product description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Discount Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={productDiscountPrice}
                  onChange={(e) => setProductDiscountPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input
                value={productLogoUrl}
                onChange={(e) => setProductLogoUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                placeholder="e.g., Electronics, Food"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={productActive} onCheckedChange={setProductActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProduct} disabled={saving}>
              {saving ? "Saving..." : editingProduct ? "Update" : "Add"} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Store Name Dialog */}
      <Dialog open={showStoreDialog} onOpenChange={setShowStoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Store Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Store Name</Label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Enter your store name"
              />
              <p className="text-sm text-muted-foreground mt-1">
                This is how customers will find your store
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStoreDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveStoreName} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorDashboard;
