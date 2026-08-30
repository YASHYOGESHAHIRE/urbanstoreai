"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Send, Mic, Zap, Loader2, ChevronDown, ChevronRight,
  Terminal, Wrench, RotateCcw, ExternalLink, Search, ShoppingCart,
} from "lucide-react";
import { authHeaders } from "@/lib/auth";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ReasoningStep {
  type: "thinking" | "tool_call" | "tool_result" | "final_response";
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  content?: string;
  iteration: number;
  durationMs?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductCard = Record<string, any>;

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  time: string;
  reasoning?: ReasoningStep[];
  products?: ProductCard[];
  totalDurationMs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTime() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

let sessionId: string | null = null;

const SUBCATEGORY_IMAGES: Record<string, string> = {
  running_shoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop",
  casual_shoes: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=300&h=300&fit=crop",
  formal_shoes: "https://images.unsplash.com/photo-1614252369475-531eba835eb1?w=300&h=300&fit=crop",
  laptop_bags: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=300&fit=crop",
  backpacks: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=300&h=300&fit=crop",
  travel_bags: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&h=300&fit=crop",
  t_shirts: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=300&h=300&fit=crop",
  shirts: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=300&h=300&fit=crop",
  jeans: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=300&h=300&fit=crop",
  jackets: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=300&h=300&fit=crop",
  watches: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=300&h=300&fit=crop",
  wallets: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=300&h=300&fit=crop",
  sunglasses: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=300&h=300&fit=crop",
  gifting: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=300&h=300&fit=crop",
};

function getProductImage(p: ProductCard): string {
  const subId = p.subcategoryId ?? "";
  return SUBCATEGORY_IMAGES[subId] ?? p.image ?? "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop";
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  search_products: Search,
  get_product: ExternalLink,
  add_to_cart: ShoppingCart,
  get_cart: ShoppingCart,
  create_checkout: ShoppingCart,
  get_availability: ExternalLink,
};

const TOOL_LABELS: Record<string, string> = {
  search_products: "Searching products",
  get_product: "Getting product details",
  add_to_cart: "Adding to cart",
  get_cart: "Checking cart",
  create_checkout: "Creating checkout",
  get_availability: "Checking availability",
  update_cart_item: "Updating cart",
  remove_from_cart: "Removing from cart",
};

const SUGGESTED = [
  "Find me a minimal laptop bag under ₹3,000",
  "Something for rainy weather outdoors",
  "Gift ideas for someone who travels a lot",
  "Formal office wear under ₹2,000",
];

// ─── Perplexity-style reasoning block ─────────────────────────────────────────

function ReasoningBlock({ steps, isLoading }: { steps: ReasoningStep[]; isLoading?: boolean }) {
  const [open, setOpen] = useState(true);

  const toolCalls = steps.filter((s) => s.type === "tool_call");
  const uniqueTools = [...new Set(toolCalls.map((s) => s.toolName ?? ""))].filter(Boolean);

  // Summary line — like Perplexity "Searched 3 sources"
  const summary = uniqueTools.length > 0
    ? uniqueTools.map((t) => TOOL_LABELS[t] ?? t).join(" · ")
    : "Thinking…";

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl w-full text-left hover:border-[#2a2a2a] transition-colors group"
      >
        {isLoading ? (
          <Loader2 size={13} className="animate-spin text-[#555] flex-shrink-0" />
        ) : (
          <Zap size={13} className="text-[#c8f04b] flex-shrink-0" fill="#c8f04b" />
        )}
        <span className="text-[12px] text-[#666] flex-1 truncate">
          {isLoading ? "Thinking…" : summary}
        </span>
        {!isLoading && (
          open
            ? <ChevronDown size={13} className="text-[#444] flex-shrink-0" />
            : <ChevronRight size={13} className="text-[#444] flex-shrink-0" />
        )}
      </button>

      {open && !isLoading && steps.length > 0 && (
        <div className="mt-1 ml-3 border-l border-[#1e1e1e] pl-3 space-y-2 py-1">
          {steps.map((step, i) => {
            const ToolIcon = step.toolName ? (TOOL_ICONS[step.toolName] ?? Wrench) : Wrench;

            if (step.type === "thinking" && step.content) {
              return (
                <div key={i} className="text-[11px] text-[#555] leading-relaxed italic">
                  {step.content}
                </div>
              );
            }

            if (step.type === "tool_call") {
              return (
                <ToolCallStep key={i} step={step} ToolIcon={ToolIcon} />
              );
            }

            if (step.type === "tool_result") {
              return (
                <ToolResultStep key={i} step={step} />
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}

function ToolCallStep({ step, ToolIcon }: { step: ReasoningStep; ToolIcon: React.ElementType }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[step.toolName ?? ""] ?? step.toolName ?? "Tool";

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-[#555] hover:text-[#aaa] transition-colors"
      >
        <ToolIcon size={11} className="text-yellow-500/70 flex-shrink-0" />
        <span>{label}</span>
        {step.durationMs && <span className="text-[#333] text-[10px]">{step.durationMs}ms</span>}
        {open ? <ChevronDown size={10} className="text-[#333]" /> : <ChevronRight size={10} className="text-[#333]" />}
      </button>
      {open && step.toolArgs && (
        <pre className="mt-1 ml-4 text-[10px] text-[#555] bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-2 overflow-x-auto leading-relaxed">
          {JSON.stringify(step.toolArgs, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultStep({ step }: { step: ReasoningStep }) {
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = step.toolResult as any;

  // Compact summary
  let summary = "";
  if (result?.products) summary = `${result.products.length} products found`;
  else if (result?.id) summary = `Got: ${result.name ?? result.id}`;
  else if (result?.items) summary = `Cart: ${result.items.length} items`;
  else if (result?.error) summary = `Error: ${result.error}`;
  else summary = "Result received";

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-green-500/60 hover:text-green-400 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500/40 flex-shrink-0" />
        <span>{summary}</span>
        {step.durationMs && <span className="text-[#333] text-[10px]">{step.durationMs}ms</span>}
        {open ? <ChevronDown size={10} className="text-[#333]" /> : <ChevronRight size={10} className="text-[#333]" />}
      </button>
      {open && (
        <pre className="mt-1 ml-4 text-[10px] text-[#444] bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-2 overflow-x-auto leading-relaxed max-h-[200px]">
          {JSON.stringify(step.toolResult, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Product card for dev agent ───────────────────────────────────────────────

function DevProductCard({ product }: { product: ProductCard }) {
  const img = getProductImage(product);
  const price = product.price ?? 0;
  const mrp = product.mrp ?? price;
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const avail = product.availability ?? "in_stock";

  return (
    <div className="flex-shrink-0 w-[160px] bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl overflow-hidden hover:border-[#2a2a2a] transition-colors group">
      <div className="relative h-[110px] bg-[#111] overflow-hidden">
        <Image src={img} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized sizes="160px" />
        {discount > 0 && (
          <span className="absolute top-2 left-2 bg-[#c8f04b] text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">
            {discount}% OFF
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-[9px] font-bold tracking-widest text-[#444] uppercase mb-0.5 truncate">{product.brand}</p>
        <p className="text-white text-[12px] font-semibold leading-tight line-clamp-2 mb-1.5">{product.name}</p>
        <p className="text-white text-[13px] font-black">₹{price.toLocaleString("en-IN")}</p>
        {mrp > price && <p className="text-[#333] text-[10px] line-through">₹{mrp.toLocaleString("en-IN")}</p>}
        <p className={`text-[9px] font-semibold mt-1 mb-2.5 ${avail === "in_stock" ? "text-green-400" : avail === "low_stock" ? "text-amber-400" : "text-red-400"}`}>
          {avail === "in_stock" ? "In stock" : avail === "low_stock" ? "Low stock" : "Out of stock"}
        </p>
        <Link href={`/product/${product.id}`}
          className="flex items-center justify-center gap-1 w-full py-1.5 bg-[#1a1a1a] hover:bg-[#c8f04b] hover:text-black text-[#888] text-[10px] font-semibold rounded-lg transition-colors">
          <ExternalLink size={9} />
          View
        </Link>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DevAgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", text: text.trim(), time: getTime() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setHasStarted(true);

    // Add a placeholder AI message to show reasoning spinner immediately
    const placeholderId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, {
      id: placeholderId, role: "ai", text: "", time: getTime(), reasoning: [],
    }]);

    const t0 = Date.now();
    try {
      const res = await fetch(`${BACKEND}/api/v1/agent/chat/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: text.trim(), sessionId: sessionId ?? undefined }),
      });

      const data = await res.json();
      if (data.sessionId) sessionId = data.sessionId;

      const totalMs = Date.now() - t0;

      setMessages((prev) => prev.map((m) =>
        m.id === placeholderId
          ? { ...m, text: data.reply ?? data.error ?? "Something went wrong.", reasoning: data.reasoning ?? [], products: data.products ?? [], totalDurationMs: totalMs }
          : m
      ));
    } catch {
      setMessages((prev) => prev.map((m) =>
        m.id === placeholderId
          ? { ...m, text: "Cannot reach the backend. Make sure it is running on port 4000.", reasoning: [] }
          : m
      ));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading]);

  const handleClear = () => {
    setMessages([]);
    setHasStarted(false);
    sessionId = null;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-[#1a1a1a] bg-[#0e0e0e] flex-shrink-0">
        <div className="max-w-[760px] mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-[#555] hover:text-white transition-colors text-[13px]">
            <ArrowLeft size={15} />
            Store
          </Link>
          <div className="w-px h-4 bg-[#222]" />
          <div className="flex items-center gap-2 flex-1">
            <Terminal size={14} className="text-[#c8f04b]" />
            <span className="text-white text-[14px] font-bold">Dev AI Agent</span>
            <span className="px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full text-[10px] text-[#555] font-mono">debug</span>
          </div>
          <button onClick={handleClear}
            className="flex items-center gap-1.5 px-3 h-7 border border-[#2a2a2a] rounded-full text-[11px] text-[#555] hover:border-[#444] hover:text-[#aaa] transition-colors">
            <RotateCcw size={11} />
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-w-[760px] w-full mx-auto px-6 py-8">
        {!hasStarted && (
          <div className="flex flex-col items-center gap-8 pt-12">
            <div className="text-center">
              <div className="w-14 h-14 bg-[#111] border border-[#1e1e1e] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Terminal size={24} className="text-[#c8f04b]" />
              </div>
              <h1 className="text-[22px] font-bold text-white mb-2">Dev AI Agent</h1>
              <p className="text-[#555] text-[14px]">Same agent, full reasoning trace visible</p>
            </div>
            <div className="w-full grid grid-cols-2 gap-2">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 bg-[#111] border border-[#1e1e1e] rounded-xl text-[13px] text-[#888] hover:border-[#c8f04b]/40 hover:text-white transition-all leading-snug">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {messages.map((msg, msgIdx) => (
            <div key={msg.id}>
              {/* User message */}
              {msg.role === "user" && (
                <div className="flex justify-end mb-2">
                  <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
                    <p className="text-white text-[14px] leading-relaxed">{msg.text}</p>
                  </div>
                </div>
              )}

              {/* AI message */}
              {msg.role === "ai" && (
                <div className="space-y-3">
                  {/* Reasoning block — Perplexity style */}
                  {(loading && msgIdx === messages.length - 1 && !msg.text) ? (
                    <ReasoningBlock steps={[]} isLoading />
                  ) : msg.reasoning && msg.reasoning.length > 0 ? (
                    <ReasoningBlock steps={msg.reasoning} />
                  ) : null}

                  {/* Product cards */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                      {msg.products.map((p) => (
                        <DevProductCard key={p.id} product={p} />
                      ))}
                    </div>
                  )}

                  {/* Final answer */}
                  {msg.text && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 bg-[#c8f04b] rounded-full flex items-center justify-center flex-shrink-0">
                          <Zap size={10} className="text-black" fill="black" />
                        </div>
                        <span className="text-[#c8f04b] text-[11px] font-bold">Urban AI</span>
                        <span className="text-[#333] text-[10px]">{msg.time}</span>
                        {msg.totalDurationMs && (
                          <span className="text-[#2a2a2a] text-[10px]">{msg.totalDurationMs}ms</span>
                        )}
                      </div>
                      <p className="text-[#ddd] text-[14px] leading-relaxed whitespace-pre-wrap pl-7">
                        {msg.text}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Input bar — fixed at bottom */}
      <div className="border-t border-[#1a1a1a] bg-[#0e0e0e] flex-shrink-0 py-4">
        <div className="max-w-[760px] mx-auto px-6">
          <div className="flex items-center gap-2 bg-[#111] border border-[#1e1e1e] rounded-2xl px-4 py-3 focus-within:border-[#2a2a2a] transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
              placeholder="Ask Urban AI anything…"
              disabled={loading}
              className="flex-1 bg-transparent text-white placeholder-[#444] text-[14px] outline-none disabled:opacity-50"
            />
            <button className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-[#888] transition-colors">
              <Mic size={15} />
            </button>
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
              className="w-7 h-7 bg-[#c8f04b] rounded-xl flex items-center justify-center hover:bg-[#b8e03b] transition-colors disabled:opacity-40">
              <Send size={13} className="text-black" />
            </button>
          </div>
          <p className="text-[#222] text-[10px] text-center mt-2">
            Full reasoning trace · Tool calls · Raw results · Model: llama-3.3-70b-versatile
          </p>
        </div>
      </div>
    </div>
  );
}
