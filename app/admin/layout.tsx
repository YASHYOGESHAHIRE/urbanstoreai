"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Megaphone, Zap, ArrowLeft, ChevronRight,
} from "lucide-react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    fetch(`${BACKEND}/auth/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) {
          router.replace("/login?returnTo=/admin");
        } else {
          setAdminName(data.user?.name ?? "Admin");
          setChecking(false);
        }
      })
      .catch(() => router.replace("/login?returnTo=/admin"));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#f5f5f3] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          <span className="text-[14px] text-gray-500">Verifying access…</span>
        </div>
      </div>
    );
  }

  const nav = [
    { href: "/admin",           label: "Dashboard",  icon: LayoutDashboard },
    { href: "/admin/campaigns", label: "Campaigns",  icon: Megaphone       },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f3] flex">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0 sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <Zap size={14} className="text-[#c8f04b]" fill="#c8f04b" />
            </div>
            <div>
              <p className="text-black text-[13px] font-black uppercase tracking-tight leading-tight">
                Urban Store
              </p>
              <p className="text-gray-400 text-[10px] font-medium">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all group ${
                  active
                    ? "bg-black text-white"
                    : "text-gray-500 hover:text-black hover:bg-gray-100"
                }`}>
                <Icon size={15} className={active ? "text-[#c8f04b]" : "text-gray-400 group-hover:text-gray-600"} />
                {label}
                {active && <ChevronRight size={13} className="ml-auto text-gray-500" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-gray-100 space-y-1">
          <Link href="/"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-gray-400 hover:text-black hover:bg-gray-50 transition-colors">
            <ArrowLeft size={13} />
            Back to Store
          </Link>
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-white font-bold uppercase">
                {adminName.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-gray-700 font-medium truncate">{adminName}</p>
              <p className="text-[10px] text-gray-400">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
