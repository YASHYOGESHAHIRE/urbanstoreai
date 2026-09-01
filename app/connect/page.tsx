"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Copy, Check, ExternalLink, Zap,
  ShoppingCart, Search, Package, CreditCard,
  ChevronRight, RefreshCw, Eye, EyeOff, Key,
} from "lucide-react";
import { authHeaders, getStoredToken } from "@/lib/auth";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default function ConnectPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  const mcpUrl = apiKey ? `${BACKEND}/mcp?key=${apiKey}` : null;

  const fetchApiKey = async () => {
    const token = getStoredToken();
    if (!token) { setNotLoggedIn(true); setLoading(false); return; }
    try {
      const res = await fetch(`${BACKEND}/auth/api-key`, { headers: authHeaders() });
      if (res.status === 401) { setNotLoggedIn(true); return; }
      const data = await res.json();
      setApiKey(data.apiKey);
    } catch {
      setNotLoggedIn(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApiKey(); }, []);

  const handleRegenerate = async () => {
    if (!confirm("This will invalidate your current MCP URL. You will need to update your Claude connector. Continue?")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`${BACKEND}/auth/api-key/regenerate`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      setApiKey(data.apiKey);
      setShowKey(true);
    } finally {
      setRegenerating(false);
    }
  };

  const copyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const copyUrl = () => {
    if (!mcpUrl) return;
    navigator.clipboard.writeText(mcpUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const maskedKey = apiKey
    ? apiKey.slice(0, 12) + "••••••••••••••••••••••" + apiKey.slice(-4)
    : null;

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
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
            <Zap size={28} className="text-[#c8f04b]" fill="#c8f04b" />
          </div>
          <h1 className="text-gray-900 text-[28px] font-black tracking-tight mb-3">
            Shop with Claude
          </h1>
          <p className="text-gray-500 text-[15px] leading-relaxed max-w-[420px] mx-auto">
            Connect Urban Store to Claude and let AI browse, add to cart, and checkout on your behalf.
          </p>
        </div>

        {/* Not logged in state */}
        {notLoggedIn && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center mb-6">
            <Key size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-900 text-[15px] font-bold mb-1">Login required</p>
            <p className="text-gray-400 text-[13px] mb-5">You need to be logged in to get your API key.</p>
            <Link href="/login?returnTo=/connect"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-[13px] font-bold rounded-xl hover:bg-gray-800 transition-colors">
              Log in to Urban Store
            </Link>
          </div>
        )}

        {/* Loading */}
        {loading && !notLoggedIn && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* API Key section */}
        {apiKey && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-900 text-[14px] font-bold">Your MCP URL</p>
                <p className="text-gray-400 text-[12px] mt-0.5">Paste this into Claude as your connector URL</p>
              </div>
              <button onClick={handleRegenerate} disabled={regenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-[12px] text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors font-medium disabled:opacity-50">
                <RefreshCw size={11} className={regenerating ? "animate-spin" : ""} />
                Regenerate
              </button>
            </div>

            {/* MCP URL — this is what goes into Claude */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">MCP Server URL</p>
              <div className="flex items-center gap-3">
                <code className="text-gray-700 text-[12px] flex-1 break-all font-mono leading-relaxed">
                  {BACKEND}/mcp?key={showKey ? apiKey : maskedKey}
                </code>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => setShowKey(!showKey)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors text-gray-400">
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={copyUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-[12px] font-bold rounded-lg hover:bg-gray-800 transition-colors">
                    {copiedUrl ? <Check size={12} /> : <Copy size={12} />}
                    {copiedUrl ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            {/* API key separately */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <Key size={13} className="text-gray-400 flex-shrink-0" />
              <code className="text-gray-500 text-[11px] flex-1 font-mono">
                {showKey ? apiKey : maskedKey}
              </code>
              <button onClick={copyKey}
                className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg text-[11px] text-gray-500 hover:border-gray-400 transition-colors flex-shrink-0">
                {copiedKey ? <Check size={10} /> : <Copy size={10} />}
                {copiedKey ? "Copied" : "Copy key"}
              </button>
            </div>

            <p className="text-amber-600 text-[11px] mt-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              Keep this URL private — it gives access to your Urban Store account.
            </p>
          </div>
        )}

        {/* Steps */}
        {!notLoggedIn && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <p className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-5">How to connect</p>

            {/* Step 1 */}
            <div className="flex gap-4 mb-6">
              <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">1</div>
              <div className="flex-1">
                <p className="text-gray-900 text-[14px] font-semibold mb-1">Copy your MCP URL above</p>
                <p className="text-gray-400 text-[12px]">Click the <strong className="text-gray-600">Copy</strong> button next to your MCP URL. It includes your personal API key.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4 mb-6">
              <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">2</div>
              <div className="flex-1">
                <p className="text-gray-900 text-[14px] font-semibold mb-1">Open Claude Integrations</p>
                <p className="text-gray-400 text-[12px] mb-3">Go to claude.ai → Settings → Integrations → Add custom integration.</p>
                <a href="https://claude.ai/settings/integrations" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#c8f04b] text-black text-[13px] font-bold rounded-xl hover:bg-[#b8e03b] transition-colors">
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
                <p className="text-gray-400 text-[12px] mb-3">Paste the MCP URL you copied. Then set:</p>
                <div className="space-y-2">
                  {[
                    { label: "Authentication", value: "None" },
                    { label: "Transport", value: "Streamable HTTP" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-black flex-shrink-0" />
                      <span className="text-gray-500 text-[12px]">{label}:</span>
                      <span className="text-gray-900 text-[12px] font-bold">{value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-400 text-[12px] mt-2">Then click <strong className="text-gray-700">Add</strong>.</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="w-7 h-7 bg-black text-white rounded-full flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5">4</div>
              <div className="flex-1">
                <p className="text-gray-900 text-[14px] font-semibold mb-1">Done — no login popup needed</p>
                <p className="text-gray-400 text-[12px]">Your API key is baked into the URL. Claude will start shopping immediately with no OAuth flow.</p>
              </div>
            </div>
          </div>
        )}

        {/* Try it */}
        {!notLoggedIn && (
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
        )}

        {/* What Claude can do */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <p className="text-gray-900 text-[13px] font-bold uppercase tracking-wider mb-4">What Claude can do</p>
          <div className="space-y-3">
            {[
              { icon: Search,       label: "Search the catalogue",   desc: "Find products by natural language, budget, occasion" },
              { icon: ShoppingCart, label: "Manage your cart",        desc: "Add, remove, view items and totals" },
              { icon: Package,      label: "View your orders",        desc: "Check order status and history" },
              { icon: CreditCard,   label: "Create checkout",         desc: "Initiate payment — always asks your confirmation first" },
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

        {/* Security note */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-amber-800 text-[13px] font-bold mb-1">Your security</p>
          <p className="text-amber-700 text-[12px] leading-relaxed">
            Your API key is personal — never share it publicly. If compromised, click <strong>Regenerate</strong> above to invalidate it and get a new one. Checkout always requires your explicit YES confirmation before any payment is initiated.
          </p>
        </div>

      </div>
    </div>
  );
}
