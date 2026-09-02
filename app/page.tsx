"use client";

import { useState, useMemo, useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import CategoryNav from "@/components/CategoryNav";
import FilterBar from "@/components/FilterBar";
import ProductGrid from "@/components/ProductGrid";
import AIPanel from "@/components/AIPanel";
import Footer from "@/components/Footer";
import { products as staticProducts, Product, fromApiProduct } from "@/lib/products";
import { ActiveCampaign } from "@/components/ProductCard";
import { authHeaders } from "@/lib/auth";
import { track } from "@/lib/behaviour";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default function Home() {
  const [aiOpen, setAiOpen] = useState(true);
  const [aiQuery, setAiQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cartCount, setCartCount] = useState(0);
  const [campaigns, setCampaigns] = useState<ActiveCampaign[]>([]);
  const [liveProducts, setLiveProducts] = useState<Product[]>(staticProducts);
  const [productsLoading, setProductsLoading] = useState(true);

  // Fetch live products from DB
  useEffect(() => {
    fetch(`${BACKEND}/api/v1/catalog/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50, offset: 0 }),
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
    if (activeCategory === "All") return liveProducts;
    return liveProducts.filter((p: Product) => p.category === activeCategory);
  }, [activeCategory, liveProducts]);

  const handleAISearch = (query: string) => {
    setAiQuery(query);
    setAiOpen(true);
  };

  const handleAddToCart = (_product: Product) => {
    setCartCount((prev) => prev + 1);
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
      />

      <main className={`transition-all duration-300 ${aiOpen ? "mr-[444px]" : ""}`}>
        <Hero onAISearch={handleAISearch} />
        <CategoryNav active={activeCategory} onChange={setActiveCategory} />
        <FilterBar />

        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-gray-500">
              {productsLoading ? (
                <span className="text-gray-300">Loading products…</span>
              ) : (
                <>
                  <span className="font-semibold text-black">{filteredProducts.length}</span> products
                  {campaigns.length > 0 && (
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
    </div>
  );
}
