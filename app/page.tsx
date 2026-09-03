"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import CategoryNav from "@/components/CategoryNav";
import FilterBar from "@/components/FilterBar";
import ProductGrid from "@/components/ProductGrid";
import AIPanel from "@/components/AIPanel";
import Footer from "@/components/Footer";
import CartDrawer, { CartData } from "@/components/CartDrawer";
import { products as staticProducts, Product, fromApiProduct } from "@/lib/products";
import { ActiveCampaign } from "@/components/ProductCard";
import { authHeaders } from "@/lib/auth";
import { track } from "@/lib/behaviour";
import { SortOption, ActiveFilters, emptyFilters } from "@/components/FilterBar";
import { useRouter } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default function Home() {
  const router = useRouter();
  const [aiOpen, setAiOpen] = useState(true);
  const [aiQuery, setAiQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSort, setActiveSort] = useState<SortOption>("Popular");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(emptyFilters);
  const [searchQuery, setSearchQuery] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [campaigns, setCampaigns] = useState<ActiveCampaign[]>([]);
  const [liveProducts, setLiveProducts] = useState<Product[]>(staticProducts);
  const [productsLoading, setProductsLoading] = useState(true);

  // ── Cart drawer state ──────────────────────────────────────────────────────
  const [cartOpen, setCartOpen] = useState(false);
  const [cartData, setCartData] = useState<CartData | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Pre-fetch cart data on mount (so drawer opens instantly)
  const fetchCart = useCallback(async (showSpinner = false) => {
    if (showSpinner) setCartLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart`, { headers: authHeaders() });
      if (!res.ok) return;
      const data: CartData = await res.json();
      setCartData(data);
      setCartCount(data.itemCount ?? 0);
    } catch { /* silent */ } finally {
      if (showSpinner) setCartLoading(false);
    }
  }, []);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const handleCartOpen = useCallback(() => {
    // Show cached data immediately — only show spinner on very first open
    setCartOpen(true);
    if (!cartData) fetchCart(true);
    else fetchCart(false); // silent background refresh
  }, [fetchCart, cartData]);

  const handleRemove = useCallback(async (itemId: string) => {
    setUpdatingItem(itemId);
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart/items/${itemId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: CartData = await res.json();
        setCartData(data);
        setCartCount(data.itemCount ?? 0);
      }
    } finally {
      setUpdatingItem(null);
    }
  }, []);

  const handleUpdateQty = useCallback(async (itemId: string, newQty: number) => {
    if (newQty < 1) return handleRemove(itemId);
    setUpdatingItem(itemId);
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ quantity: newQty }),
      });
      if (res.ok) {
        const data: CartData = await res.json();
        setCartData(data);
        setCartCount(data.itemCount ?? 0);
      }
    } finally {
      setUpdatingItem(null);
    }
  }, [handleRemove]);

  const handleCheckout = useCallback(async () => {
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const res = await fetch(`${BACKEND}/api/v1/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data.policy?.summary ?? data.error ?? "Checkout failed.");
        return;
      }
      setCartOpen(false);
      router.push(`/pay/${data.checkoutId}`);
    } catch {
      setCheckoutError("Network error. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }, [router]);

  // Fetch live products from DB — all 500+
  useEffect(() => {
    fetch(`${BACKEND}/api/v1/catalog/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 500, offset: 0 }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.products?.length) {
          setLiveProducts(data.products.map(fromApiProduct));
        }
      })
      .catch(() => {}) // fall back to static
      .finally(() => setProductsLoading(false));
  }, []);

  // Fetch active campaigns for storefront badges
  useEffect(() => {
    fetch(`${BACKEND}/api/v1/campaigns/active`)
      .then((r) => r.ok ? r.json() : { campaigns: [] })
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => {});
  }, []);

  // Sync cart count from backend
  useEffect(() => {
    fetch(`${BACKEND}/api/v1/cart`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.itemCount) setCartCount(data.itemCount); })
      .catch(() => {});
  }, []);

  const filteredProducts = useMemo(() => {
    // 1. Keyword search
    let result = liveProducts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.subcategory?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }

    // 2. Category (skip when searching — show cross-category results)
    if (!searchQuery.trim() && activeCategory !== "All")
      result = result.filter((p) => p.category === activeCategory);

    // 2. Price
    if (activeFilters.priceMin !== null)
      result = result.filter((p) => p.price >= activeFilters.priceMin!);
    if (activeFilters.priceMax !== null)
      result = result.filter((p) => p.price <= activeFilters.priceMax!);

    // 3. Brand
    if (activeFilters.brands.length > 0)
      result = result.filter((p) => activeFilters.brands.includes(p.brand));

    // 4. Color — match any variant
    if (activeFilters.colors.length > 0)
      result = result.filter((p) =>
        p.variants?.some((v) => {
          const attrs = v.attributes as Record<string, string>;
          return activeFilters.colors.includes(attrs.color);
        })
      );

    // 5. Size — match any variant
    if (activeFilters.sizes.length > 0)
      result = result.filter((p) =>
        p.variants?.some((v) => {
          const attrs = v.attributes as Record<string, string>;
          return activeFilters.sizes.includes(attrs.size);
        })
      );

    // 6. Availability
    if (activeFilters.availability.length > 0)
      result = result.filter((p) => activeFilters.availability.includes(p.availability));

    // 7. Sort
    const sorted = [...result];
    switch (activeSort) {
      case "Price: Low to High":  sorted.sort((a, b) => a.price - b.price); break;
      case "Price: High to Low":  sorted.sort((a, b) => b.price - a.price); break;
      case "Newest":              sorted.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
      case "Discount":
        sorted.sort((a, b) => {
          const dA = a.mrp > a.price ? (a.mrp - a.price) / a.mrp : 0;
          const dB = b.mrp > b.price ? (b.mrp - b.price) / b.mrp : 0;
          return dB - dA;
        });
        break;
      default: break; // Popular — keep catalogue order
    }
    return sorted;
  }, [activeCategory, activeSort, activeFilters, searchQuery, liveProducts]);

  const handleAISearch = (query: string) => {
    setAiQuery(query);
    setAiOpen(true);
  };

  const handleAddToCart = async (_product: Product) => {
    const variant = _product.variants?.find((v) => v.availability === "in_stock")
      ?? _product.variants?.[0];
    if (!variant) return;

    try {
      const res = await fetch(`${BACKEND}/api/v1/cart/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ productId: _product.id, variantSku: variant.sku, quantity: 1 }),
      });
      if (res.ok) {
        const data: CartData = await res.json();
        setCartData(data);
        setCartCount(data.itemCount ?? 0);
      } else {
        setCartCount((prev) => prev + 1);
      }
    } catch {
      setCartCount((prev) => prev + 1);
    }

    track({
      event: "cart_add",
      productId: _product.id,
      categoryId: _product.category.toLowerCase(),
      metadata: { name: _product.name, price: _product.price },
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      <Header
        onAIToggle={() => setAiOpen((prev) => !prev)}
        aiOpen={aiOpen}
        cartCount={cartCount}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCartOpen={handleCartOpen}
      />

      <main className={`transition-all duration-300 ${aiOpen ? "mr-[444px]" : ""}`}>
        <Hero onAISearch={handleAISearch} />
        <CategoryNav active={activeCategory} onChange={setActiveCategory} />
        <FilterBar
          products={liveProducts}
          activeSort={activeSort}
          onSortChange={setActiveSort}
          activeFilters={activeFilters}
          onFiltersChange={setActiveFilters}
        />

        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-gray-500">
              {productsLoading ? (
                <span className="text-gray-300">Loading products…</span>
              ) : (
                <>
                  <span className="font-semibold text-black">{filteredProducts.length}</span> products
                  {searchQuery.trim() && (
                    <span className="ml-1.5 text-gray-400">for &ldquo;{searchQuery}&rdquo;</span>
                  )}
                  {campaigns.length > 0 && !searchQuery && (
                    <span className="ml-2 text-[#c8f04b] bg-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {campaigns.length} active campaign{campaigns.length > 1 ? "s" : ""}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <ProductGrid
            products={filteredProducts}
            onAddToCart={handleAddToCart}
            campaigns={campaigns}
          />
        </div>

        <Footer />
      </main>

      {aiOpen && (
        <AIPanel
          onClose={() => setAiOpen(false)}
          initialQuery={aiQuery}
        />
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => { setCartOpen(false); setCheckoutError(""); }}
        cart={cartData}
        loading={cartLoading}
        updatingItem={updatingItem}
        onUpdateQty={handleUpdateQty}
        onRemove={handleRemove}
        onCheckout={handleCheckout}
        checkingOut={checkingOut}
        checkoutError={checkoutError}
      />
    </div>
  );
}
