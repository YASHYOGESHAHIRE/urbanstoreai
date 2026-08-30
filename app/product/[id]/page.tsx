"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Heart, ShoppingCart, Check,
  Shield, RotateCcw, Truck, ChevronRight,
} from "lucide-react";
import { products, Product } from "@/lib/products";

function formatPrice(price: number) {
  return `₹${price.toLocaleString("en-IN")}`;
}

function discountPct(price: number, mrp: number) {
  return Math.round(((mrp - price) / mrp) * 100);
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const product = products.find((p) => p.id === id);

  const [selectedVariant, setSelectedVariant] = useState(0);
  const [wishlisted, setWishlisted] = useState(false);
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  if (!product) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-900 text-[18px] font-bold mb-2">
            Product not found
          </p>
          <Link href="/" className="text-black text-[13px] hover:underline">
            ← Back to store
          </Link>
        </div>
      </div>
    );
  }

  const variant = product.variants[selectedVariant];
  const pct = discountPct(variant.price, variant.mrp);
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  const attributeKeys = Object.keys(product.variants[0]?.attributes ?? {});

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-2 text-[13px]">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-gray-400 hover:text-black transition-colors"
          >
            <ArrowLeft size={15} />
            Back
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-400">{product.category}</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium truncate">{product.name}</span>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-16">

          {/* ── Image ─────────────────────────────────────────────────────── */}
          <div>
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                unoptimized
                priority
              />
              {/* Subtle dark overlay to keep images moody */}
              <div className="absolute inset-0 bg-black/15" />

              {pct > 0 && (
                <div className="absolute top-4 left-4 bg-black text-white text-[11px] font-black px-2.5 py-1 rounded-full">
                  {pct}% OFF
                </div>
              )}
              <button
                onClick={() => setWishlisted(!wishlisted)}
                className="absolute top-4 right-4 w-9 h-9 bg-white/90 border border-gray-200 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
              >
                <Heart
                  size={16}
                  className={wishlisted ? "text-red-500" : "text-gray-400"}
                  fill={wishlisted ? "#ef4444" : "none"}
                />
              </button>
            </div>
          </div>

          {/* ── Details ───────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-5">

            {/* Brand + name */}
            <div>
              <p className="text-[11px] font-bold tracking-widest text-gray-400 uppercase mb-1.5">
                {product.brand}
              </p>
              <h1 className="text-[28px] font-black text-gray-900 leading-tight mb-1">
                {product.name}
              </h1>
              <p className="text-gray-400 text-[13px]">{product.subcategory}</p>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-[32px] font-black text-gray-900">
                {formatPrice(variant.price)}
              </span>
              {variant.mrp > variant.price && (
                <>
                  <span className="text-[18px] text-gray-300 line-through">
                    {formatPrice(variant.mrp)}
                  </span>
                  <span className="text-green-600 text-[13px] font-bold">
                    {pct}% off
                  </span>
                </>
              )}
            </div>

            {/* Availability */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  variant.availability === "in_stock"
                    ? "bg-green-500"
                    : variant.availability === "low_stock"
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
              />
              <span
                className={`text-[13px] font-semibold ${
                  variant.availability === "in_stock"
                    ? "text-green-600"
                    : variant.availability === "low_stock"
                    ? "text-amber-600"
                    : "text-red-500"
                }`}
              >
                {variant.availability === "in_stock"
                  ? "In stock"
                  : variant.availability === "low_stock"
                  ? `Low stock — only ${variant.quantity} left`
                  : "Out of stock"}
              </span>
            </div>

            {/* Description */}
            <p className="text-gray-500 text-[14px] leading-relaxed border-t border-gray-200 pt-4">
              {product.description}
            </p>

            {/* Variants */}
            {attributeKeys.map((key) => {
              const uniqueVals = [
                ...new Set(product.variants.map((v) => v.attributes[key])),
              ];
              if (uniqueVals.length <= 1) return null;
              return (
                <div key={key}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueVals.map((val) => {
                      const vIdx = product.variants.findIndex(
                        (v) => v.attributes[key] === val
                      );
                      const isSelected =
                        product.variants[selectedVariant]?.attributes[key] === val;
                      const isOOS =
                        product.variants[vIdx]?.availability === "out_of_stock";
                      return (
                        <button
                          key={val}
                          onClick={() => setSelectedVariant(vIdx)}
                          disabled={isOOS}
                          className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition-all ${
                            isSelected
                              ? "bg-black text-white border-black"
                              : isOOS
                              ? "border-gray-100 text-gray-300 cursor-not-allowed line-through"
                              : "border-gray-200 text-gray-600 hover:border-gray-900 hover:text-black"
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Qty + Add to cart */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="w-10 h-11 flex items-center justify-center text-gray-400 hover:text-black transition-colors text-lg"
                >
                  −
                </button>
                <span className="w-10 text-center text-gray-900 text-[14px] font-bold">
                  {qty}
                </span>
                <button
                  onClick={() => setQty(Math.min(product.maxQtyPerOrder, qty + 1))}
                  className="w-10 h-11 flex items-center justify-center text-gray-400 hover:text-black transition-colors text-lg"
                >
                  +
                </button>
              </div>

              <button
                onClick={() => {
                  setAdded(true);
                  setTimeout(() => setAdded(false), 2000);
                }}
                disabled={variant.availability === "out_of_stock"}
                className={`flex-1 h-11 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all ${
                  added
                    ? "bg-green-500 text-white"
                    : variant.availability === "out_of_stock"
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    : "bg-black text-white hover:bg-gray-800"
                }`}
              >
                {added ? (
                  <><Check size={16} /> Added!</>
                ) : (
                  <><ShoppingCart size={16} /> Add to Cart</>
                )}
              </button>

              <button
                onClick={() => setWishlisted(!wishlisted)}
                className="w-11 h-11 border border-gray-200 rounded-xl flex items-center justify-center hover:border-gray-400 transition-colors bg-white"
              >
                <Heart
                  size={17}
                  className={wishlisted ? "text-red-500" : "text-gray-400"}
                  fill={wishlisted ? "#ef4444" : "none"}
                />
              </button>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { icon: Truck, text: "Free delivery over ₹999" },
                { icon: RotateCcw, text: "7-day returns" },
                { icon: Shield, text: "Secure checkout" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="flex flex-col items-center gap-1.5 bg-white border border-gray-100 rounded-xl p-3 text-center"
                >
                  <Icon size={15} className="text-gray-400" />
                  <span className="text-[10px] text-gray-400 leading-tight">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Product details ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">

          {product.useCases.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h3 className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-4">
                Use Cases
              </h3>
              <div className="flex flex-wrap gap-2">
                {product.useCases.map((u) => (
                  <span
                    key={u}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-full text-gray-600 text-[12px]"
                  >
                    {u}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(product.suitableFor.length > 0 || product.notSuitableFor.length > 0) && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h3 className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-4">
                Best For
              </h3>
              <div className="space-y-2">
                {product.suitableFor.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <Check size={12} className="text-green-500 flex-shrink-0" />
                    <span className="text-gray-600 text-[13px]">{s}</span>
                  </div>
                ))}
                {product.notSuitableFor.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="text-gray-300 text-[10px] flex-shrink-0">✕</span>
                    <span className="text-gray-300 text-[13px] line-through">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(product.characteristics).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 md:col-span-2">
              <h3 className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-4">
                Specifications
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Object.entries(product.characteristics).map(([key, value]) => {
                  const label = key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase());
                  const display = Array.isArray(value)
                    ? value.join(", ")
                    : typeof value === "boolean"
                    ? value ? "Yes" : "No"
                    : String(value);
                  return (
                    <div key={key} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                      <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
                        {label}
                      </p>
                      <p className="text-gray-900 text-[13px] font-medium">{display}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Related products ─────────────────────────────────────────────── */}
        {related.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-gray-900 text-[18px] font-black uppercase">
                You may also like
              </h2>
              <Link
                href="/"
                className="flex items-center gap-1 text-gray-500 text-[12px] hover:text-black transition-colors"
              >
                View all <ChevronRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {related.map((rp) => (
                <RelatedCard key={rp.id} product={rp} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RelatedCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`}>
      <div className="bg-white border border-gray-100 hover:border-gray-200 rounded-2xl overflow-hidden group transition-all hover:shadow-md">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
          {/* subtle dark overlay */}
          <div className="absolute inset-0 bg-black/15" />
        </div>
        <div className="p-3">
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-0.5">
            {product.brand}
          </p>
          <p className="text-gray-900 text-[13px] font-semibold leading-tight line-clamp-2 mb-1">
            {product.name}
          </p>
          <p className="text-gray-900 text-[14px] font-black">
            ₹{product.price.toLocaleString("en-IN")}
          </p>
        </div>
      </div>
    </Link>
  );
}
