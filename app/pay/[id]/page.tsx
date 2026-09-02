"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CreditCard, AlertTriangle, Check, Lock, ShieldCheck } from "lucide-react";
import { authHeaders, getStoredToken } from "@/lib/auth";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

interface CheckoutData {
  id: string;
  subtotal: number;
  razorpayOrderId: string;
  razorpayKeyId?: string;
  status: string;
  cart?: {
    items: {
      id: string;
      variantSku: string;
      quantity: number;
      priceSnapshot: number;
      product?: { name: string; brand: string };
      variant?: { attributes: Record<string, string> };
    }[];
  };
}

export default function PayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    // Redirect to login if not authenticated
    const token = getStoredToken();
    if (!token) {
      router.push(`/login?returnTo=/pay/${id}`);
      return;
    }

    fetch(`${BACKEND}/api/v1/checkout/${id}`, {
      headers: authHeaders(),
    })
      .then((r) => {
        if (r.status === 401) {
          router.push(`/login?returnTo=/pay/${id}`);
          return null;
        }
        if (!r.ok) throw new Error("Checkout not found");
        return r.json();
      })
      .then((data) => {
        if (data) setCheckout(data);
      })
      .catch(() => setError("Could not load checkout. It may have expired or already been paid."))
      .finally(() => setLoading(false));
  }, [id, router]);

  const handlePay = async () => {
    if (!checkout) return;
    setPaying(true);

    const loaded = await loadRazorpay();
    if (!loaded) {
      setError("Failed to load payment gateway. Please try again.");
      setPaying(false);
      return;
    }

    const keyId = checkout.razorpayKeyId || RAZORPAY_KEY;
    if (!keyId) {
      setError("Payment not configured. Please contact support.");
      setPaying(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay({
      key: keyId,
      amount: checkout.subtotal * 100,
      currency: "INR",
      name: "Urban Store",
      description: `Order ${checkout.id.slice(-8)}`,
      order_id: checkout.razorpayOrderId,
      theme: { color: "#c8f04b" },
      handler: async (r: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const res = await fetch(`${BACKEND}/api/v1/checkout/${checkout.id}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySignature: r.razorpay_signature,
            }),
          });
          const data = await res.json();
          if (res.ok) {
            setSuccess(true);
            setOrderId(data.orderId);
          } else {
            setError(data.error ?? "Payment verification failed.");
          }
        } catch {
          setError("Could not confirm payment. Please contact support.");
        } finally {
          setPaying(false);
        }
      },
      modal: {
        ondismiss: () => setPaying(false),
      },
    });

    rzp.open();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-gray-400" />
          <span className="text-gray-500 text-[14px]">Loading your order…</span>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-10 max-w-sm w-full text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Check size={28} className="text-green-500" />
          </div>
          <h1 className="text-gray-900 text-[22px] font-black mb-2">Payment Successful!</h1>
          <p className="text-gray-500 text-[14px] mb-1">Your order has been confirmed.</p>
          <p className="text-gray-400 text-[12px] font-mono mb-6">{orderId}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 bg-black text-white text-[14px] font-bold rounded-xl hover:bg-gray-800 transition-colors"
          >
            Back to Store
          </button>
        </div>
      </div>
    );
  }

  if (error || !checkout) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center shadow-sm">
          <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-900 text-[16px] font-bold mb-2">Unable to load checkout</p>
          <p className="text-gray-500 text-[13px] mb-6">{error || "Checkout not found."}</p>
          <button onClick={() => router.push("/")}
            className="w-full py-2.5 border border-gray-200 rounded-xl text-[13px] text-gray-600 hover:border-gray-900 transition-colors font-medium">
            Back to Store
          </button>
        </div>
      </div>
    );
  }

  if (checkout.status === "paid") {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center shadow-sm">
          <Check size={28} className="text-green-500 mx-auto mb-3" />
          <p className="text-gray-900 text-[16px] font-bold mb-2">Already paid</p>
          <p className="text-gray-500 text-[13px] mb-6">This order has already been paid.</p>
          <button onClick={() => router.push("/")}
            className="w-full py-2.5 bg-black text-white rounded-xl text-[13px] font-bold hover:bg-gray-800 transition-colors">
            Back to Store
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full shadow-sm">

        {/* Header */}
        <div className="text-center mb-7">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard size={22} className="text-[#c8f04b]" />
          </div>
          <h1 className="text-gray-900 text-[20px] font-black">Complete Payment</h1>
          <p className="text-gray-400 text-[13px] mt-1">Urban Store · Secured by Razorpay</p>
        </div>

        {/* Order summary */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-gray-500 text-[11px] font-bold uppercase tracking-wider mb-3">Order Summary</p>
          {checkout.cart?.items?.map((item) => (
            <div key={item.id} className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 text-[13px] font-medium truncate">
                  {item.product?.name ?? item.variantSku}
                </p>
                <p className="text-gray-400 text-[12px]">
                  {item.variant?.attributes ? Object.values(item.variant.attributes).join(" · ") : ""} × {item.quantity}
                </p>
              </div>
              <span className="text-gray-900 text-[13px] font-bold ml-3 flex-shrink-0">
                {fmt(item.priceSnapshot * item.quantity)}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-3 mt-1 flex items-center justify-between">
            <span className="text-gray-600 text-[13px]">Total</span>
            <span className="text-gray-900 text-[20px] font-black">{fmt(checkout.subtotal)}</span>
          </div>
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck size={14} className="text-green-500" />
          <span className="text-gray-400 text-[12px]">Secured by Razorpay · Test mode</span>
        </div>

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={paying}
          className="w-full py-4 bg-[#c8f04b] text-black text-[15px] font-black rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {paying
            ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
            : <><Lock size={16} /> Pay {fmt(checkout.subtotal)}</>
          }
        </button>

        <p className="text-gray-300 text-[11px] text-center mt-3">
          Test card: 4111 1111 1111 1111 · Any future date · Any CVV
        </p>
      </div>
    </div>
  );
}
