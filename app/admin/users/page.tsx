"use client";

import { useEffect, useState } from "react";
import {
  Users, ArrowLeft, Search, RefreshCw, Shield, Eye,
  ShoppingBag, Activity, ChevronRight, AlertTriangle,
  MessageSquare, ShoppingCart, CreditCard, Package,
  CheckCircle, Zap, User, Receipt,
} from "lucide-react";
import { authHeaders } from "@/lib/auth";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isReadOnlyAdmin: boolean;
  createdAt: string;
  orderCount: number;
  auditEventCount: number;
  totalSpent: number;
  lastOrder: { total: number; createdAt: string; status: string } | null;
}

interface AuditEntry {
  id: string;
  event: string;
  detail: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

// ─── Event config (same as audit page) ───────────────────────────────────────

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  USER_REQUEST:      { icon: MessageSquare, color: "text-blue-500",   bg: "bg-blue-50",   label: "User Request"    },
  TOOL_RESULT:       { icon: CheckCircle,   color: "text-green-500",  bg: "bg-green-50",  label: "Tool Result"     },
  CART_ACTION:       { icon: ShoppingCart,  color: "text-violet-500", bg: "bg-violet-50", label: "Cart Action"     },
  POLICY:            { icon: Shield,        color: "text-orange-500", bg: "bg-orange-50", label: "Policy Check"    },
  RAZORPAY:          { icon: CreditCard,    color: "text-pink-500",   bg: "bg-pink-50",   label: "Razorpay"        },
  ERROR:             { icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50",    label: "Error"           },
  AGENT_REPLY:       { icon: Zap,           color: "text-gray-700",   bg: "bg-gray-100",  label: "Agent Reply"     },
  ORDER_CONFIRMED:   { icon: Package,       color: "text-green-600",  bg: "bg-green-50",  label: "Order Confirmed" },
};

function getConfig(event: string) {
  return EVENT_CONFIG[event] ?? { icon: Receipt, color: "text-gray-400", bg: "bg-gray-50", label: event };
}

// ─── Audit row ────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const cfg = getConfig(entry.event);
  const Icon = cfg.icon;
  return (
    <div className="flex gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
        <Icon size={13} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
          <span className="text-gray-300 text-[10px] flex-shrink-0">{entry.timestamp}</span>
        </div>
        {entry.detail.message && (
          <p className="text-gray-600 text-[12px] mt-0.5 truncate">&ldquo;{String(entry.detail.message)}&rdquo;</p>
        )}
        {entry.detail.action && (
          <p className="text-gray-500 text-[12px] mt-0.5">{String(entry.detail.action).replace(/_/g, " ")}</p>
        )}
        {entry.detail.error && (
          <p className="text-red-400 text-[12px] mt-0.5">{String(entry.detail.error)}</p>
        )}
      </div>
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserCard({ user, onClick }: { user: UserRow; onClick: () => void }) {
  const roleLabel = user.isAdmin && user.isReadOnlyAdmin
    ? "Read-only Admin"
    : user.isAdmin
    ? "Admin"
    : "User";

  const roleColor = user.isAdmin && user.isReadOnlyAdmin
    ? "bg-blue-50 text-blue-600 border-blue-100"
    : user.isAdmin
    ? "bg-black text-white border-black"
    : "bg-gray-50 text-gray-500 border-gray-200";

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[14px] font-black uppercase">{user.name.charAt(0)}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-gray-900 text-[14px] font-bold truncate">{user.name}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
          <p className="text-gray-400 text-[12px] truncate">{user.email}</p>
          <p className="text-gray-300 text-[11px] mt-0.5">Joined {fmtDate(user.createdAt)}</p>
        </div>

        <ChevronRight size={15} className="text-gray-300 group-hover:text-black transition-colors flex-shrink-0 mt-0.5" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-50">
        <div className="text-center">
          <p className="text-gray-900 text-[15px] font-black">{user.orderCount}</p>
          <p className="text-gray-400 text-[10px]">Orders</p>
        </div>
        <div className="text-center">
          <p className="text-gray-900 text-[15px] font-black">{user.totalSpent > 0 ? fmt(user.totalSpent) : "—"}</p>
          <p className="text-gray-400 text-[10px]">Total spent</p>
        </div>
        <div className="text-center">
          <p className="text-gray-900 text-[15px] font-black">{user.auditEventCount}</p>
          <p className="text-gray-400 text-[10px]">Events</p>
        </div>
      </div>

      {user.lastOrder && (
        <div className="mt-3 pt-2 border-t border-gray-50 flex items-center justify-between">
          <span className="text-gray-400 text-[11px]">Last order</span>
          <span className="text-gray-700 text-[11px] font-semibold">
            {fmt(user.lastOrder.total)} · {fmtDate(user.lastOrder.createdAt)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/v1/admin/users`, { headers: authHeaders() });
      if (res.ok) setUsers(await res.json().then((d) => d.users));
    } finally { setLoading(false); }
  };

  const loadAudit = async (userId: string) => {
    setAuditLoading(true);
    setAuditLogs([]);
    try {
      const res = await fetch(`${BACKEND}/api/v1/admin/users/${userId}/audit`, { headers: authHeaders() });
      if (res.ok) setAuditLogs(await res.json().then((d) => d.logs));
    } finally { setAuditLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSelectUser = (user: UserRow) => {
    setSelectedUser(user);
    loadAudit(user.id);
  };

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ── Audit detail panel ────────────────────────────────────────────────────

  if (selectedUser) {
    const errors = auditLogs.filter((e) => e.event === "ERROR").length;
    const orders = auditLogs.filter((e) => e.event === "RAZORPAY" && String(e.detail.event ?? "").includes("confirm")).length;

    return (
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => { setSelectedUser(null); setAuditLogs([]); }}
            className="flex items-center gap-1.5 text-gray-400 hover:text-black transition-colors text-[13px] font-medium"
          >
            <ArrowLeft size={15} /> All Users
          </button>
          <span className="text-gray-200">/</span>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
              <span className="text-white text-[12px] font-black uppercase">{selectedUser.name.charAt(0)}</span>
            </div>
            <div>
              <p className="text-gray-900 text-[15px] font-bold">{selectedUser.name}</p>
              <p className="text-gray-400 text-[12px]">{selectedUser.email}</p>
            </div>
          </div>
          {selectedUser.isAdmin && (
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ml-2 ${
              selectedUser.isReadOnlyAdmin
                ? "bg-blue-50 text-blue-600 border-blue-100"
                : "bg-black text-white border-black"
            }`}>
              {selectedUser.isReadOnlyAdmin ? "Read-only Admin" : "Admin"}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3 text-[12px] text-gray-500">
            <span>{selectedUser.orderCount} orders</span>
            <span>·</span>
            <span>{selectedUser.totalSpent > 0 ? fmt(selectedUser.totalSpent) : "₹0"} spent</span>
            {errors > 0 && (
              <>
                <span>·</span>
                <span className="text-red-500 font-semibold">{errors} errors</span>
              </>
            )}
          </div>
        </div>

        {/* Stats mini-bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Events",   value: String(auditLogs.length),    icon: Activity },
            { label: "Agent Messages", value: String(auditLogs.filter((e) => e.event === "USER_REQUEST").length), icon: MessageSquare },
            { label: "Cart Actions",   value: String(auditLogs.filter((e) => e.event === "CART_ACTION").length), icon: ShoppingBag },
            { label: "Completed Orders", value: String(orders), icon: Package },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon size={14} className="text-gray-400" />
                <span className="text-gray-500 text-[11px] font-medium">{s.label}</span>
              </div>
              <p className="text-gray-900 text-[22px] font-black">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Audit trail */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-900 text-[14px] font-bold">Audit Trail</p>
            <span className="text-gray-400 text-[12px]">{auditLogs.length} events</span>
          </div>

          {auditLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-400 text-[13px]">Loading audit logs…</span>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-12">
              <Receipt size={28} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-[13px]">No audit events yet for this user.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {auditLogs.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── User list ─────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-gray-900 text-[22px] font-black tracking-tight">Users</h1>
          <p className="text-gray-400 text-[12px] mt-0.5">
            {users.length} registered · click a user to see their audit trail
          </p>
        </div>
        <button onClick={loadUsers}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[12px] text-gray-600 hover:border-gray-900 hover:text-black transition-colors font-medium">
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-[13px] text-gray-900 placeholder-gray-400 outline-none focus:border-black transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-[13px]">Loading users…</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-20">
          <Users size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-[14px]">{search ? "No users match your search." : "No users yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredUsers.map((user) => (
            <UserCard key={user.id} user={user} onClick={() => handleSelectUser(user)} />
          ))}
        </div>
      )}
    </div>
  );
}
