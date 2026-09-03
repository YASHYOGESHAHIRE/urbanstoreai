"use client";

import { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  X, Minus, Plus, Trash2, Lock,
  Loader2, ShoppingBag, ArrowRight, Tag, ShieldCheck,
} from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useRouter } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

const SUBCATEGORY_IMAGES: Record<string, string> = {
  running_shoes:  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&h=200&fit=crop",
  casual_shoes:   "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=200&h=200&fit=crop",
  formal_shoes:   "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=200&h=200&fit=crop",
  laptop_bags:    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200&h=200&fit=crop",
  backpacks:      "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=200&h=200&fit=crop",
  travel_bags:    "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&h=200&fit=crop",
  t_shirts:       "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200&h=200&fit=crop",
  shirts:         "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200&h=200&fit=crop",
  jeans:          "https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=200&fit=crop",
  jackets:        "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=200&h=200&fit=crop",
  watches:        "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=200&h=200&fit=crop",
  wallets:        "https://images.unsplash.com/photo-1627123424574-724758594e93?w=200&h=200&fit=crop",
  sunglasses:     "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=200&h=200&fit=crop",
};

function getImg(sku: string): string {
  const s = sku.toLowerCase();
  if (s.includes("shoe") || s.includes("run") || s.includes("sneak")) return SUBCATEGORY_IMAGES.running_shoes;
  if (s.includes("casual")) return SUBCATEGORY_IMAGES.casual_shoes;
  if (s.includes("formal")) return SUBCATEGORY_IMAGES.formal_shoes;
  if (s.includes("laptop")) return SUBCATEGORY_IMAGES.laptop_bags;
  if (s.includes("back"))   return SUBCATEGORY_IMAGES.backpacks;
  if (s.includes("bag") || s.includes("travel")) return SUBCATEGORY_IMAGES.travel_bags;
  if (s.includes("tee") || s.includes("tshirt")) return SUBCATEGORY_IMAGES.t_shirts;
  if (s.includes("shirt"))  return SUBCATEGORY_IMAGES.shirts;
  if (s.includes("jean"))   return SUBCATEGORY_IMAGES.jeans;
  if (s.includes("jacket")) return SUBCATEGORY_IMAGES.jackets;
  if (s.includes("watch"))  return SUBCATEGORY_IMAGES.watches;
  if (s.includes("wallet")) return SUBCATEGORY_IMAGES.wallets;
  if (s.includes("glass"))  return SUBCATEGORY_IMAGES.sunglasses;
  return "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop";
}

export interface CartItem {
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

export interface CartData {
  id: string;
  items: CartItem[];
  subtotal: number;
  savings: number;
  itemCount: number;
}

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  cart: CartData | null;
  loading: boolean;
  updatingItem: string | null;
  onUpdateQty: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  onCheckout: () => void;
  checkingOut: boolean;
  checkoutError: string;
}

export default function CartDrawer({
  open, onClose, cart, loading,
  updatingItem, onUpdateQty, onRemove,
  onCheckout, checkingOut, checkoutError,
}: CartDrawerProps) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleCheckout = useCallback(async () => {
    onCheckout();
  }, [onCheckout]);

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-[60] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-[420px] max-w-full bg-white z-[70] flex flex-col shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <ShoppingBag size={18} className="text-gray-700" />
            <span className="text-[15px] font-bold text-gray-900">Your Cart</span>
            {!isEmpty && (
              <span className="w-5 h-5 bg-black text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {cart.itemCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : isEmpty ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center pb-16">
              <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center">
                <ShoppingBag size={32} className="text-gray-200" />
              </div>
              <p className="text-gray-900 text-[16px] font-black">Your cart is empty</p>
              <p className="text-gray-400 text-[13px] leading-relaxed">
                Browse the store or ask Urban AI to find something for you.
              </p>
              <div className="flex gap-3 mt-1">
                <button onClick={onClose}
                  className="px-4 py-2 bg-black text-white text-[12px] font-bold rounded-xl hover:bg-gray-800 transition-colors">
                  Browse Store
                </button>
              </div>
            </div>
          ) : (
            /* Item list */
            <div className="px-5 py-4 space-y-3">
              {cart.items.map((item) => {
                const isUpdating = updatingItem === item.id;
                const discount = item.mrp > item.price
                  ? Math.round(((item.mrp - item.price) / item.mrp) * 100)
                  : 0;

                return (
                  <div key={item.id}
                    className={`flex gap-3 p-3 bg-gray-50 rounded-2xl border border-gray-100 transition-opacity ${isUpdating ? "opacity-40 pointer-events-none" : ""}`}>

                    {/* Image */}
                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white flex-shrink-0">
                      <Image src={getImg(item.variantSku)} alt={item.productName}
                        fill className="object-cover" unoptimized sizes="64px" />
                      {discount > 0 && (
                        <span className="absolute top-0.5 left-0.5 bg-black text-white text-[8px] font-black px-1 py-0.5 rounded-full leading-none">
                          {discount}%
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{item.productBrand}</p>
                      <p className="text-gray-900 text-[13px] font-semibold leading-snug line-clamp-2 mt-0.5">{item.productName}</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">
                        {Object.values(item.attributes).join(" · ")}
                      </p>

                      <div className="flex items-center justify-between mt-2">
                        {/* Price */}
                        <div className="flex items-baseline gap-1">
                          <span className="text-gray-900 text-[14px] font-black">{fmt(item.price)}</span>
                          {item.mrp > item.price && (
                            <span className="text-gray-400 text-[10px] line-through">{fmt(item.mrp)}</span>
                          )}
                        </div>

                        {/* Qty + Remove */}
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <button onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500 hover:text-black">
                              <Minus size={11} />
                            </button>
                            <span className="w-6 text-center text-[12px] font-bold text-gray-900">{item.quantity}</span>
                            <button onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500 hover:text-black">
                              <Plus size={11} />
                            </button>
                          </div>
                          <button onClick={() => onRemove(item.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — order summary + checkout */}
        {!loading && !isEmpty && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-white">

            {/* Savings */}
            {cart.savings > 0 && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                <Tag size={13} className="text-green-600 flex-shrink-0" />
                <p className="text-green-700 text-[12px] font-semibold">
                  You save {fmt(cart.savings)} on this order
                </p>
              </div>
            )}

            {/* Totals */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-gray-500">Subtotal ({cart.itemCount} items)</span>
                <span className="text-gray-700">{fmt(cart.subtotal + cart.savings)}</span>
              </div>
              {cart.savings > 0 && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-green-600">Discount</span>
                  <span className="text-green-600">− {fmt(cart.savings)}</span>
                </div>
              )}
              <div className="flex justify-between text-[13px]">
                <span className="text-gray-500">Delivery</span>
                <span className="text-green-600 font-semibold">Free</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-gray-100">
                <span className="text-gray-900 font-bold text-[14px]">Total</span>
                <span className="text-gray-900 font-black text-[20px]">{fmt(cart.subtotal)}</span>
              </div>
            </div>

            {/* Error */}
            {checkoutError && (
              <p className="text-red-500 text-[12px] bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {checkoutError}
              </p>
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

            <div className="flex items-center justify-center gap-1.5">
              <ShieldCheck size={12} className="text-gray-400" />
              <span className="text-gray-400 text-[11px]">Secured by Razorpay · Test mode</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
