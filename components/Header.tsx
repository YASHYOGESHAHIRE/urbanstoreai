"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Heart, ShoppingBag, User, Zap, LogOut, ChevronDown, LayoutDashboard } from "lucide-react";
import { useAuthContext } from "@/lib/AuthContext";
import AuthModal from "./AuthModal";

const navLinks = ["New", "Fashion", "Footwear", "Bags", "Accessories", "Lifestyle"];

interface HeaderProps {
  onAIToggle: () => void;
  aiOpen: boolean;
  cartCount?: number;
}

export default function Header({ onAIToggle, aiOpen, cartCount = 0 }: HeaderProps) {
  const [activeNav, setActiveNav] = useState("Fashion");
  const [authModal, setAuthModal] = useState<"login" | "register" | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const { user, isAuthenticated, loading, logout } = useAuthContext();

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex-shrink-0">
            <span className="text-[15px] font-black tracking-tight text-black uppercase">
              Urban Store
            </span>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <button
                key={link}
                onClick={() => setActiveNav(link)}
                className={`text-[13px] font-medium transition-colors relative pb-0.5 ${
                  activeNav === link
                    ? "text-black after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-[2px] after:bg-black after:rounded-full"
                    : "text-gray-500 hover:text-black"
                }`}
              >
                {link}
              </button>
            ))}
          </nav>

          {/* Right icons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Search */}
            <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <Search size={17} className="text-gray-700" />
            </button>

            {/* AI Agent */}
            <button
              onClick={onAIToggle}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold transition-all ${
                aiOpen
                  ? "bg-[#c8f04b] text-black"
                  : "bg-black text-white hover:bg-gray-800"
              }`}
            >
              <Zap size={13} fill="currentColor" />
              AI Agent
            </button>

            {/* Wishlist */}
            <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <Heart size={17} className="text-gray-700" />
            </button>

            {/* Cart */}
            <button className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <ShoppingBag size={17} className="text-gray-700" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-black text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Account */}
            {!loading && !isAuthenticated && (
              <button
                onClick={() => setAuthModal("login")}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <User size={17} className="text-gray-700" />
              </button>
            )}

            {!loading && isAuthenticated && user && (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 pl-2 pr-1 h-8 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold uppercase">
                      {user.name.charAt(0)}
                    </span>
                  </div>
                  <span className="text-[12px] font-medium text-gray-700 hidden sm:block max-w-[80px] truncate">
                    {user.name.split(" ")[0]}
                  </span>
                  <ChevronDown size={12} className="text-gray-400" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 w-44 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-[12px] font-semibold text-black truncate">{user.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <LayoutDashboard size={13} />
                      Admin Panel
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={13} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      {authModal && (
        <AuthModal
          onClose={() => setAuthModal(null)}
          defaultTab={authModal}
        />
      )}
    </>
  );
}
