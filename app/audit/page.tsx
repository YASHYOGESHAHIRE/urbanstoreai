"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Receipt, Trash2, RefreshCw,
  ShoppingCart, CreditCard, AlertTriangle,
  CheckCircle, MessageSquare, Search, Shield,
  Zap, User, Package,
} from "lucide-react";
import { loadAuditSession, loadAllSessions, clearAuditSession, AuditEntry, AuditSession } from "@/lib/auditStore";

// ─── Event config ─────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  USER_REQUEST:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50",    border: "border-blue-100",   label: "User Request"    },
  TOOL_CALL:         { icon: Search,        color: "text-amber-500",  bg: "bg-amber-50",   border: "border-amber-100",  label: "Tool Call"       },
  TOOL_RESULT:       { icon: CheckCircle,   color: "text-green-500",  bg: "bg-green-50",   border: "border-green-100",  label: "Tool Result"     },
  CART_ACTION:       { icon: ShoppingCart,  color: "text-violet-500", bg: "bg-violet-50",  border: "border-violet-100", label: "Cart Action"     },
  POLICY:            { icon: Shield,        color: "text-orange-500", bg: "bg-orange-50",  border: "border-orange-100", label: "Policy Check"    },
  USER_CONFIRMATION: { icon: User,          color: "text-gray-700",   bg: "bg-gray-50",    border: "border-gray-200",   label: "User Confirmed"  },
  RAZORPAY:          { icon: CreditCard,    color: "text-pink-500",   bg: "bg-pink-50",    border: "border-pink-100",   label: "Razorpay"        },
  ERROR:             { icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50",     border: "border-red-100",    label: "Error"           },
  AGENT_REPLY:       { icon: Zap,           color: "text-gray-900",   bg: "bg-gray-900",   border: "border-gray-900",   label: "Agent Reply"     },
  ORDER_CONFIRMED:   { icon: Package,       color: "text-green-500",  bg: "bg-green-50",   border: "border-green-100",  label: "Order Confirmed" },
};

function getConfig(event: string) {
  return EVENT_CONFIG[event] ?? {
    icon: Receipt, color: "text-gray-400", bg: "bg-gray-50", border: "border-gray-100", label: event,
  };
}

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

// ─── EventDetail ──────────────────────────────────────────────────────────────

function EventDetail({ event, detail }: { event: string; detail: Record<string, unknown> }) {
  const s = (v: unknown): string => String(v ?? "");
  const n = (v: unknown): number => Number(v ?? 0);

  const d = {
    message:         s(detail.message),
    tool:            s(detail.tool),
    productsFound:   detail.productsFound !== undefined ? s(detail.productsFound) : null,
    searchMode:      detail.searchMode    !== undefined ? s(detail.searchMode)    : null,
    cartTotal:       detail.cartTotal     !== undefined ? n(detail.cartTotal)     : null,
    total:           detail.total         !== undefined ? n(detail.total)         : null,
    error:           detail.error         !== undefined ? s(detail.error)         : null,
    productName:     detail.productName   !== undefined ? s(detail.productName)   : null,
    sku:             detail.sku           !== undefined ? s(detail.sku)           : null,
    warnings:        detail.warnings      !== undefined ? n(detail.warnings)      : null,
    requiresConfirm: !!detail.requiresConfirmation,
    action:          s(detail.action),
    ev:              s(detail.event),
    razorpayOrderId: detail.razorpayOrderId !== undefined ? s(detail.razorpayOrderId) : null,
    paymentId:       detail.paymentId     !== undefined ? s(detail.paymentId)     : null,
    orderId:         detail.orderId       !== undefined ? s(detail.orderId)       : null,
    amount:          detail.amount        !== undefined ? n(detail.amount)        : null,
    reason:          detail.reason        !== undefined ? s(detail.reason)        : null,
    policy:          detail.policy        !== undefined ? s(detail.policy)        : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args:            detail.args as any,
  };

  if (event === "USER_REQUEST") return (
    <p className="text-gray-900 text-[14px] font-medium">&ldquo;{d.message}&rdquo;</p>
  );

  if (event === "TOOL_CALL") return (
    <div>
      <p className="text-gray-900 text-[13px] font-semibold font-mono mb-2">{d.tool}</p>
      {d.args && Object.keys(d.args).length > 0 && (
        <pre className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto leading-relaxed">
          {JSON.stringify(d.args, null, 2)}
        </pre>
      )}
    </div>
  );

  if (event === "TOOL_RESULT") return (
    <div className="flex flex-wrap gap-2">
      {d.productsFound !== null && (
        <span className="px-2.5 py-1 bg-green-50 border border-green-100 rounded-full text-green-600 text-[12px] font-semibold">
          {d.productsFound} products found
        </span>
      )}
      {d.searchMode !== null && (
        <span className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full text-gray-500 text-[12px]">
          {d.searchMode} search
        </span>
      )}
      {d.cartTotal !== null && (
        <span className="px-2.5 py-1 bg-black text-white rounded-full text-[12px] font-bold">
          Cart: {fmt(d.cartTotal)}
        </span>
      )}
      {d.total !== null && (
        <span className="px-2.5 py-1 bg-black text-white rounded-full text-[12px] font-bold">
          {fmt(d.total)}
        </span>
      )}
      {d.error !== null && (
        <span className="px-2.5 py-1 bg-red-50 border border-red-100 rounded-full text-red-500 text-[12px]">
          {d.error}
        </span>
      )}
    </div>
  );

  if (event === "CART_ACTION") {
    const isError = d.action.includes("failed");
    return (
      <div>
        <p className={`text-[13px] font-semibold mb-1 ${isError ? "text-red-500" : "text-gray-900"}`}>
          {d.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </p>
        {d.productName !== null && <p className="text-gray-500 text-[13px]">{d.productName}</p>}
        {d.sku !== null && <p className="text-gray-400 text-[12px] font-mono mt-0.5">SKU: {d.sku}</p>}
        {d.cartTotal !== null && <p className="text-gray-900 text-[13px] font-bold mt-1">Cart total: {fmt(d.cartTotal)}</p>}
        {d.error !== null && <p className="text-red-500 text-[12px] mt-1">{d.error}</p>}
      </div>
    );
  }

  if (event === "POLICY") return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-[13px]">Confirmation required:</span>
        <span className={`text-[13px] font-bold ${d.requiresConfirm ? "text-orange-600" : "text-green-600"}`}>
          {d.requiresConfirm ? "YES" : "NO"}
        </span>
      </div>
      {d.warnings !== null && d.warnings > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-[13px]">Warnings:</span>
          <span className="text-amber-600 text-[13px] font-bold">{d.warnings}</span>
        </div>
      )}
      {d.total !== null && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-[13px]">Order total:</span>
          <span className="text-gray-900 text-[13px] font-bold">{fmt(d.total)}</span>
        </div>
      )}
    </div>
  );

  if (event === "USER_CONFIRMATION") {
    const approved = d.action === "approved";
    return (
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${approved ? "bg-green-100" : "bg-red-100"}`}>
          {approved
            ? <CheckCircle size={12} className="text-green-600" />
            : <AlertTriangle size={12} className="text-red-500" />}
        </div>
        <span className={`text-[14px] font-semibold ${approved ? "text-green-700" : "text-red-600"}`}>
          {approved ? "User approved payment" : "User cancelled payment"}
        </span>
      </div>
    );
  }

  if (event === "RAZORPAY") return (
    <div>
      <p className="text-gray-900 text-[13px] font-semibold mb-2">
        {d.ev.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
      </p>
      <div className="space-y-1">
        {d.razorpayOrderId !== null && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[12px]">Razorpay Order:</span>
            <span className="text-gray-600 text-[12px] font-mono">{d.razorpayOrderId}</span>
          </div>
        )}
        {d.paymentId !== null && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[12px]">Payment ID:</span>
            <span className="text-gray-600 text-[12px] font-mono">{d.paymentId}</span>
          </div>
        )}
        {d.orderId !== null && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[12px]">Order ID:</span>
            <span className="text-gray-900 text-[12px] font-mono font-bold">{d.orderId}</span>
          </div>
        )}
        {d.amount !== null && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[12px]">Amount:</span>
            <span className="text-gray-900 text-[14px] font-black">{fmt(d.amount)}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (event === "ERROR") return (
    <div>
      {d.ev && (
        <p className="text-red-600 text-[13px] font-semibold mb-1">
          {d.ev.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </p>
      )}
      {d.error !== null && <p className="text-red-500 text-[13px]">{d.error}</p>}
      {d.reason !== null && <p className="text-red-500 text-[13px]">{d.reason}</p>}
      {d.policy !== null && <p className="text-amber-600 text-[12px] mt-1">{d.policy}</p>}
    </div>
  );

  return (
    <pre className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto leading-relaxed">
      {JSON.stringify(detail, null, 2)}
    </pre>
  );
}

// ─── Audit row ────────────────────────────────────────────────────────────────

function AuditRow({ entry, index }: { entry: AuditEntry; index: number }) {
  const cfg = getConfig(entry.event);
  const Icon = cfg.icon;
  const isError = entry.event === "ERROR";

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${cfg.bg} ${cfg.border}`}>
          <Icon size={15} className={cfg.color} />
        </div>
        <div className="w-px flex-1 bg-gray-100 mt-2" />
      </div>

      <div className="flex-1 pb-6 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-gray-300 text-[10px]">{entry.timestamp}</span>
          {entry.durationMs !== undefined && (
            <span className="text-gray-300 text-[10px] ml-auto">{entry.durationMs}ms</span>
          )}
          <span className="text-gray-200 text-[10px]">#{index + 1}</span>
        </div>

        <div className={`rounded-2xl border p-4 ${isError ? "bg-red-50 border-red-100" : "bg-white border-gray-100"}`}>
          <EventDetail event={entry.event} detail={entry.detail} />
        </div>
      </div>
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ entries }: { entries: AuditEntry[] }) {
  const errors = entries.filter((e) => e.event === "ERROR").length;
  const toolCalls = entries.filter((e) => e.event === "TOOL_CALL").length;
  const cartActions = entries.filter((e) => e.event === "CART_ACTION").length;
  const razorpay = entries.filter((e) => e.event === "RAZORPAY");
  const payment = razorpay.find((e) => e.detail.event === "payment_captured" || e.detail.event === "order_confirmed");
  const total = payment?.detail.amount ?? payment?.detail.total;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {[
        { label: "Total Events",   value: String(entries.length), color: "text-gray-900" },
        { label: "Tool Calls",     value: String(toolCalls),      color: "text-amber-600" },
        { label: "Cart Actions",   value: String(cartActions),    color: "text-violet-600" },
        {
          label: errors > 0 ? "Errors" : total ? "Order Total" : "Errors",
          value: errors > 0 ? String(errors) : total ? fmt(Number(total)) : "0",
          color: errors > 0 ? "text-red-500" : total ? "text-gray-900" : "text-gray-300",
        },
      ].map((s) => (
        <div key={s.label} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
          <p className={`text-[24px] font-black ${s.color}`}>{s.value}</p>
          <p className="text-gray-400 text-[11px] font-medium mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [allSessions, setAllSessions] = useState<AuditSession[]>([]);
  const [session, setSession] = useState<AuditSession | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [dbLoaded, setDbLoaded] = useState(false);

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

  const refresh = async () => {
    // Always load localStorage sessions
    const sessions = loadAllSessions();
    setAllSessions(sessions);
    setSession((prev) => {
      if (prev) {
        const updated = sessions.find((s) => s.sessionId === prev.sessionId);
        return updated ?? sessions[sessions.length - 1] ?? null;
      }
      return sessions[sessions.length - 1] ?? null;
    });

    // Also try to fetch persistent DB logs and merge into current session
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("urban_token") : null;
      if (!token) return;
      const res = await fetch(`${BACKEND}/auth/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const dbLogs: AuditEntry[] = data.logs ?? [];
      if (dbLogs.length === 0) return;

      // Merge DB logs into a synthetic "DB" session
      setDbLoaded(true);
      const dbSession: AuditSession = {
        sessionId: "db_persistent",
        startedAt: dbLogs[0]?.timestamp ?? new Date().toISOString(),
        entries: dbLogs,
      };
      setAllSessions((prev) => {
        const filtered = prev.filter((s) => s.sessionId !== "db_persistent");
        return [...filtered, dbSession];
      });
    } catch { /* DB fetch is optional */ }
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("urban_audit_update", handler);
    window.addEventListener("urban_audit_sessions_update", handler);
    return () => {
      window.removeEventListener("urban_audit_update", handler);
      window.removeEventListener("urban_audit_sessions_update", handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = session?.entries ?? [];
  const eventTypes = ["ALL", ...Array.from(new Set(entries.map((e) => e.event)))];
  const filtered = filter === "ALL" ? entries : entries.filter((e) => e.event === filter);
  const errors = entries.filter((e) => e.event === "ERROR").length;
  const isDbSession = session?.sessionId === "db_persistent";

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-[900px] mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/"
            className="flex items-center gap-1.5 text-gray-400 hover:text-black transition-colors text-[13px] font-medium">
            <ArrowLeft size={15} />
            Store
          </Link>
          <span className="text-gray-200">/</span>
          <div className="flex items-center gap-2 flex-1">
            <Receipt size={15} className="text-gray-400" />
            <p className="text-gray-900 text-[14px] font-bold">Audit Trail</p>
            {entries.length > 0 && (
              <span className="text-gray-400 text-[12px]">· {entries.length} events</span>
            )}
            {isDbSession && (
              <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-full text-blue-600 text-[10px] font-bold">
                DB
              </span>
            )}
            {dbLoaded && !isDbSession && (
              <span className="px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-full text-gray-400 text-[10px] font-medium">
                + DB
              </span>
            )}
            {errors > 0 && (
              <span className="px-2 py-0.5 bg-red-50 border border-red-100 rounded-full text-red-500 text-[10px] font-bold">
                {errors} error{errors > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh}
              className="flex items-center gap-1.5 px-3 h-8 border border-gray-200 rounded-xl text-[12px] text-gray-500 hover:border-gray-900 hover:text-black transition-colors font-medium">
              <RefreshCw size={12} />
              Refresh
            </button>
            <button onClick={() => { clearAuditSession(); setSession(null); setAllSessions([]); }}
              className="flex items-center gap-1.5 px-3 h-8 border border-gray-200 rounded-xl text-[12px] text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors font-medium">
              <Trash2 size={12} />
              Clear All
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-6 py-8">

        {/* Session switcher */}
        {allSessions.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
            {[...allSessions].reverse().map((s, i) => {
              const isActive = s.sessionId === session?.sessionId;
              const isDB = s.sessionId === "db_persistent";
              const label = isDB ? "📦 All Time (DB)" : i === 0 ? "Latest" : `Session ${allSessions.length - i}`;
              const time = new Date(s.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
              return (
                <button key={s.sessionId} onClick={() => { setSession(s); setFilter("ALL"); }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                    isActive
                      ? isDB ? "bg-blue-600 text-white" : "bg-black text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:text-black hover:border-gray-900"
                  }`}>
                  {label} · {time} · {s.entries.length} events
                </button>
              );
            })}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-center">
            <div className="w-16 h-16 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-sm">
              <Receipt size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-900 text-[16px] font-bold">
              {isDbSession ? "No persistent logs yet" : "No audit entries yet"}
            </p>
            <p className="text-gray-400 text-[13px] max-w-[300px] leading-relaxed">
              {isDbSession
                ? "Server-side audit logs appear here once you place an order or cancel one."
                : "Start a conversation with Urban AI and every action will be logged here in real time."}
            </p>
            <Link href="/"
              className="mt-2 px-5 py-2.5 bg-black text-white text-[13px] font-bold rounded-xl hover:bg-gray-900 transition-colors">
              Open Store
            </Link>
          </div>
        ) : (
          <>
            <StatsBar entries={entries} />

            {/* Filter */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-8">
              {eventTypes.map((type) => (
                <button key={type} onClick={() => setFilter(type)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                    filter === type
                      ? "bg-black text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:text-black hover:border-gray-900"
                  }`}>
                  {type === "ALL"
                    ? `All (${entries.length})`
                    : `${type.replace(/_/g, " ")} (${entries.filter((e) => e.event === type).length})`}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div>
              {filtered.map((entry, i) => (
                <AuditRow key={i} entry={entry} index={entries.indexOf(entry)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
