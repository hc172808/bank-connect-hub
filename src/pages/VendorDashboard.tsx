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
  LogOut,
  Edit2,
  Trash2,
  User,
  Send,
  QrCode,
  ScanLine,
  History,
  Wallet,
  TrendingUp,
  Bell,
  Receipt,
  BarChart3,
  Target,
  Star,
  ArrowUpRight,
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
  wallet_address: string | null;
}

interface WalletData {
  balance: number;
}

interface Sale {
  amount: number;
  created_at: string;
}

const VendorDashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
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

    // Sales for last 30 days (this vendor received funds)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [productsRes, profileRes, walletRes, salesRes] = await Promise.all([
      supabase
        .from("vendor_products")
        .select("*")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("full_name, store_name, wallet_address")
        .eq("id", user.id)
        .single(),
      supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
      supabase
        .from("transactions")
        .select("amount, created_at")
        .eq("receiver_id", user.id)
        .eq("status", "completed")
        .gte("created_at", thirtyDaysAgo),
    ]);

    if (productsRes.data) setProducts(productsRes.data);
    if (profileRes.data) setProfile(profileRes.data);
    if (walletRes.data) setWallet(walletRes.data as WalletData);
    if (salesRes.data) setSales(salesRes.data as Sale[]);
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
      const { error } = await supabase.from("vendor_products").insert(productData);

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
  const activeProducts = products.filter((p) => p.is_active).length;
  const salesTotal30d = sales.reduce((acc, s) => acc + Number(s.amount || 0), 0);
  const salesCount30d = sales.length;

  // 7-day revenue bars
  const sevenDayBars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const dayStr = d.toISOString().split("T")[0];
    const dayRows = sales.filter(s => s.created_at.startsWith(dayStr));
    return {
      label: d.toLocaleDateString("en", { weekday: "short" }),
      volume: dayRows.reduce((s, t) => s + Number(t.amount || 0), 0),
      count: dayRows.length,
    };
  });
  const maxSevenDayVol = Math.max(...sevenDayBars.map(b => b.volume), 1);

  // Top products by estimated revenue (price * estimated sales rank by order)
  const topProducts = [...products]
    .filter(p => p.is_active)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  // Daily target (configurable, default $500)
  const dailyTarget = 500;
  const todaySales = sevenDayBars[sevenDayBars.length - 1]?.volume ?? 0;
  const targetPct = Math.min((todaySales / dailyTarget) * 100, 100);

  const QuickAction = ({
    icon: Icon,
    label,
    onClick,
    testId,
    color = "text-primary",
  }: {
    icon: typeof Send;
    label: string;
    onClick: () => void;
    testId: string;
    color?: string;
  }) => (
    <button
      onClick={onClick}
      data-testid={testId}
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
    >
      <div className={`w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6 gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2 truncate">
              <Store size={28} />
              <span className="truncate">{profile?.store_name || "My Store"}</span>
            </h1>
            <p className="text-muted-foreground truncate">
              Welcome, {profile?.full_name || "Vendor"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={openStoreDialog} data-testid="button-edit-store">
              <Edit2 size={16} className="mr-1" /> Store
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/profile")} data-testid="button-profile">
              <User size={16} className="mr-1" /> Profile
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut size={16} className="mr-1" /> Logout
            </Button>
          </div>
        </header>

        {/* Wallet Balance */}
        <Card className="mb-4 bg-gradient-to-br from-primary/15 to-primary/5 border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Wallet size={14} /> Wallet Balance
                </p>
                <p className="text-3xl font-bold mt-1" data-testid="text-balance">
                  ${(wallet?.balance ?? 0).toFixed(2)}
                </p>
                {profile?.wallet_address && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-1 truncate max-w-[260px]">
                    {profile.wallet_address}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <TrendingUp size={12} /> Sales (30d)
                </p>
                <p className="text-lg font-semibold" data-testid="text-sales-total">
                  ${salesTotal30d.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {salesCount30d} {salesCount30d === 1 ? "sale" : "sales"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 7-Day Revenue Chart */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 size={17} className="text-primary" /> Revenue — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sevenDayBars.every(b => b.volume === 0) ? (
              <div className="text-center py-4">
                <BarChart3 size={28} className="mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">No sales this week yet</p>
              </div>
            ) : (
              <div className="flex items-end gap-1.5 h-24">
                {sevenDayBars.map(bar => (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[9px] text-muted-foreground">{bar.count > 0 ? bar.count : ""}</div>
                    <div className="w-full flex items-end justify-center" style={{ height: "68px" }}>
                      <div
                        className="w-full rounded-t-md bg-primary/70 min-h-[3px] transition-all"
                        style={{ height: `${Math.max((bar.volume / maxSevenDayVol) * 100, 4)}%` }}
                        title={`$${bar.volume.toFixed(2)}`}
                      />
                    </div>
                    <div className="text-[9px] text-muted-foreground font-medium">{bar.label}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Target & Top Products row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Daily target progress */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Target size={16} className="text-orange-500" />
                <span className="text-xs font-semibold">Daily Target</span>
              </div>
              <div className="text-xl font-bold">${todaySales.toFixed(0)}</div>
              <div className="text-xs text-muted-foreground mb-2">of ${dailyTarget} goal</div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${targetPct >= 100 ? "bg-green-500" : "bg-orange-400"}`}
                  style={{ width: `${targetPct}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">{targetPct.toFixed(0)}% of target</div>
            </CardContent>
          </Card>

          {/* Top products */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Star size={16} className="text-yellow-500" />
                <span className="text-xs font-semibold">Top Products</span>
              </div>
              {topProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active products</p>
              ) : (
                <div className="space-y-1.5">
                  {topProducts.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-xs truncate flex-1">{p.name}</span>
                      <span className="text-xs font-semibold text-green-600">${p.price.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Month vs Week comparison */}
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-green-600" />
                <span className="text-sm font-semibold">Sales Summary</span>
              </div>
              <button onClick={() => navigate("/vendor/analytics")} className="text-xs text-primary flex items-center gap-1">
                Full report <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="text-center">
                <div className="text-lg font-bold">${salesTotal30d.toFixed(0)}</div>
                <div className="text-[10px] text-muted-foreground">30-day total</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{salesCount30d}</div>
                <div className="text-[10px] text-muted-foreground">total orders</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">${salesCount30d > 0 ? (salesTotal30d / salesCount30d).toFixed(0) : "0"}</div>
                <div className="text-[10px] text-muted-foreground">avg order</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <QuickAction
            icon={Send}
            label="Send Funds"
            onClick={() => navigate("/send-money")}
            testId="quick-send"
          />
          <QuickAction
            icon={QrCode}
            label="Receive"
            onClick={() => navigate("/receive-money")}
            testId="quick-receive"
            color="text-green-600"
          />
          <QuickAction
            icon={ScanLine}
            label="Scan to Pay"
            onClick={() => navigate("/scan-to-pay")}
            testId="quick-scan"
            color="text-blue-600"
          />
          <QuickAction
            icon={History}
            label="Transactions"
            onClick={() => navigate("/transactions")}
            testId="quick-transactions"
            color="text-orange-600"
          />
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <QuickAction
            icon={Receipt}
            label="Request Funds"
            onClick={() => navigate("/request-funds")}
            testId="quick-request"
            color="text-purple-600"
          />
          <QuickAction
            icon={Bell}
            label="Notifications"
            onClick={() => navigate("/notifications")}
            testId="quick-notifications"
            color="text-yellow-600"
          />
          <QuickAction
            icon={Store}
            label="My Store Page"
            onClick={() => navigate("/vendor-store")}
            testId="quick-store-page"
            color="text-pink-600"
          />
        </div>

        {/* POS / Analytics row */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <QuickAction
            icon={Receipt}
            label="Charge Customer"
            onClick={() => navigate("/vendor/charge")}
            testId="quick-charge"
            color="text-emerald-600"
          />
          <QuickAction
            icon={TrendingUp}
            label="Sales Analytics"
            onClick={() => navigate("/vendor/analytics")}
            testId="quick-analytics"
            color="text-indigo-600"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="text-primary" size={24} />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-products">{totalProducts}</p>
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
                  <p className="text-2xl font-bold" data-testid="text-active-products">{activeProducts}</p>
                  <p className="text-sm text-muted-foreground">Active Products</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Product Button */}
        <Button onClick={openAddDialog} className="mb-6" data-testid="button-add-product">
          <Plus size={18} className="mr-2" />
          Add Product
        </Button>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Card key={product.id} className={!product.is_active ? "opacity-60" : ""} data-testid={`card-product-${product.id}`}>
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
                  <Button size="sm" variant="outline" onClick={() => openEditDialog(product)} data-testid={`button-edit-${product.id}`}>
                    <Edit2 size={14} className="mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteProduct(product.id)}
                    data-testid={`button-delete-${product.id}`}
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
