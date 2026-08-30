"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Zap, Shield, Check, X, Loader2 } from "lucide-react";
import { useAuthContext } from "@/lib/AuthContext";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  profile:       { label: "Your profile",  description: "Read your name and email address" },
  "cart:read":   { label: "View cart",     description: "See items in your cart" },
  "cart:write":  { label: "Manage cart",   description: "Add or remove items from your cart" },
  "orders:read": { label: "View orders",   description: "Read your order history" },
  checkout:      { label: "Checkout",      description: "Initiate purchases on your behalf" },
};

interface ConsentData {
  client: { name: string; clientId: string; logoUrl?: string };
  user: { id: string; name: string; email: string };
  requestedScopes: string[];
  redirectUri: string;
  state?: string;
}

// ─── Inner component (needs useSearchParams, must be inside Suspense) ─────────

function AuthorizeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuthContext();

  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      router.push(`/login?returnTo=${returnTo}`);
      return;
    }

    const query = new URLSearchParams({
      response_type: "code",
      client_id: params.get("client_id") ?? "",
      redirect_uri: params.get("redirect_uri") ?? "",
      scope: params.get("scope") ?? "profile",
    });
    const state = params.get("state");
    if (state) query.set("state", state);

    fetch(`${BACKEND}/oauth/authorize?${query}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setConsent(data);
      })
      .catch(() => setError("Cannot reach the server."))
      .finally(() => setPageLoading(false));
  }, [authLoading, isAuthenticated, params, router]);

  const handleApprove = async () => {
    if (!consent) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/oauth/authorize/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          client_id: consent.client.clientId,
          redirect_uri: consent.redirectUri,
          scopes: consent.requestedScopes,
          state: consent.state,
        }),
      });
      const data = await res.json();
      if (data.redirectUrl) window.location.href = data.redirectUrl;
      else setError(data.error ?? "Something went wrong.");
    } catch {
      setError("Cannot reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = async () => {
    if (!consent) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/oauth/authorize/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          redirect_uri: consent.redirectUri,
          state: consent.state,
        }),
      });
      const data = await res.json();
      if (data.redirectUrl) window.location.href = data.redirectUrl;
    } catch {
      setError("Cannot reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#c8f04b]" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="bg-[#111] border border-[#222] rounded-2xl p-8 max-w-sm w-full text-center">
          <p className="text-red-400 text-[14px]">{error}</p>
        </div>
      </div>
    );
  }

  if (!consent) return null;

  // ── Consent UI ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
      <div className="bg-[#111] border border-[#222] rounded-2xl shadow-2xl max-w-[400px] w-full overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#1e1e1e]">
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Urban Store logo */}
            <div className="w-10 h-10 bg-[#c8f04b] rounded-full flex items-center justify-center">
              <Zap size={18} className="text-black" fill="black" />
            </div>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-[#333] rounded-full" />
              <span className="w-1.5 h-1.5 bg-[#333] rounded-full" />
              <span className="w-1.5 h-1.5 bg-[#333] rounded-full" />
            </div>
            {/* Agent logo */}
            <div className="w-10 h-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full flex items-center justify-center overflow-hidden">
              {consent.client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={consent.client.logoUrl}
                  alt={consent.client.name}
                  className="w-6 h-6 object-contain"
                />
              ) : (
                <span className="text-white text-[14px] font-bold">
                  {consent.client.name.charAt(0)}
                </span>
              )}
            </div>
          </div>
          <h1 className="text-white text-[16px] font-bold text-center">
            {consent.client.name} wants to access your Urban Store account
          </h1>
          <p className="text-[#555] text-[12px] text-center mt-1">
            Signed in as{" "}
            <span className="text-[#aaa]">{consent.user.email}</span>
          </p>
        </div>

        {/* Scopes */}
        <div className="px-6 py-4 border-b border-[#1e1e1e]">
          <p className="text-[#555] text-[11px] font-semibold uppercase tracking-wider mb-3">
            This will allow {consent.client.name} to:
          </p>
          <div className="space-y-2.5">
            {consent.requestedScopes.map((scope) => {
              const info = SCOPE_LABELS[scope];
              return (
                <div key={scope} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-[#c8f04b]/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check size={11} className="text-[#c8f04b]" />
                  </div>
                  <div>
                    <p className="text-white text-[13px] font-medium">
                      {info?.label ?? scope}
                    </p>
                    <p className="text-[#555] text-[11px]">
                      {info?.description ?? scope}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security note */}
        <div className="px-6 py-3 border-b border-[#1e1e1e] flex items-center gap-2">
          <Shield size={13} className="text-[#555] flex-shrink-0" />
          <p className="text-[#444] text-[11px]">
            You can revoke access anytime from your account settings.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex gap-3">
          <button
            onClick={handleDeny}
            disabled={submitting}
            className="flex-1 py-2.5 border border-[#2a2a2a] text-[#888] text-[13px] font-semibold rounded-xl hover:border-[#444] hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <X size={14} />
            Deny
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="flex-1 py-2.5 bg-[#c8f04b] text-black text-[13px] font-bold rounded-xl hover:bg-[#b8e03b] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Allow
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Page export with Suspense boundary ───────────────────────────────────────

export default function OAuthAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-[#c8f04b]" />
        </div>
      }
    >
      <AuthorizeContent />
    </Suspense>
  );
}
