"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  X, Send, Mic, Zap, Loader2, ShoppingCart, ExternalLink,
  Check, AlertTriangle, CreditCard, ShieldCheck, Lock,
  TrendingUp, ChevronDown, ChevronRight, Receipt,
} from "lucide-react";
import { saveAuditEntries, appendAuditEntry, newAuditSession, AuditEntry } from "@/lib/auditStore";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductData = Record<string, any>;

interface ExplainBlock {
  understood: {
    category?: string;
    budget?: string;
    style?: string[];
    context?: string[];
    intent?: string;
  };
  search: {
    query: string;
    filters: Record<string, unknown>;
    resultsFound: number;
    withinBudget?: number;
    semanticMatches?: number;
  };
}

interface CartItem {
  id: string;
  productName: string;
  attributes: Record<string, string>;
  quantity: number;
  price: number;
  subtotal: number;
}

interface CartData {
  id: string;
  items: CartItem[];
  subtotal: number;
  savings: number;
  itemCount: number;
}

interface CheckoutData {
  checkoutId: string;
  subtotal: number;
  razorpayOrderId: string;
  razorpayKeyId: string;
  requiresConfirmation: boolean;
  policyWarnings: { message: string }[];
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  time: string;
  explain?: ExplainBlock;
  products?: ProductData[];
  upsells?: ProductData[];
  cart?: CartData;
  confirmGate?: { cart: CartData };
  checkout?: CheckoutData;
  orderConfirmed?: { orderId: string; total: number };
  paymentFailed?: { reason: string; checkoutId: string };
}

interface AIPanelProps {
  onClose: () => void;
  initialQuery?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let sessionId: string | null = null;
const CART_VALUE_LIMIT = 10000;

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function getTime() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const SUBCATEGORY_IMAGES: Record<string, string> = {
  running_shoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop",
  casual_shoes: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400&h=400&fit=crop",
  formal_shoes: "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=400&h=400&fit=crop",
  laptop_bags: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop",
  backpacks: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=400&h=400&fit=crop",
  travel_bags: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&h=400&fit=crop",
  travel_accessories: "https://images.unsplash.com/photo-1473188588951-666fce8e7c68?w=400&h=400&fit=crop",
  t_shirts: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&h=400&fit=crop",
  shirts: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=400&fit=crop",
  jeans: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop",
  jackets: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=400&fit=crop",
  dresses: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=400&fit=crop",
  watches: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&h=400&fit=crop",
  watch_straps: "https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=400&h=400&fit=crop",
  wallets: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=400&h=400&fit=crop",
  belts: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop",
  sunglasses: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400&h=400&fit=crop",
  gifting: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=400&fit=crop",
};

function getImg(p: ProductData): string {
  if (p.image?.startsWith("http")) return p.image;
  return SUBCATEGORY_IMAGES[(p.subcategoryId ?? "").toLowerCase()]
    ?? "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop";
}

const SUGGESTED = [
  "Modern watch for office under ₹5,000",
  "Laptop bags under ₹3,000",
  "Trail running shoes",
  "Gift ideas under ₹1,000",
];

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as Record<string, unknown>).Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─── Explainability steps component ──────────────────────────────────────────

function ExplainSteps({ explain }: { explain: ExplainBlock }) {
  const [open, setOpen] = useState(true);
  const { understood, search } = explain;

  const steps = [
    understood.category && { label: "Category", value: understood.category },
    understood.budget   && { label: "Budget",   value: understood.budget   },
    ...(understood.style?.map(s => ({ label: "Style",   value: s })) ?? []),
    ...(understood.context?.map(c => ({ label: "Context", value: c })) ?? []),
  ].filter(Boolean) as { label: string; value: string }[];

  // For non-search queries (orders, upsell, gifting) show simpler intent
  const isSimple = search.resultsFound === 0 && steps.length === 0;
  const isOrderQuery = search.query === "order history";

  return (
    <div className="rounded-2xl overflow-hidden border border-[#2a2a2a] bg-[#161616]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="w-5 h-5 rounded-full bg-[#c8f04b]/10 flex items-center justify-center flex-shrink-0">
          <Zap size={11} className="text-[#c8f04b]" fill="#c8f04b" />
        </div>
        <span className="text-[#c8f04b] text-[12px] font-semibold flex-1">
          {isOrderQuery ? "Looking up your orders" :
           isSimple     ? "Processing your request" :
                          "Understanding your request"}
        </span>
        {open
          ? <ChevronDown size={13} className="text-[#444]" />
          : <ChevronRight size={13} className="text-[#444]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#1e1e1e] pt-3">
          {/* Understood block — only when we have parsed fields */}
          {steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                    <Check size={9} className="text-green-400" />
                  </div>
                  <span className="text-[#777] text-[13px] min-w-[64px]">{step.label}:</span>
                  <span className="text-white text-[13px] font-semibold">{step.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Simple intent — when no structured parsing */}
          {isSimple && understood.intent && (
            <div className="flex items-start gap-3">
              <div className="w-4 h-4 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check size={9} className="text-blue-400" />
              </div>
              <span className="text-[#aaa] text-[13px] italic">&ldquo;{understood.intent}&rdquo;</span>
            </div>
          )}

          {/* Divider — only when we have search stats to show */}
          {search.resultsFound > 0 && <div className="border-t border-[#222]" />}

          {/* Search stats */}
          {search.resultsFound > 0 && (
            <div className="space-y-2">
              <p className="text-[#555] text-[11px] font-semibold uppercase tracking-wider">
                {isOrderQuery ? "Order history" : "Searching Urban Store"}
              </p>
              <div className="space-y-1.5">
                {[
                  { text: `${search.resultsFound} ${isOrderQuery ? "orders found" : "products found"}`, color: "text-[#888]" },
                  search.withinBudget !== undefined && {
                    text: `${search.withinBudget} within budget`,
                    color: "text-[#aaa]",
                  },
                  !isOrderQuery && search.semanticMatches !== undefined && {
                    text: `${search.semanticMatches} strong semantic matches`,
                    color: "text-[#c8f04b]",
                  },
                ]
                  .filter(Boolean)
                  .map((item, i) => {
                    const it = item as { text: string; color: string };
                    return (
                      <div key={i} className="flex items-center gap-2.5">
                        <span className="text-[#444] text-[13px] font-mono flex-shrink-0">→</span>
                        <span className={`${it.color} text-[13px]`}>{it.text}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {!isOrderQuery && search.resultsFound > 0 && (
            <p className="text-[#555] text-[12px] italic">
              Shortlisting the best {Math.min(search.resultsFound, 3)} for you…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Product card — larger, more readable ────────────────────────────────────

function ProductCard({ product, onAdd, adding }: {
  product: ProductData;
  onAdd: (p: ProductData) => void;
  adding: boolean;
}) {
  const price = product.price ?? 0;
  const mrp = product.mrp ?? price;
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const avail = product.availability ?? "in_stock";
  const inStock = avail !== "out_of_stock";

  return (
    <div className="bg-[#161616] border border-[#272727] rounded-2xl overflow-hidden flex flex-col hover:border-[#333] transition-colors group">
      {/* Image */}
      <div className="relative aspect-square bg-[#1e1e1e] overflow-hidden">
        <Image
          src={getImg(product)} alt={product.name} fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          unoptimized sizes="150px"
        />
        {discount > 0 && (
          <span className="absolute top-2 left-2 bg-[#c8f04b] text-black text-[10px] font-black px-2 py-0.5 rounded-full">
            {discount}% OFF
          </span>
        )}
        {!inStock && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-red-400 text-[11px] font-bold">Out of stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-[10px] font-bold tracking-widest text-[#555] uppercase mb-1">{product.brand}</p>
        <p className="text-white text-[13px] font-semibold leading-snug line-clamp-2 mb-2 flex-1">{product.name}</p>

        {/* Price */}
        <div className="mb-1">
          <span className="text-white text-[15px] font-black">{fmt(price)}</span>
          {mrp > price && (
            <span className="text-[#444] text-[11px] line-through ml-1.5">{fmt(mrp)}</span>
          )}
        </div>

        {/* Availability */}
        <p className={`text-[11px] font-medium mb-3 ${
          avail === "in_stock" ? "text-green-400" :
          avail === "low_stock" ? "text-amber-400" : "text-red-400"
        }`}>
          {avail === "in_stock" ? "● In stock" :
           avail === "low_stock" ? "● Low stock" : "● Out of stock"}
        </p>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onAdd(product)}
            disabled={!inStock || adding}
            className={`flex-1 py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${
              !inStock
                ? "bg-[#1a1a1a] text-[#333] cursor-not-allowed border border-[#222]"
                : adding
                ? "bg-[#c8f04b]/50 text-black cursor-wait"
                : "bg-[#c8f04b] text-black hover:bg-[#b8e03b]"
            }`}
          >
            {adding ? <Loader2 size={12} className="animate-spin" /> : <ShoppingCart size={12} />}
            Add to Cart
          </button>
          <Link
            href={`/product/${product.id}`} target="_blank"
            className="w-9 h-9 flex items-center justify-center bg-[#222] hover:bg-[#2a2a2a] rounded-xl transition-colors flex-shrink-0"
          >
            <ExternalLink size={13} className="text-[#777]" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Upsell strip ─────────────────────────────────────────────────────────────

function UpsellStrip({ products, onAdd, adding }: {
  products: ProductData[];
  onAdd: (p: ProductData) => void;
  adding: string | null;
}) {
  return (
    <div className="border border-[#c8f04b]/20 bg-[#0e0e0e] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={13} className="text-[#c8f04b]" />
        <p className="text-[#c8f04b] text-[12px] font-bold uppercase tracking-wide">
          Frequently bought together
        </p>
      </div>
      <div className="space-y-2.5">
        {products.slice(0, 2).map((p) => (
          <div key={p.id} className="flex items-center gap-3 bg-[#161616] border border-[#272727] rounded-xl p-2.5">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-[#222] flex-shrink-0">
              <Image src={getImg(p)} alt={p.name} fill className="object-cover" unoptimized sizes="48px" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-semibold leading-snug truncate">{p.name}</p>
              <p className="text-[#c8f04b] text-[13px] font-black mt-0.5">{fmt(p.price)}</p>
            </div>
            <button
              onClick={() => onAdd(p)}
              disabled={adding === p.id}
              className="h-8 px-3 bg-[#c8f04b] text-black text-[11px] font-bold rounded-lg hover:bg-[#b8e03b] transition-colors disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
            >
              {adding === p.id ? <Loader2 size={10} className="animate-spin" /> : <ShoppingCart size={10} />}
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cart summary ─────────────────────────────────────────────────────────────

function CartSummary({ cart, onCheckout, loading }: {
  cart: CartData;
  onCheckout: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-[#161616] border border-[#272727] rounded-2xl p-4">
      <p className="text-[#555] text-[11px] font-bold uppercase tracking-wider mb-3">Your Cart</p>
      {cart.items.map((item) => (
        <div key={item.id} className="flex items-start justify-between mb-2.5">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-white text-[14px] font-medium leading-snug">{item.productName}</p>
            <p className="text-[#555] text-[12px] mt-0.5">
              {Object.values(item.attributes).join(" · ")} × {item.quantity}
            </p>
          </div>
          <span className="text-white text-[14px] font-bold flex-shrink-0">{fmt(item.subtotal)}</span>
        </div>
      ))}
      <div className="border-t border-[#222] pt-3 mt-1 flex items-center justify-between mb-1">
        <span className="text-[#888] text-[14px]">Total</span>
        <span className="text-white text-[20px] font-black">{fmt(cart.subtotal)}</span>
      </div>
      {cart.savings > 0 && (
        <p className="text-green-400 text-[12px] mb-3">You save {fmt(cart.savings)}</p>
      )}
      <button
        onClick={onCheckout} disabled={loading}
        className="w-full py-3 mt-2 bg-[#c8f04b] text-black text-[14px] font-black rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
        Proceed to Payment
      </button>
    </div>
  );
}

// ─── Money gate ───────────────────────────────────────────────────────────────

function MoneyGate({ cart, onConfirm, onCancel, loading }: {
  cart: CartData;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="border-2 border-[#c8f04b]/40 bg-[#0e0e0e] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-[#c8f04b]/8 border-b border-[#c8f04b]/20">
        <Lock size={14} className="text-[#c8f04b]" />
        <p className="text-[#c8f04b] text-[13px] font-bold">Payment Confirmation Required</p>
      </div>

      <div className="px-4 py-4">
        <p className="text-[#555] text-[12px] font-semibold uppercase tracking-wider mb-3">
          Urban AI wants to charge
        </p>

        {cart.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-white text-[14px] font-medium">{item.productName}</p>
              <p className="text-[#555] text-[12px] mt-0.5">
                {Object.values(item.attributes).join(" · ")} × {item.quantity}
              </p>
            </div>
            <span className="text-white text-[14px] font-bold">{fmt(item.subtotal)}</span>
          </div>
        ))}

        <div className="border-t border-[#1e1e1e] pt-3 flex items-center justify-between mb-4">
          <span className="text-[#777] text-[14px]">Total charge</span>
          <span className="text-white text-[24px] font-black">{fmt(cart.subtotal)}</span>
        </div>

        {cart.subtotal > CART_VALUE_LIMIT && (
          <div className="flex items-start gap-2.5 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 mb-4">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300 text-[13px]">
              This order exceeds ₹10,000. Please review carefully before confirming.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={14} className="text-green-400" />
          <span className="text-[#666] text-[12px]">Secured by Razorpay · Test mode</span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-[#333] text-[#888] text-[13px] font-semibold rounded-xl hover:border-[#555] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm} disabled={loading}
            className="flex-1 py-2.5 bg-[#c8f04b] text-black text-[13px] font-black rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            Confirm & Pay
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment gate ─────────────────────────────────────────────────────────────

function PaymentGate({ checkout, onSuccess, onFailure }: {
  checkout: CheckoutData;
  onSuccess: (paymentId: string, orderId: string, signature: string) => void;
  onFailure: (reason: string) => void;
}) {
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    setPaying(true);
    const loaded = await loadRazorpay();
    if (!loaded) { onFailure("Failed to load payment gateway."); setPaying(false); return; }

    const keyId = checkout.razorpayKeyId || RAZORPAY_KEY;
    if (!keyId) { onFailure("Payment not configured."); setPaying(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay({
      key: keyId,
      amount: checkout.subtotal * 100,
      currency: "INR",
      name: "Urban Store",
      description: `Order ${checkout.checkoutId.slice(-8)}`,
      order_id: checkout.razorpayOrderId,
      theme: { color: "#c8f04b" },
      handler: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        onSuccess(r.razorpay_payment_id, r.razorpay_order_id, r.razorpay_signature);
      },
      modal: { ondismiss: () => { onFailure("Payment cancelled."); setPaying(false); } },
    });
    rzp.open();
  };

  return (
    <div className="bg-[#161616] border border-[#272727] rounded-2xl p-4">
      {checkout.policyWarnings?.length > 0 && (
        <div className="mb-4 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
          {checkout.policyWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-300 text-[13px]">{w.message}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[#777] text-[14px]">Order total</span>
        <span className="text-white text-[22px] font-black">{fmt(checkout.subtotal)}</span>
      </div>
      <button
        onClick={handlePay} disabled={paying}
        className="w-full py-3.5 bg-[#c8f04b] text-black text-[14px] font-black rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {paying ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
        Pay {fmt(checkout.subtotal)} with Razorpay
      </button>
      <p className="text-[#333] text-[11px] text-center mt-2">
        Test card: 4111 1111 1111 1111 · Any future date · Any CVV
      </p>
    </div>
  );
}

// ─── Order confirmed ──────────────────────────────────────────────────────────

function OrderConfirmed({ orderId, total }: { orderId: string; total: number }) {
  return (
    <div className="bg-green-900/20 border border-green-700/40 rounded-2xl p-5 text-center">
      <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
        <Check size={22} className="text-green-400" />
      </div>
      <p className="text-green-400 text-[16px] font-bold mb-1">Payment Successful!</p>
      <p className="text-[#888] text-[13px] mb-2">Order confirmed · {fmt(total)}</p>
      <p className="text-[#444] text-[11px] font-mono">{orderId}</p>
    </div>
  );
}

// ─── Payment failed ───────────────────────────────────────────────────────────

function PaymentFailed({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div className="bg-red-900/20 border border-red-700/40 rounded-2xl p-4">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-400 text-[14px] font-semibold">Payment Failed</p>
          <p className="text-[#888] text-[13px] mt-1">{reason}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="w-full py-2.5 border border-[#333] text-[#aaa] text-[13px] font-semibold rounded-xl hover:border-[#c8f04b] hover:text-white transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AIPanel({ onClose, initialQuery }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [addingProduct, setAddingProduct] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Send to agent ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", text: text.trim(), time: getTime() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setHasStarted(true);

    appendAuditEntry("USER_REQUEST", { message: text.trim() });

    try {
      const res = await fetch(`${BACKEND}/api/v1/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text.trim(), sessionId: sessionId ?? undefined }),
      });
      const data = await res.json();
      if (data.sessionId) sessionId = data.sessionId;

      // Save backend audit entries to localStorage
      if (data.audit?.length) {
        saveAuditEntries(data.audit as AuditEntry[]);
      }

      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        text: data.reply ?? "Something went wrong.",
        time: getTime(),
        explain: data.explain,
        products: data.products ?? [],
      }]);
    } catch (err) {
      appendAuditEntry("ERROR", { message: "Backend unreachable", error: String(err) });
      setMessages((prev) => [...prev, {
        id: Date.now().toString(), role: "ai",
        text: "Cannot reach the backend. Make sure it is running on port 4000.",
        time: getTime(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading]);

  useEffect(() => {
    if (initialQuery?.trim()) sendMessage(initialQuery.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // ─── Add to cart ────────────────────────────────────────────────────────────

  const handleAddToCart = useCallback(async (product: ProductData) => {
    setAddingProduct(product.id);
    appendAuditEntry("CART_ACTION", { action: "add_requested", productId: product.id, productName: product.name });

    const variant = product.variants?.find((v: { availability: string }) => v.availability === "in_stock")
      ?? product.variants?.[0];

    if (!variant) {
      appendAuditEntry("CART_ACTION", { action: "add_failed", error: "OUT_OF_STOCK", productName: product.name });
      setMessages((prev) => [...prev, {
        id: Date.now().toString(), role: "ai",
        text: `${product.name} is out of stock. Finding alternatives...`,
        time: getTime(),
      }]);
      setTimeout(() => sendMessage(`Find alternatives to ${product.name} in stock`), 800);
      setAddingProduct(null);
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/v1/cart/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: product.id, variantSku: variant.sku, quantity: 1 }),
      });

      if (!res.ok) {
        const err = await res.json();
        const reason = err.error ?? "Failed";
        appendAuditEntry("CART_ACTION", { action: "add_failed", error: reason, productName: product.name });
        setMessages((prev) => [...prev, {
          id: Date.now().toString(), role: "ai",
          text: reason === "OUT_OF_STOCK"
            ? `${product.name} just went out of stock. Finding alternatives...`
            : `Couldn't add to cart: ${reason}`,
          time: getTime(),
        }]);
        if (reason === "OUT_OF_STOCK") setTimeout(() => sendMessage(`Find alternatives to ${product.name} in stock`), 800);
        return;
      }

      const cart: CartData = await res.json();
      appendAuditEntry("CART_ACTION", { action: "added", productName: product.name, sku: variant.sku, cartTotal: cart.subtotal });

      // Get upsells silently
      let upsells: ProductData[] = [];
      try {
        const ur = await fetch(`${BACKEND}/api/v1/agent/chat`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: `get_upsell for ${product.id}`, sessionId: sessionId ?? undefined }),
        });
        const ud = await ur.json();
        if (ud.products?.length > 0) upsells = ud.products;
      } catch { /* optional */ }

      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: "ai",
        text: "Added to cart!",
        time: getTime(),
        cart,
        upsells: upsells.length > 0 ? upsells : undefined,
      }]);
    } catch (err) {
      appendAuditEntry("ERROR", { error: String(err) });
      setMessages((prev) => [...prev, {
        id: Date.now().toString(), role: "ai", text: "Network error. Please try again.", time: getTime(),
      }]);
    } finally {
      setAddingProduct(null);
    }
  }, [sendMessage]);

  // ─── Request checkout (show money gate) ────────────────────────────────────

  const handleRequestCheckout = useCallback(async () => {
    appendAuditEntry("POLICY", { event: "gate_shown", requiresConfirmation: true });
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/v1/cart`, { credentials: "include" });
      const cart: CartData = await res.json();
      if (!cart.items?.length) {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "ai", text: "Your cart is empty.", time: getTime() }]);
        return;
      }
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: "ai", text: "", time: getTime(),
        confirmGate: { cart },
      }]);
    } catch { /* ignore */ } finally {
      setCheckoutLoading(false);
    }
  }, []);

  // ─── Confirm → Razorpay order ───────────────────────────────────────────────

  const handleConfirmCheckout = useCallback(async (gateMessageId: string) => {
    setCheckoutLoading(true);
    appendAuditEntry("USER_CONFIRMATION", { action: "approved" });
    setMessages((prev) => prev.map((m) => m.id === gateMessageId ? { ...m, confirmGate: undefined } : m));

    try {
      const res = await fetch(`${BACKEND}/api/v1/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json();
        appendAuditEntry("ERROR", { event: "checkout_blocked", error: err.error, policy: err.policy?.summary });
        setMessages((prev) => [...prev, {
          id: Date.now().toString(), role: "ai",
          text: `Checkout blocked: ${err.policy?.summary ?? err.error}`, time: getTime(),
        }]);
        return;
      }

      const checkout: CheckoutData = await res.json();
      appendAuditEntry("RAZORPAY", {
        event: "order_created",
        razorpayOrderId: checkout.razorpayOrderId,
        total: checkout.subtotal,
      });

      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: "ai",
        text: "Complete your payment below.", time: getTime(), checkout,
      }]);
    } catch { /* ignore */ } finally {
      setCheckoutLoading(false);
    }
  }, []);

  const handleCancelGate = useCallback((gateMessageId: string) => {
    appendAuditEntry("USER_CONFIRMATION", { action: "cancelled" });
    setMessages((prev) => prev.map((m) => m.id === gateMessageId ? { ...m, confirmGate: undefined } : m));
    setMessages((prev) => [...prev, {
      id: Date.now().toString(), role: "ai", text: "Payment cancelled. Your cart is saved.", time: getTime(),
    }]);
  }, []);

  const handlePaymentSuccess = useCallback(async (
    paymentId: string, rzpOrderId: string, signature: string,
    checkoutId: string, total: number,
  ) => {
    appendAuditEntry("RAZORPAY", { event: "payment_captured", paymentId, razorpayOrderId: rzpOrderId, amount: total });

    try {
      const res = await fetch(`${BACKEND}/api/v1/checkout/${checkoutId}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ razorpayPaymentId: paymentId, razorpaySignature: signature }),
      });

      if (!res.ok) {
        const err = await res.json();
        appendAuditEntry("ERROR", { event: "order_confirm_failed", error: err.error });
        setMessages((prev) => prev.map((m) =>
          m.checkout?.checkoutId === checkoutId
            ? { ...m, checkout: undefined, paymentFailed: { reason: "Order confirmation failed. Contact support.", checkoutId } }
            : m
        ));
        return;
      }

      const order = await res.json();
      appendAuditEntry("RAZORPAY", { event: "order_confirmed", orderId: order.orderId, amount: order.total });
      setMessages((prev) => prev.map((m) =>
        m.checkout?.checkoutId === checkoutId
          ? { ...m, checkout: undefined, orderConfirmed: { orderId: order.orderId, total: order.total } }
          : m
      ));
    } catch { /* ignore */ }
  }, []);

  const handlePaymentFailure = useCallback((reason: string, checkoutId: string) => {
    appendAuditEntry("ERROR", { event: "payment_failed", reason });
    setMessages((prev) => prev.map((m) =>
      m.checkout?.checkoutId === checkoutId
        ? { ...m, checkout: undefined, paymentFailed: { reason, checkoutId } }
        : m
    ));
  }, []);

  const handleNewChat = () => {
    setMessages([]);
    setHasStarted(false);
    sessionId = null;
    newAuditSession();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed right-4 top-4 bottom-4 w-[440px] bg-[#111] rounded-2xl flex flex-col shadow-2xl z-50 overflow-hidden border border-[#222]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e1e1e] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#c8f04b] rounded-full flex items-center justify-center">
            <Zap size={16} className="text-black" fill="black" />
          </div>
          <div>
            <p className="text-white text-[14px] font-bold leading-tight">Urban AI</p>
            <p className="text-[#555] text-[11px]">Your shopping assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleNewChat}
            className="px-3 py-1 border border-[#333] rounded-full text-[12px] text-[#888] hover:border-[#555] hover:text-white transition-colors">
            New Chat
          </button>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1a1a1a] transition-colors">
            <X size={16} className="text-[#555]" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">

        {/* Empty state */}
        {!hasStarted && (
          <div className="h-full flex flex-col items-center justify-center gap-8 pb-4">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap size={26} className="text-[#c8f04b]" fill="#c8f04b" />
              </div>
              <p className="text-white text-[16px] font-bold mb-1.5">Ask Urban AI</p>
              <p className="text-[#555] text-[13px] leading-relaxed">
                Tell me what you&apos;re looking for.<br />I&apos;ll search the store for you.
              </p>
            </div>
            <div className="w-full space-y-2">
              <p className="text-[#444] text-[11px] font-semibold uppercase tracking-widest mb-3 text-center">
                Try asking
              </p>
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="w-full text-left px-4 py-3 bg-[#161616] border border-[#272727] rounded-xl text-[13px] text-[#aaa] hover:border-[#c8f04b] hover:text-white transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {hasStarted && (
          <div className="space-y-5">
            {messages.map((msg) => (
              <div key={msg.id}>

                {/* User message */}
                {msg.role === "user" && (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[#444] text-[11px]">You</span>
                      <span className="text-[#333] text-[11px]">{msg.time}</span>
                    </div>
                    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[320px]">
                      <p className="text-white text-[14px] leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                )}

                {/* AI message */}
                {msg.role === "ai" && (
                  <div className="space-y-3">
                    {/* Sender label */}
                    {(msg.text || msg.explain || msg.products?.length || msg.confirmGate || msg.checkout || msg.orderConfirmed || msg.paymentFailed) && (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-[#c8f04b] rounded-full flex items-center justify-center flex-shrink-0">
                          <Zap size={10} className="text-black" fill="black" />
                        </div>
                        <span className="text-[#c8f04b] text-[12px] font-semibold">Urban AI</span>
                        <span className="text-[#333] text-[11px]">{msg.time}</span>
                      </div>
                    )}

                    {/* ── Explainability steps ── */}
                    {msg.explain && <ExplainSteps explain={msg.explain} />}

                    {/* ── 3 product cards ── */}
                    {msg.products && msg.products.length > 0 && (
                      <div className="grid grid-cols-3 gap-2.5">
                        {msg.products.slice(0, 3).map((p) => (
                          <ProductCard key={p.id} product={p}
                            onAdd={handleAddToCart} adding={addingProduct === p.id} />
                        ))}
                      </div>
                    )}

                    {/* ── AI text reply ── */}
                    {msg.text && (
                      <div className="bg-[#161616] border border-[#272727] rounded-2xl rounded-tl-sm px-4 py-3 max-w-[400px]">
                        <p className="text-[#e0e0e0] text-[14px] leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </p>
                      </div>
                    )}

                    {/* ── Upsell ── */}
                    {msg.upsells && msg.upsells.length > 0 && (
                      <UpsellStrip products={msg.upsells} onAdd={handleAddToCart} adding={addingProduct} />
                    )}

                    {/* ── Cart summary ── */}
                    {msg.cart && (
                      <CartSummary cart={msg.cart} onCheckout={handleRequestCheckout} loading={checkoutLoading} />
                    )}

                    {/* ── Money gate ── */}
                    {msg.confirmGate && (
                      <MoneyGate
                        cart={msg.confirmGate.cart} loading={checkoutLoading}
                        onConfirm={() => handleConfirmCheckout(msg.id)}
                        onCancel={() => handleCancelGate(msg.id)}
                      />
                    )}

                    {/* ── Razorpay payment ── */}
                    {msg.checkout && (
                      <PaymentGate checkout={msg.checkout}
                        onSuccess={(pId, rId, sig) =>
                          handlePaymentSuccess(pId, rId, sig, msg.checkout!.checkoutId, msg.checkout!.subtotal)
                        }
                        onFailure={(reason) => handlePaymentFailure(reason, msg.checkout!.checkoutId)} />
                    )}

                    {/* ── Order confirmed ── */}
                    {msg.orderConfirmed && (
                      <OrderConfirmed orderId={msg.orderConfirmed.orderId} total={msg.orderConfirmed.total} />
                    )}

                    {/* ── Payment failed ── */}
                    {msg.paymentFailed && (
                      <PaymentFailed reason={msg.paymentFailed.reason} onRetry={handleRequestCheckout} />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-[#c8f04b] rounded-full flex items-center justify-center">
                    <Zap size={10} className="text-black" fill="black" />
                  </div>
                  <span className="text-[#c8f04b] text-[12px] font-semibold">Urban AI</span>
                </div>
                <div className="bg-[#161616] border border-[#272727] rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-[#c8f04b]" />
                  <span className="text-[#666] text-[13px]">Searching Urban Store…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Footer / Input ── */}
      <div className="px-5 py-4 border-t border-[#1e1e1e] flex-shrink-0 bg-[#0e0e0e]">
        <div className="flex items-center gap-2.5 bg-[#161616] border border-[#272727] rounded-xl px-4 py-2.5 focus-within:border-[#333] transition-colors mb-3">
          <input
            ref={inputRef} type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            placeholder="What are you looking for?"
            disabled={loading}
            className="flex-1 bg-transparent text-white placeholder-[#444] text-[14px] outline-none disabled:opacity-50"
          />
          <button className="flex-shrink-0 text-[#444] hover:text-[#777] transition-colors">
            <Mic size={16} />
          </button>
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="w-8 h-8 bg-[#c8f04b] rounded-lg flex items-center justify-center hover:bg-[#b8e03b] transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Send size={14} className="text-black" />
          </button>
        </div>

        {/* Audit link */}
        <Link
          href="/audit"
          target="_blank"
          className="flex items-center justify-center gap-2 w-full py-2 border border-[#1e1e1e] rounded-xl text-[#444] text-[11px] hover:border-[#333] hover:text-[#888] transition-colors"
        >
          <Receipt size={12} />
          View Audit Trail
        </Link>
      </div>
    </div>
  );
}
