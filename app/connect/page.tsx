"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Copy, Check, ExternalLink, Zap,
  ShoppingCart, Search, Package, CreditCard, ChevronRight,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const MCP_URL = `${BACKEND}/mcp`;

export default function ConnectPage() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f3] flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[680px] mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-gray-400 hover:text-black transition-colors text-[13px] font-medium">
            <ArrowLeft size={15} />
            Store
          </Link>
          <span className="text-gray-200">/</span>
          <p className="text-gray-900 text-[14px] font-bold">Connect Claude</p>
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-6 py-12 flex-1 w-full">

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
            <Zap size={28} className="text-[#c8f04b]" fill="#c8f04b" />
          </div>
          <h1 className="text-gray-900 text-[28px] font-black tracking-tight mb-3">
            Shop with Claude
          </h1>
          <p className="text-gray-500 text-[15px] leading-relaxed max-w-[420px] mx-auto">
            Connect Urban Store to Claude and let AI browse, add to cart, and checkout on your behalf — just by chatting.
          </p>
        </div>

        {/* What Claude can do */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <p className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-4">What Claude can do</p>
          <div className="space-y-3">
            {[
              { icon: Search,       label: "Search the catalogue",          desc: "Find products by natural language, budget, occasion" },
              { icon: ShoppingCart, label: "Manage your cart",              desc: "Add, remove, view items and totals" },
              { icon: Package,      label: "View your orders",              desc: "Check order status and history" },
              { icon: CreditCard,   label: "Create checkout",               desc: "Initiate payment — always asks your confirmation first" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={14} className="text-gray-500" />
                </div>
                <div>
                  <p className="text-gray-900 text-[13px] font-semibold">{label}</p>
                  <p className="text-gray-400 text-[12px]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <p className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-5">How to connect</p>

          {/* Step 1 */}
          <div className="flex gap-4 mb-6">
            <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">1</div>
            <div className="flex-1">
              <p className="text-gray-900 text-[14px] font-semibold mb-1">Copy the MCP server URL</p>
              <p className="text-gray-400 text-[12px] mb-3">This is your personal Urban Store MCP endpoint.</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <code className="text-gray-700 text-[12px] flex-1 break-all font-mono">{MCP_URL}</code>
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-[12px] font-bold rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4 mb-6">
            <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">2</div>
            <div className="flex-1">
              <p className="text-gray-900 text-[14px] font-semibold mb-1">Open Claude and add a connector</p>
              <p className="text-gray-400 text-[12px] mb-3">Go to claude.ai → Settings → Integrations → Add custom integration.</p>
              <a
                href="https://claude.ai/settings/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#c8f04b] text-black text-[13px] font-bold rounded-xl hover:bg-[#b8e03b] transition-colors"
              >
                Open Claude Integrations
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4 mb-6">
            <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">3</div>
            <div className="flex-1">
              <p className="text-gray-900 text-[14px] font-semibold mb-1">Paste the URL and configure</p>
              <p className="text-gray-400 text-[12px] mb-3">Paste the URL above, then set these options exactly:</p>
              <div className="space-y-2">
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-black mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-gray-900 text-[12px] font-bold">Authentication</p>
                    <p className="text-gray-500 text-[12px]">Select <strong className="text-black">Always required</strong></p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-black mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-gray-900 text-[12px] font-bold">OAuth client</p>
                    <p className="text-gray-500 text-[12px]">Select <strong className="text-black">Use Anthropic&apos;s hosted client metadata</strong> (Recommended)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-black mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-gray-900 text-[12px] font-bold">Transport</p>
                    <p className="text-gray-500 text-[12px]">Leave as <strong className="text-black">Streamable HTTP</strong></p>
                  </div>
                </div>
              </div>
              <p className="text-gray-400 text-[12px] mt-3">Then click <strong className="text-gray-700">Add</strong>.</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">4</div>
            <div className="flex-1">
              <p className="text-gray-900 text-[14px] font-semibold mb-1">Authorise Urban Store</p>
              <p className="text-gray-400 text-[12px]">
                Claude will open a popup. Log in to Urban Store and click <strong className="text-gray-700">Allow</strong>. Done — Claude can now shop for you.
              </p>
            </div>
          </div>
        </div>

        {/* Try it */}
        <div className="bg-black rounded-2xl p-6 mb-6">
          <p className="text-[#c8f04b] text-[13px] font-bold uppercase tracking-wider mb-3">Try these prompts in Claude</p>
          <div className="space-y-2">
            {[
              "Search Urban Store for a laptop bag under ₹3,000",
              "What's in my Urban Store cart?",
              "Find me running shoes and add the best one to my cart",
              "Show my last order from Urban Store",
            ].map((prompt) => (
              <div key={prompt} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                <ChevronRight size={13} className="text-[#c8f04b] flex-shrink-0" />
                <p className="text-white text-[13px] font-mono">&ldquo;{prompt}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>

        {/* Security note */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-amber-800 text-[13px] font-bold mb-1">Your security</p>
          <p className="text-amber-700 text-[12px] leading-relaxed">
            Claude uses OAuth — it never sees your Urban Store password. You can revoke access anytime from Claude Settings → Integrations. Checkout always requires your explicit YES confirmation before any payment is initiated.
          </p>
        </div>

      </div>
    </div>
  );
}
