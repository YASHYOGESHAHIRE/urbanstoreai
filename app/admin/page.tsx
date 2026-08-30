"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp, ShoppingCart, Package, Users, AlertTriangle,
  RefreshCw, ArrowUpRight, Boxes, Activity, Zap,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

interface DashboardData {
  revenue: {
    totalRevenue: number;
    orderCount: number;
    avgOrderValue: number;
    dailyRevenue: { date: string; revenue: number }[];
  };
  topSelling: { productId: string; name: string; brand: string; unitsSold: number; revenue: number }[];
  slowMoving: { productId: string; name: string; totalStock: number; unitsSold: number; sellThroughRate: number; lockedValue: number }[];
  cart: { totalCarts: number; checkedOut: number; abandoned: number; abandonmentRate: number; abandonedValue: number };
  stock: { total: number; inStock: number; lowStock: number; outOfStock: number; healthScore: number; lowStockAlerts: { productId: string; name: string; minStock: number }[] };
  users: { totalUsers: number; recentActions: number; recentOrders: number; agentConversations: number; paymentSuccessRate: number };
  generatedAt: string;
}

function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent = false }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? "bg-black" : "bg-gray-50"}`}>
          <Icon size={16} className={accent ? "text-[#c8f04b]" : "text-gray-400"} />
        </div>
        {accent && (
          <ArrowUpRight size={16} className="text-gray-300" />
        )}
      </div>
      <p className={`text-[26px] font-black tracking-tight mb-0.5 ${accent ? "text-black" : "text-gray-900"}`}>
        {value}
      </p>
      <p className="text-gray-500 text-[12px] font-medium">{label}</p>
      {sub && <p className="text-gray-400 text-[11px] mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Revenue bar chart ────────────────────────────────────────────────────────

function RevenueChart({ data }: { data: { date: string; revenue: number }[] }) {
  const last14 = data.slice(-14);
  const max = Math.max(...last14.map((d) => d.revenue), 1);
  const hasRevenue = last14.some((d) => d.revenue > 0);

  if (!hasRevenue || last14.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[100px] gap-2">
        <div className="flex items-end gap-1.5 w-full opacity-10">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="flex-1 bg-gray-300 rounded-sm" style={{ height: `${20 + Math.sin(i) * 15}px` }} />
          ))}
        </div>
        <p className="text-gray-400 text-[12px] absolute">No revenue in the last 14 days</p>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5 h-[100px] pt-2">
      {last14.map((d) => {
        const height = Math.max(4, (d.revenue / max) * 88);
        const day = new Date(d.date).getDate();
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative w-full">
              <div
                className="w-full bg-gray-100 group-hover:bg-black rounded-sm transition-colors cursor-pointer"
                style={{ height: `${height}px` }}
                title={`${d.date}: ${fmt(d.revenue)}`}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                <div className="bg-black text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap font-medium">
                  {fmt(d.revenue)}
                </div>
              </div>
            </div>
            <span className="text-[9px] text-gray-300">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function Bar({ value, max, className = "bg-black" }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mt-1.5">
      <div className={`h-full ${className} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BACKEND}/api/v1/admin/dashboard`, { credentials: "include" });
      if (res.status === 403) { setError("Admin access required."); return; }
      if (!res.ok) { setError("Failed to load."); return; }
      setData(await res.json());
    } catch { setError("Cannot reach backend."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-screen">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-500 text-[14px]">Loading…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-full min-h-screen p-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-sm text-center shadow-sm">
        <AlertTriangle size={24} className="text-red-400 mx-auto mb-3" />
        <p className="text-gray-900 text-[15px] font-semibold mb-1">Access Error</p>
        <p className="text-gray-500 text-[13px]">{error}</p>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-gray-900 text-[22px] font-black tracking-tight">Dashboard</h1>
          <p className="text-gray-400 text-[12px] mt-0.5">
            Last 30 days · {new Date(data.generatedAt).toLocaleString("en-IN", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-[12px] text-gray-600 hover:border-gray-900 hover:text-black transition-colors font-medium">
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Revenue" value={fmt(data.revenue.totalRevenue)}
          sub={`${data.revenue.orderCount} orders`} icon={TrendingUp} accent />
        <StatCard label="Avg Order Value" value={data.revenue.avgOrderValue > 0 ? fmt(data.revenue.avgOrderValue) : "—"}
          sub={data.revenue.orderCount === 0 ? "No orders yet" : undefined} icon={Zap} />
        <StatCard
          label="Cart Abandonment"
          value={`${data.cart.abandonmentRate}%`}
          sub={data.cart.abandonedValue > 0 ? `${fmt(data.cart.abandonedValue)} at risk` : `${data.cart.totalCarts} carts total`}
          icon={ShoppingCart}
        />
        <StatCard
          label="Stock Health"
          value={`${data.stock.healthScore}%`}
          sub={`${data.stock.outOfStock} SKUs out · ${data.stock.lowStock} low`}
          icon={Boxes}
        />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Registered Users" value={String(data.users.totalUsers)} icon={Users} />
        <StatCard label="Agent Conversations" value={String(data.users.agentConversations)} sub="last 7 days" icon={Zap} />
        <StatCard label="Recent Orders" value={String(data.users.recentOrders)} sub="last 7 days" icon={Package} />
        <StatCard label="Payment Success" value={`${data.users.paymentSuccessRate}%`} sub="last 7 days" icon={Activity} />
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-gray-900 text-[14px] font-bold">Revenue</p>
          <span className="text-[#c8f04b] bg-black text-[11px] font-bold px-2.5 py-1 rounded-full">
            {fmt(data.revenue.totalRevenue)}
          </span>
        </div>
        <p className="text-gray-400 text-[12px] mb-4">Last 14 days</p>
        <RevenueChart data={data.revenue.dailyRevenue} />
      </div>

      {/* Top selling + Slow moving */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
        {/* Top selling */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-gray-900 text-[14px] font-bold mb-5">Top Selling</p>
          {data.topSelling.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package size={28} className="text-gray-200 mb-3" />
              <p className="text-gray-400 text-[13px] font-medium">No sales yet</p>
              <p className="text-gray-300 text-[11px] mt-0.5">Products sold will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.topSelling.map((p, i) => (
                <div key={p.productId}>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-300 text-[11px] font-mono w-4 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-gray-900 text-[13px] font-semibold truncate">{p.name}</p>
                        <span className="text-gray-900 text-[13px] font-bold ml-3 flex-shrink-0">{fmt(p.revenue)}</span>
                      </div>
                      <p className="text-gray-400 text-[11px]">{p.unitsSold} units sold</p>
                      <Bar value={p.unitsSold} max={data.topSelling[0]?.unitsSold ?? 1} className="bg-black" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slow moving */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-gray-900 text-[14px] font-bold">Slow Moving Inventory</p>
            {data.slowMoving.length > 0 && (
              <span className="px-2 py-0.5 bg-red-50 border border-red-100 rounded-full text-red-500 text-[10px] font-bold">
                {data.slowMoving.length} products
              </span>
            )}
          </div>
          {data.slowMoving.length === 0 ? (
            <p className="text-gray-400 text-[13px]">All products moving well.</p>
          ) : (
            <div className="space-y-4">
              {data.slowMoving.map((p) => (
                <div key={p.productId} className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-[13px] font-semibold truncate">{p.name}</p>
                    <p className="text-gray-400 text-[11px]">
                      {p.totalStock} in stock · {p.unitsSold} sold · {p.sellThroughRate}% sell-through
                    </p>
                    <Bar value={p.sellThroughRate} max={100} className="bg-red-400" />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-red-500 text-[12px] font-bold">{fmt(p.lockedValue)}</p>
                    <p className="text-gray-400 text-[10px]">locked</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stock alerts */}
      {data.stock.lowStockAlerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={15} className="text-amber-500" />
            <p className="text-gray-900 text-[14px] font-bold">Low Stock Alerts</p>
            <span className="ml-auto px-2 py-0.5 bg-amber-50 border border-amber-100 rounded-full text-amber-600 text-[10px] font-bold">
              {data.stock.lowStockAlerts.length} SKUs
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {data.stock.lowStockAlerts.map((a) => (
              <div key={a.productId} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                <p className="text-gray-900 text-[12px] font-semibold truncate">{a.name}</p>
                <p className="text-amber-500 text-[11px] font-bold mt-0.5">{a.minStock} left</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
