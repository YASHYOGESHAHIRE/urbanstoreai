"use client";

export interface AuditEntry {
  timestamp: string;
  event: string;
  detail: Record<string, unknown>;
  durationMs?: number;
}

export interface AuditSession {
  sessionId: string;
  startedAt: string;
  entries: AuditEntry[];
}

const KEY = "urban_store_audit";

export function saveAuditEntries(entries: AuditEntry[]) {
  try {
    const existing = loadAuditSession();
    const session: AuditSession = {
      sessionId: existing?.sessionId ?? `session_${Date.now()}`,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      entries: [...(existing?.entries ?? []), ...entries],
    };
    localStorage.setItem(KEY, JSON.stringify(session));
    // Dispatch event so audit page can listen for live updates
    window.dispatchEvent(new CustomEvent("urban_audit_update", { detail: session }));
  } catch { /* ignore storage errors */ }
}

export function appendAuditEntry(event: string, detail: Record<string, unknown>, durationMs?: number) {
  const entry: AuditEntry = {
    timestamp: new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }),
    event,
    detail,
    durationMs,
  };
  saveAuditEntries([entry]);
}

export function loadAuditSession(): AuditSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuditSession;
  } catch { return null; }
}

export function clearAuditSession() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("urban_audit_update", { detail: null }));
  } catch { /* ignore */ }
}

export function newAuditSession() {
  try {
    const session: AuditSession = {
      sessionId: `session_${Date.now()}`,
      startedAt: new Date().toISOString(),
      entries: [],
    };
    localStorage.setItem(KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("urban_audit_update", { detail: session }));
  } catch { /* ignore */ }
}
