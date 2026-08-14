import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Store,
  ShoppingCart,
  Wallet,
  Package,
  Percent,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { processPrivateLedgerTransfer } from "@/lib/privateLedger";

interface Product {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  price: number;
  discount_price: number | null;
  category: string | null;
}

interface WalletData {
  balance: number;
}

interface VendorProfile {
  wallet_address: string | null;
  full_name: string | null;
  store_name: string | null;
}

const VendorStore = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const vendorId = searchParams.get("vendor");

  useEffect(() => {
    fetchData();
  }, [vendorId]);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const walletRes = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (walletRes.data) setWallet(walletRes.data);

    if (vendorId) {
      const [productsRes, vendorRes] = await Promise.all([
        supabase.from("vendor_products").select("*").eq("vendor_id", vendorId).eq("is_active", true),
        supabase.from("profiles").select("wallet_address, full_name, store_name").eq("id", vendorId).single(),
      ]);
      if (productsRes.data) setProducts(productsRes.data);
      if (vendorRes.data) setVendorProfile(vendorRes.data);
    } else {
      const { data: productsData } = await supabase.from("vendor_products").select("*").eq("is_active", true);
      if (productsData) setProducts(productsData);
    }
    
    setLoading(false);
  };

  const handleBuy = (product: Product) => {
    setSelectedProduct(product);
    setShowPaymentDialog(true);
  };

  const getEffectivePrice = (product: Product) => {
    return product.discount_price || product.price;
  };

  const processPayment = async () => {
    if (!selectedProduct) return;

    setProcessing(true);
    const effectivePrice = getEffectivePrice(selectedProduct);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!wallet || wallet.balance < effectivePrice) {
        throw new Error("Insufficient balance");
      }

      const result = await processPrivateLedgerTransfer({
        senderId: user.id,
        receiverId: selectedProduct.vendor_id,
        amount: effectivePrice,
        transactionType: "purchase",
        description: `Purchase: ${selectedProduct.name}`,
      });

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      toast({
        title: "Purchase Successful",
        description: `Paid $${effectivePrice.toFixed(2)} for ${selectedProduct.name}`,
      });

      setShowPaymentDialog(false);
      setSelectedProduct(null);
      fetchData(); // Refresh balance
    } catch (error: any) {
      toast({
        title: "Payment Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

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

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Store size={28} />
              {vendorProfile ? (vendorProfile.store_name || `${vendorProfile.full_name}'s Store`) : "Vendor Marketplace"}
            </h1>
            <p className="text-muted-foreground">
              Balance: ${wallet?.balance?.toFixed(2) || "0.00"}
            </p>
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader className="pb-2">
                {product.logo_url && (
                  <img
                    src={product.logo_url}
                    alt={product.name}
                    className="w-full h-32 object-cover rounded-lg mb-2"
                  />
                )}
                <CardTitle className="text-lg">{product.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {product.description && (
                  <p className="text-sm text-muted-foreground mb-2">{product.description}</p>
                )}
                <div className="flex items-center gap-2 mb-3">
                  {product.discount_price ? (
                    <>
                      <span className="text-lg line-through text-muted-foreground">
                        ${product.price.toFixed(2)}
                      </span>
                      <span className="text-xl font-bold text-green-600">
                        ${product.discount_price.toFixed(2)}
                      </span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                        <Percent size={12} />
                        {Math.round((1 - product.discount_price / product.price) * 100)}% OFF
                      </span>
                    </>
                  ) : (
                    <span className="text-xl font-bold">${product.price.toFixed(2)}</span>
                  )}
                </div>
                {product.category && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded mb-3 inline-block">
                    {product.category}
                  </span>
                )}
                <Button className="w-full mt-2" onClick={() => handleBuy(product)}>
                  <ShoppingCart size={16} className="mr-2" />
                  Buy Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {products.length === 0 && !loading && (
          <Card className="p-8 text-center">
            <Package size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Products Available</h3>
            <p className="text-muted-foreground">Check back later for new products.</p>
          </Card>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Purchase</DialogTitle>
            <DialogDescription>
              Choose how you want to pay for {selectedProduct?.name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span>Product</span>
                  <span className="font-medium">{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>${getEffectivePrice(selectedProduct).toFixed(2)}</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">Payment method</p>
                <p className="text-muted-foreground">
                  Paid from your private ledger balance.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={processPayment} 
              disabled={processing}
            >
              {processing ? "Processing..." : "Pay Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorStore;
