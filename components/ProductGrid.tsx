"use client";

import { Product } from "@/lib/products";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: Product[];
  onAddToCart?: (product: Product) => void;
}

export default function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-400 text-[14px]">No products found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} />
      ))}
    </div>
  );
}
