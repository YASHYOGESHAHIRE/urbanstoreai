"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ShoppingBag, Trash2, Plus, Minus,
  Loader2, Lock, ShieldCheck, Tag, ArrowRight,
} from "lucide-react";
import { authHeaders, getStoredToken } from "@/lib/auth";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

const SUBCATEGORY_IMAGES: Record<string, string> = {
  running_shoes:      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop",
  casual_shoes:       "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop",
  formal_shoes:       "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=400&h=400&fit=crop",
  laptop_bags:        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop",
  backpacks:          "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=400&h=400&fit=crop",
  travel_bags:        "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=400&fit=crop",
  t_shirts:           "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&h=400&fit=crop",
  shirts:             "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop",
  jeans:              "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop",
  jackets:            "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=400&fit=crop",
  watches:            "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&h=400&fit=crop",
  wallets:            "https://images.unsplash.com/photo-1627123424574-724758594e93?w=400&h=400&fit=crop",
  sunglasses:         "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400&h=400&fit=crop",
};

function getProductImage(item: CartItem): string {
  // Map SKU prefix to subcategory image — formatCart doesn't return subcategoryId
  const sku = item.variantSku.toLowerCase();
  if (sku.includes("shoe") || sku.includes("sneak") || sku.includes("run"))
    return SUBCATEGORY_IMAGES.running_shoes;
  if (sku.includes("bag") || sku.includes("back"))
    return SUBCATEGORY_IMAGES.backpacks;
  if (sku.includes("laptop"))
    return SUBCATEGORY_IMAGES.laptop_bags;
  if (sku.includes("watch"))
    return SUBCATEGORY_IMAGES.watches;
  if (sku.includes("wallet"))
    return SUBCATEGORY_IMAGES.wallets;
  if (sku.includes("shirt") || sku.includes("tee"))
    return SUBCATEGORY_IMAGES.t_shirts;
  if (sku.includes("jean") || sku.includes("denim"))
    return SUBCATEGORY_IMAGES.jeans;
  if (sku.includes("jacket"))
    return SUBCATEGORY_IMAGES.jackets;
  if (sku.includes("glass") || sku.includes("sun"))
    return SUBCATEGORY_IMAGES.sunglasses;
  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop";
}

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productBrand: string;
  variantSku: string;
  quantity: number;
  price: number;
  mrp: number;
  subtotal: number;
  attributes: Record<string, string>;
}

interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  savings: number;
  itemCount: number;
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  const fetchCart = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.push("/login?returnTo=/cart");
      return;
    }
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart`, { headers: authHeaders() });
      if (res.status === 401) { router.push("/login?returnTo=/cart"); return; }
      const data = await res.json();
      setCart(data);
    } catch {
      setError("Could not load cart.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchCart(); }, [fetchCart]);

  const handleUpdateQty = async (itemId: string, newQty: number) => {
    if (newQty < 1) return handleRemove(itemId);
    setUpdatingItem(itemId);
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ quantity: newQty }),
      });
      if (res.ok) setCart(await res.json());
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    setUpdatingItem(itemId);
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart/items/${itemId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) setCart(await res.json());
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleCheckout = async () => {
    setCheckingOut(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND}/api/v1/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.policy?.summary ?? data.error ?? "Checkout failed.");
        return;
      }
      router.push(`/pay/${data.checkoutId}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  };

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  /* ─── Empty ─── */
  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="min-h-screen bg-[#f5f5f3]">

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-[900px] mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-black transition-colors text-[13px] font-medium">
            <ArrowLeft size={15} />
            Store
          </Link>
          <span className="text-gray-200">/</span>
          <div className="flex items-center gap-2 flex-1">
            <ShoppingBag size={15} className="text-gray-400" />
            <p className="text-gray-900 text-[14px] font-bold">Your Cart</p>
            {!isEmpty && (
              <span className="text-gray-400 text-[12px]">
                · {cart.itemCount} item{cart.itemCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-8">

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-center">
            <div className="w-20 h-20 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-sm">
              <ShoppingBag size={32} className="text-gray-200" />
            </div>
            <p className="text-gray-900 text-[18px] font-black">Your cart is empty</p>
            <p className="text-gray-400 text-[14px] max-w-[280px] leading-relaxed">
              Browse the store or ask Urban AI to find something for you.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <Link href="/"
                className="px-5 py-2.5 bg-black text-white text-[13px] font-bold rounded-xl hover:bg-gray-800 transition-colors">
                Browse Store
              </Link>
              <Link href="/?ai=1"
                className="px-5 py-2.5 bg-white border border-gray-200 text-black text-[13px] font-bold rounded-xl hover:border-black transition-colors flex items-center gap-1.5">
                Ask AI
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">

            {/* Items list */}
            <div className="space-y-3">
              {cart.items.map((item) => {
                const isUpdating = updatingItem === item.id;
                const discount = item.mrp > item.price
                  ? Math.round(((item.mrp - item.price) / item.mrp) * 100)
                  : 0;

                return (
                  <div key={item.id} className={`bg-white rounded-2xl border border-gray-100 p-4 flex gap-4 transition-opacity ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}>

                    {/* Image */}
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
                      <Image
                        src={getProductImage(item)}
                        alt={item.productName}
                        fill
                        className="object-cover"
                        unoptimized
                        sizes="80px"
                      />
                      {discount > 0 && (
                        <span className="absolute top-1 left-1 bg-black text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                          {discount}%
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.productBrand}</p>
                      <p className="text-gray-900 text-[14px] font-semibold leading-snug mt-0.5 line-clamp-2">{item.productName}</p>
                      <p className="text-gray-400 text-[12px] mt-0.5">
                        {Object.values(item.attributes).join(" · ")}
                      </p>

                      <div className="flex items-center justify-between mt-3">
                        {/* Price */}
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-gray-900 text-[15px] font-black">{fmt(item.price)}</span>
                          {item.mrp > item.price && (
                            <span className="text-gray-400 text-[11px] line-through">{fmt(item.mrp)}</span>
                          )}
                        </div>

                        {/* Qty controls + remove */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                            <button
                              onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-black"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-6 text-center text-[13px] font-bold text-gray-900">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white hover:shadow-sm transition-all text-gray-500 hover:text-black"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Continue shopping */}
              <Link href="/"
                className="flex items-center gap-2 text-[13px] text-gray-400 hover:text-black transition-colors font-medium pt-2">
                <ArrowLeft size={14} />
                Continue shopping
              </Link>
            </div>

            {/* Order summary */}
            <div className="sticky top-[72px] space-y-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <p className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-4">Order Summary</p>

                <div className="space-y-2.5 mb-4">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-500">Subtotal ({cart.itemCount} items)</span>
                    <span className="text-gray-900 font-semibold">{fmt(cart.subtotal + cart.savings)}</span>
                  </div>
                  {cart.savings > 0 && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-green-600 flex items-center gap-1.5">
                        <Tag size={12} />
                        Discount
                      </span>
                      <span className="text-green-600 font-semibold">− {fmt(cart.savings)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[13px]">
                    <span className="text-gray-500">Delivery</span>
                    <span className="text-green-600 font-semibold">Free</span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 mb-4 flex justify-between items-center">
                  <span className="text-gray-900 text-[15px] font-bold">Total</span>
                  <span className="text-gray-900 text-[22px] font-black">{fmt(cart.subtotal)}</span>
                </div>

                {cart.savings > 0 && (
                  <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
                    <Tag size={13} className="text-green-600 flex-shrink-0" />
                    <p className="text-green-700 text-[12px] font-semibold">
                      You save {fmt(cart.savings)} on this order!
                    </p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mb-3">
                    <p className="text-red-600 text-[12px]">{error}</p>
                  </div>
                )}

                {/* Checkout button */}
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="w-full py-3.5 bg-black text-white text-[14px] font-black rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {checkingOut
                    ? <><Loader2 size={16} className="animate-spin" /> Creating order…</>
                    : <><Lock size={15} /> Proceed to Payment <ArrowRight size={15} /></>
                  }
                </button>

                <div className="flex items-center justify-center gap-1.5 mt-3">
                  <ShieldCheck size={12} className="text-gray-400" />
                  <span className="text-gray-400 text-[11px]">Secured by Razorpay · Test mode</span>
                </div>
              </div>

              {/* AI suggestion */}
              <div className="bg-black rounded-2xl p-4">
                <p className="text-[#c8f04b] text-[12px] font-bold mb-1.5 flex items-center gap-1.5">
                  <span className="text-base">⚡</span> Urban AI can help
                </p>
                <p className="text-gray-400 text-[12px] leading-relaxed mb-3">
                  Not sure about your cart? Ask AI to suggest alternatives or find better deals.
                </p>
                <Link href="/?ai=1"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-white/10 hover:bg-white/15 text-white text-[12px] font-semibold rounded-xl transition-colors">
                  Open Urban AI
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
