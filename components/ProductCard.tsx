"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingCart, Check } from "lucide-react";
import { Product } from "@/lib/products";

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
}

export default function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [wishlisted, setWishlisted] = useState(false);
  const [added, setAdded] = useState(false);

  const discountPct =
    product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAddToCart) onAddToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWishlisted(!wishlisted);
  };

  return (
    <Link href={`/product/${product.id}`}>
      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all group cursor-pointer">
        {/* Image */}
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
          {/* Dark overlay to give images moody look */}
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />

          {/* Wishlist */}
          <button
            onClick={handleWishlist}
            className="absolute top-2.5 right-2.5 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
          >
            <Heart
              size={14}
              className={wishlisted ? "text-red-500" : "text-gray-400"}
              fill={wishlisted ? "#ef4444" : "none"}
            />
          </button>

          {/* Discount badge */}
          {discountPct > 0 && (
            <span className="absolute top-2.5 left-2.5 bg-black text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {discountPct}% OFF
            </span>
          )}

          {product.isNew && !discountPct && (
            <span className="absolute top-2.5 left-2.5 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              NEW
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">
            {product.brand}
          </p>
          <p className="text-[13px] font-semibold text-gray-900 leading-tight mb-1.5 line-clamp-2">
            {product.name}
          </p>

          {/* Price row */}
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-[15px] font-black text-gray-900">
              ₹{product.price.toLocaleString("en-IN")}
            </span>
            {product.mrp > product.price && (
              <span className="text-[11px] text-gray-400 line-through">
                ₹{product.mrp.toLocaleString("en-IN")}
              </span>
            )}
          </div>

          {/* Attributes */}
          <p className="text-[11px] text-gray-400 mb-2 leading-tight line-clamp-1">
            {product.attributes.join(" · ")}
          </p>

          {/* Availability + Cart */}
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold ${
                product.availability === "In stock"
                  ? "text-green-600"
                  : product.availability === "Low stock"
                  ? "text-amber-600"
                  : "text-red-500"
              }`}
            >
              {product.availability}
            </span>

            <button
              onClick={handleAddToCart}
              disabled={product.availability === "Out of stock"}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                added
                  ? "bg-green-500 text-white"
                  : product.availability === "Out of stock"
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : "bg-black text-white hover:bg-gray-800"
              }`}
            >
              {added ? <Check size={13} /> : <ShoppingCart size={13} />}
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
