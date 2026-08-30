"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";

/**
 * This page is the redirect_uri for dev testing.
 * In production, ChatGPT/Claude handle their own redirect_uri.
 * This just displays the auth code / error for manual testing.
 */
function CallbackContent() {
  const params = useSearchParams();
  const code = params.get("code");
  const error = params.get("error");
  const state = params.get("state");

  useEffect(() => {
    // If this was opened in a popup, post the result to the opener
    if (window.opener) {
      window.opener.postMessage({ code, error, state }, window.location.origin);
      window.close();
    }
  }, [code, error, state]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="bg-[#111] border border-[#222] rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={22} className="text-red-400" />
          </div>
          <h2 className="text-white text-[16px] font-bold mb-2">Access Denied</h2>
          <p className="text-[#555] text-[13px]">You denied access to this application.</p>
          <button
            onClick={() => window.close()}
            className="mt-6 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl text-[#aaa] text-[13px] hover:border-[#444] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (code) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="bg-[#111] border border-[#222] rounded-2xl p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#c8f04b]/10 rounded-full flex items-center justify-center">
              <Check size={20} className="text-[#c8f04b]" />
            </div>
            <div>
              <h2 className="text-white text-[16px] font-bold">Authorization successful</h2>
              <p className="text-[#555] text-[12px]">The agent can now exchange this code for a token.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[#555] text-[11px] font-semibold uppercase tracking-wider mb-1.5">Authorization Code</p>
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 font-mono text-[12px] text-[#c8f04b] break-all">
                {code}
              </div>
            </div>

            {state && (
              <div>
                <p className="text-[#555] text-[11px] font-semibold uppercase tracking-wider mb-1.5">State</p>
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 font-mono text-[12px] text-[#aaa]">
                  {state}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
            <p className="text-[#555] text-[11px] font-semibold uppercase tracking-wider mb-2">Exchange for token (CMD)</p>
            <pre className="text-[11px] text-[#888] whitespace-pre-wrap break-all leading-relaxed">
{`curl -X POST http://localhost:4000/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "${code}",
    "client_id": "chatgpt",
    "client_secret": "chatgpt-dev-secret-change-me",
    "redirect_uri": "http://localhost:3000/oauth/callback"
  }'`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-[#c8f04b]" />
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#c8f04b]" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
