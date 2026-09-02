/**
 * Client-side behaviour tracking utility.
 * Fire-and-forget — never throws, never blocks the UI.
 * Session key is a random UUID persisted in sessionStorage for the browser tab lifetime.
 */

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

type BehaviourEvent =
  | "product_viewed"
  | "category_browsed"
  | "search_query"
  | "cart_add"
  | "chat_message"
  | "product_page_viewed";

interface TrackParams {
  event: BehaviourEvent;
  productId?: string;
  categoryId?: string;
  query?: string;
  metadata?: Record<string, unknown>;
}

// ─── Session key — one UUID per browser tab, persisted across navigations ────

function getSessionKey(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "urban_session_key";
  let sk = sessionStorage.getItem(key);
  if (!sk) {
    sk = crypto.randomUUID();
    sessionStorage.setItem(key, sk);
  }
  return sk;
}

// ─── Auth header — optional, sends token if present ──────────────────────────

function optionalAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("urban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── track() — the only export you need ──────────────────────────────────────

export function track(params: TrackParams): void {
  // Skip during SSR
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    sessionKey: getSessionKey(),
    ...params,
  });

  // Use sendBeacon when available (survives page unloads), fall back to fetch
  const url = `${BACKEND}/api/v1/behaviour`;
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    // sendBeacon doesn't support custom headers — use fetch instead so the
    // auth token is forwarded for user attribution
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...optionalAuthHeaders() },
    body,
    // keepalive ensures the request survives navigation
    keepalive: true,
  }).catch(() => {
    // intentionally silent — behaviour tracking must never break the UI
  });
}
