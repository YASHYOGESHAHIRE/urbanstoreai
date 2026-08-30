"use client";

import { useEffect, useState } from "react";
import {
  Megaphone, Sparkles, Check, X, RefreshCw, Loader2,
  TrendingUp, AlertTriangle, Tag, Zap, Package,
  ChevronDown, ChevronRight, ArrowUpRight,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

interface Projection {
  withoutCampaign?: { unitsSold: number; revenue: number; timeframe: string };
  withCampaign?: { unitsSold: number; revenue: number; timeframe: string };
  netGain?: number;
  marginImpact?: string;
  confidence?: "high" | "medium" | "low";
  currentRevenue?: number;
  projectedRevenue?: number;
}

interface Campaign {
  id: string;
  type: string;
  status: string;
  productId?: string;
  title: string;
  trigger: string;
  proposedAction: Record<string, unknown>;
  reasoning: string[];
  projections: Projection;
  risks: string[];
  priority: number;
  createdAt: string;
}

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; dot: string; label: string }> = {
  CLEARANCE:  { icon: Tag,          color: "text-red-500",    dot: "bg-red-500",    label: "Clearance"   },
  BUNDLE:     { icon: Package,      color: "text-violet-500", dot: "bg-violet-500", label: "Bundle"      },
  URGENCY:    { icon: AlertTriangle,color: "text-amber-500",  dot: "bg-amber-500",  label: "Urgency"     },
  SEASONAL:   { icon: Sparkles,     color: "text-blue-500",   dot: "bg-blue-500",   label: "Seasonal"    },
  CROSS_SELL: { icon: TrendingUp,   color: "text-green-500",  dot: "bg-green-500",  label: "Cross-sell"  },
};

function getType(type: string) {
  return TYPE_CONFIG[type] ?? {
    icon: Megaphone, color: "text-gray-500", dot: "bg-gray-400", label: type,
  };
}

const CONFIDENCE: Record<string, { label: string; color: string }> = {
  high:   { label: "High confidence",   color: "text-green-600 bg-green-50 border-green-100"  },
  medium: { label: "Medium confidence", color: "text-amber-600 bg-amber-50 border-amber-100"  },
  low:    { label: "Low confidence",    color: "text-red-500   bg-red-50   border-red-100"    },
};

// ─── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onApprove, onDismiss, approving, dismissing }: {
  campaign: Campaign;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  approving: string | null;
  dismissing: string | null;
}) {
  const [open, setOpen] = useState(campaign.status === "pending");
  const cfg = getType(campaign.type);
  const Icon = cfg.icon;
  const pending = campaign.status === "pending";
  const p = campaign.projections;

  const netGain = p.netGain ?? (
    p.projectedRevenue !== undefined && p.currentRevenue !== undefined
      ? p.projectedRevenue - p.currentRevenue
      : null
  );
  const conf = p.confidence ?? "medium";

  return (
    <div className={`bg-white rounded-2xl border transition-shadow ${
      pending ? "border-gray-200 hover:shadow-md" : "border-gray-100 opacity-60"
    }`}>
      {/* Header row */}
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex items-start gap-4 p-6">
          <div className="w-10 h-10 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon size={17} className={cfg.color} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>
                {cfg.label}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                campaign.status === "pending"  ? "bg-amber-50 text-amber-600 border-amber-100" :
                campaign.status === "active"   ? "bg-green-50 text-green-600 border-green-100" :
                "bg-gray-50 text-gray-400 border-gray-100"
              }`}>
                {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
              </span>
              <span className="text-gray-300 text-[11px] ml-auto">Priority {campaign.priority}</span>
            </div>
            <p className="text-gray-900 text-[15px] font-bold leading-snug">{campaign.title}</p>
            <p className="text-gray-400 text-[12px] mt-1 line-clamp-1">{campaign.trigger}</p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
            {netGain !== null && netGain > 0 && (
              <div className="text-right hidden sm:block">
                <div className="flex items-center gap-1 text-green-600">
                  <ArrowUpRight size={13} />
                  <span className="text-[15px] font-black">{fmt(netGain)}</span>
                </div>
                <p className="text-gray-400 text-[10px]">est. gain</p>
              </div>
            )}
            {open
              ? <ChevronDown size={16} className="text-gray-300" />
              : <ChevronRight size={16} className="text-gray-300" />}
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-gray-100 px-6 py-5 space-y-6">

          {/* Proposed action chips */}
          <div>
            <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider mb-2.5">
              Proposed Action
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(campaign.proposedAction).map(([k, v]) => (
                <div key={k} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                  <span className="text-gray-400 text-[11px] capitalize">
                    {k.replace(/([A-Z])/g, " $1").trim()}:
                  </span>
                  <span className="text-gray-900 text-[12px] font-bold">
                    {typeof v === "number" && k.toLowerCase().includes("price") ? fmt(v as number)
                     : typeof v === "number" && k.toLowerCase().includes("pct") ? `${v}%`
                     : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider mb-2.5">
              Why This Works
            </p>
            <div className="space-y-2">
              {(Array.isArray(campaign.reasoning) ? campaign.reasoning : []).map((r, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-black flex-shrink-0 mt-1.5" />
                  <p className="text-gray-600 text-[13px] leading-relaxed">{r}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Projections */}
          <div>
            <div className="flex items-center gap-3 mb-2.5">
              <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                Revenue Projections
              </p>
              {CONFIDENCE[conf] && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE[conf].color}`}>
                  {CONFIDENCE[conf].label}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {p.withoutCampaign && (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-2">Without campaign</p>
                  <p className="text-gray-500 text-[18px] font-black">{fmt(p.withoutCampaign.revenue)}</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">{p.withoutCampaign.unitsSold} units · {p.withoutCampaign.timeframe}</p>
                </div>
              )}
              {p.withCampaign && (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                  <p className="text-green-500 text-[10px] uppercase tracking-wider font-semibold mb-2">With campaign</p>
                  <p className="text-green-700 text-[18px] font-black">{fmt(p.withCampaign.revenue)}</p>
                  <p className="text-green-500 text-[11px] mt-0.5">{p.withCampaign.unitsSold} units · {p.withCampaign.timeframe}</p>
                </div>
              )}
              {netGain !== null && netGain > 0 && (
                <div className="bg-black rounded-2xl p-4">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider font-semibold mb-2">Net gain</p>
                  <p className="text-[#c8f04b] text-[18px] font-black">{fmt(netGain)}</p>
                  {p.marginImpact && <p className="text-gray-500 text-[11px] mt-0.5">{p.marginImpact}</p>}
                </div>
              )}
              {/* Flat shape fallback */}
              {!p.withoutCampaign && p.currentRevenue !== undefined && (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-2">Current</p>
                  <p className="text-gray-500 text-[18px] font-black">{fmt(p.currentRevenue)}</p>
                </div>
              )}
              {!p.withCampaign && p.projectedRevenue !== undefined && (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                  <p className="text-green-500 text-[10px] uppercase tracking-wider font-semibold mb-2">Projected</p>
                  <p className="text-green-700 text-[18px] font-black">{fmt(p.projectedRevenue)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Risks */}
          {Array.isArray(campaign.risks) && campaign.risks.length > 0 && (
            <div>
              <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider mb-2.5">Risks</p>
              <div className="space-y-2">
                {campaign.risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <AlertTriangle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-gray-500 text-[13px] leading-relaxed">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {pending && (
            <div className="flex gap-3 pt-1 border-t border-gray-100">
              <button onClick={() => onDismiss(campaign.id)} disabled={dismissing === campaign.id}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-500 text-[13px] font-semibold rounded-xl hover:border-red-200 hover:text-red-500 transition-colors disabled:opacity-50">
                {dismissing === campaign.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                Dismiss
              </button>
              <button onClick={() => onApprove(campaign.id)} disabled={approving === campaign.id}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-black text-white text-[13px] font-bold rounded-xl hover:bg-gray-900 transition-colors disabled:opacity-50">
                {approving === campaign.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Approve & Activate
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const fetchCampaigns = async (status?: string) => {
    setLoading(true);
    try {
      const url = status && status !== "all"
        ? `${BACKEND}/api/v1/admin/campaigns?status=${status}`
        : `${BACKEND}/api/v1/admin/campaigns`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) { setError("Failed to load."); return; }
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch { setError("Cannot reach backend."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const handleGenerate = async () => {
    setGenerating(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/v1/admin/campaigns/generate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail ?? err.error ?? "Generation failed.");
        return;
      }
      await fetchCampaigns();
    } catch { setError("Cannot reach backend."); }
    finally { setGenerating(false); }
  };

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      await fetch(`${BACKEND}/api/v1/admin/campaigns/${id}/approve`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      await fetchCampaigns(filter !== "all" ? filter : undefined);
    } finally { setApproving(null); }
  };

  const handleDismiss = async (id: string) => {
    setDismissing(id);
    try {
      await fetch(`${BACKEND}/api/v1/admin/campaigns/${id}/dismiss`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      await fetchCampaigns(filter !== "all" ? filter : undefined);
    } finally { setDismissing(null); }
  };

  const pendingCount = campaigns.filter((c) => c.status === "pending").length;
  const activeCount  = campaigns.filter((c) => c.status === "active").length;

  return (
    <div className="p-8 max-w-[860px]">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-gray-900 text-[22px] font-black tracking-tight">Campaigns</h1>
          <p className="text-gray-400 text-[12px] mt-0.5">
            AI-generated campaign decisions based on live store data
          </p>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-2 px-5 py-2.5 bg-black text-white text-[13px] font-bold rounded-xl hover:bg-gray-900 transition-colors disabled:opacity-60">
          {generating
            ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
            : <><Sparkles size={14} /> Generate Decisions</>}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          <p className="text-red-600 text-[13px]">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Pending Review",   value: pendingCount,        color: "text-amber-600" },
          { label: "Active Campaigns", value: activeCount,         color: "text-green-600" },
          { label: "Total Generated",  value: campaigns.length,    color: "text-gray-900"  },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 text-center">
            <p className={`text-[24px] font-black ${s.color}`}>{s.value}</p>
            <p className="text-gray-400 text-[11px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        {["all", "pending", "active", "dismissed"].map((f) => (
          <button key={f} onClick={() => { setFilter(f); fetchCampaigns(f !== "all" ? f : undefined); }}
            className={`px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
              filter === f
                ? "bg-black text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:text-black hover:border-gray-900"
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={() => fetchCampaigns(filter !== "all" ? filter : undefined)}
          className="ml-auto p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-black hover:border-gray-900 transition-colors">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-[14px]">Loading campaigns…</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-sm">
            <Megaphone size={24} className="text-gray-300" />
          </div>
          <p className="text-gray-900 text-[16px] font-bold">No campaigns yet</p>
          <p className="text-gray-400 text-[13px] max-w-[280px]">
            Click "Generate Decisions" and the marketing agent will analyse your store data.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c}
              onApprove={handleApprove} onDismiss={handleDismiss}
              approving={approving} dismissing={dismissing} />
          ))}
        </div>
      )}
    </div>
  );
}
