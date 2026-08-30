"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Zap, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthContext } from "@/lib/AuthContext";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Incorrect email or password.",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists.",
  RATE_LIMIT_EXCEEDED: "Too many attempts. Please wait a minute.",
  NETWORK_ERROR: "Cannot reach the server. Make sure the backend is running.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
  VALIDATION_ERROR: "Please check the fields below.",
};

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { login, register, isAuthenticated, loading } = useAuthContext();
  const returnTo = params.get("returnTo") ?? "/";

  const [tab, setTab] = useState<"login" | "register">("login");

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginShowPw, setLoginShowPw] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPw, setRegShowPw] = useState(false);
  const [regError, setRegError] = useState("");
  const [regFieldErrors, setRegFieldErrors] = useState<Record<string, string[]>>({});
  const [regLoading, setRegLoading] = useState(false);

  // Already logged in — redirect
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(decodeURIComponent(returnTo));
    }
  }, [isAuthenticated, loading, router, returnTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    const result = await login(loginEmail, loginPassword);
    setLoginLoading(false);
    if (result.error) {
      setLoginError(ERROR_MESSAGES[result.error] ?? "Something went wrong.");
    } else {
      router.replace(decodeURIComponent(returnTo));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    setRegFieldErrors({});
    setRegLoading(true);
    const result = await register(regName, regEmail, regPassword);
    setRegLoading(false);
    if (result.error) {
      if (result.details) setRegFieldErrors(result.details);
      setRegError(ERROR_MESSAGES[result.error] ?? "Something went wrong.");
    } else {
      router.replace(decodeURIComponent(returnTo));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#c8f04b]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-[#111] border border-[#222] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-6 pt-6 pb-4">
          <div className="w-7 h-7 bg-[#c8f04b] rounded-full flex items-center justify-center">
            <Zap size={14} className="text-black" fill="black" />
          </div>
          <span className="text-white text-[15px] font-black uppercase tracking-tight">
            Urban Store
          </span>
        </div>

        {/* Tab switcher */}
        <div className="flex mx-6 mb-5 bg-[#1a1a1a] rounded-xl p-1">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setLoginError(""); setRegError(""); }}
              className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                tab === t ? "bg-white text-black shadow-sm" : "text-[#555] hover:text-[#aaa]"
              }`}
            >
              {t === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* ── LOGIN ── */}
        {tab === "login" && (
          <form onSubmit={handleLogin} className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email" required autoComplete="email"
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-[14px] placeholder-[#444] outline-none focus:border-[#c8f04b] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={loginShowPw ? "text" : "password"} required autoComplete="current-password"
                  value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 pr-12 text-white text-[14px] placeholder-[#444] outline-none focus:border-[#c8f04b] transition-colors"
                />
                <button type="button" onClick={() => setLoginShowPw(!loginShowPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]">
                  {loginShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {loginError && (
              <p className="text-red-400 text-[12px] bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{loginError}</p>
            )}
            <button type="submit" disabled={loginLoading}
              className="w-full py-3 bg-[#c8f04b] text-black text-[14px] font-bold rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loginLoading && <Loader2 size={16} className="animate-spin" />}
              Sign In
            </button>
            <p className="text-center text-[12px] text-[#444]">
              No account?{" "}
              <button type="button" onClick={() => setTab("register")} className="text-[#c8f04b] hover:underline">
                Create one
              </button>
            </p>
          </form>
        )}

        {/* ── REGISTER ── */}
        {tab === "register" && (
          <form onSubmit={handleRegister} className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                type="text" required autoComplete="name"
                value={regName} onChange={(e) => setRegName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-[14px] placeholder-[#444] outline-none focus:border-[#c8f04b] transition-colors"
              />
              {regFieldErrors.name && <p className="text-red-400 text-[11px] mt-1">{regFieldErrors.name[0]}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email" required autoComplete="email"
                value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 text-white text-[14px] placeholder-[#444] outline-none focus:border-[#c8f04b] transition-colors"
              />
              {regFieldErrors.email && <p className="text-red-400 text-[11px] mt-1">{regFieldErrors.email[0]}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={regShowPw ? "text" : "password"} required autoComplete="new-password"
                  value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Min 8 chars, 1 letter + 1 number"
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 pr-12 text-white text-[14px] placeholder-[#444] outline-none focus:border-[#c8f04b] transition-colors"
                />
                <button type="button" onClick={() => setRegShowPw(!regShowPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]">
                  {regShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {regFieldErrors.password && <p className="text-red-400 text-[11px] mt-1">{regFieldErrors.password[0]}</p>}
            </div>
            {regError && (
              <p className="text-red-400 text-[12px] bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">{regError}</p>
            )}
            <button type="submit" disabled={regLoading}
              className="w-full py-3 bg-[#c8f04b] text-black text-[14px] font-bold rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {regLoading && <Loader2 size={16} className="animate-spin" />}
              Create Account
            </button>
            <p className="text-center text-[12px] text-[#444]">
              Already have an account?{" "}
              <button type="button" onClick={() => setTab("login")} className="text-[#c8f04b] hover:underline">
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#c8f04b]" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
