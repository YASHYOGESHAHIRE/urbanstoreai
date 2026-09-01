"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import CategoryNav from "@/components/CategoryNav";
import FilterBar from "@/components/FilterBar";
import ProductGrid from "@/components/ProductGrid";
import AIPanel from "@/components/AIPanel";
import Footer from "@/components/Footer";
import { products, Product } from "@/lib/products";

export default function Home() {
  const [aiOpen, setAiOpen] = useState(true);
  const [aiQuery, setAiQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [cartCount, setCartCount] = useState(0);
  const searchParams = useSearchParams();
  const handledCheckout = useRef(false);

  // When Claude sends user here with ?checkout=ID, open AI panel and trigger payment
  useEffect(() => {
    const checkoutId = searchParams.get("checkout");
    if (checkoutId && !handledCheckout.current) {
      handledCheckout.current = true;
      setAiOpen(true);
      setAiQuery(`complete payment for checkout ${checkoutId}`);
    }
  }, [searchParams]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === "All") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [activeCategory]);

  const handleAISearch = (query: string) => {
    setAiQuery(query);
    setAiOpen(true);
  };

  const handleAddToCart = (_product: Product) => {
    setCartCount((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      <Header
        onAIToggle={() => setAiOpen((prev) => !prev)}
        aiOpen={aiOpen}
        cartCount={cartCount}
      />

      <main className={`transition-all duration-300 ${aiOpen ? "mr-[436px]" : ""}`}>
        <Hero onAISearch={handleAISearch} />

        <CategoryNav active={activeCategory} onChange={setActiveCategory} />

        <FilterBar />

        <div className="max-w-[1400px] mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[13px] text-gray-500">
              <span className="font-semibold text-black">{filteredProducts.length}</span> products
            </p>
          </div>
          <ProductGrid products={filteredProducts} onAddToCart={handleAddToCart} />
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
