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

// ─── Storage keys ─────────────────────────────────────────────────────────────

const SESSIONS_KEY = "urban_store_audit_sessions"; // all sessions array
const CURRENT_KEY  = "urban_store_audit_current";  // current session id

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function loadAllSessions(): AuditSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditSession[];
  } catch { return []; }
}

function saveAllSessions(sessions: AuditSession[]) {
  try {
    // Keep max 20 sessions to avoid localStorage bloat
    const trimmed = sessions.slice(-20);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function getCurrentSessionId(): string | null {
  try { return localStorage.getItem(CURRENT_KEY); } catch { return null; }
}

function setCurrentSessionId(id: string) {
  try { localStorage.setItem(CURRENT_KEY, id); } catch { /* ignore */ }
}

export function loadAuditSession(sessionId?: string): AuditSession | null {
  try {
    const sessions = loadAllSessions();
    const id = sessionId ?? getCurrentSessionId();
    if (!id) return sessions[sessions.length - 1] ?? null;
    return sessions.find((s) => s.sessionId === id) ?? null;
  } catch { return null; }
}

export function saveAuditEntries(entries: AuditEntry[]) {
  try {
    const sessions = loadAllSessions();
    const currentId = getCurrentSessionId();
    const idx = currentId ? sessions.findIndex((s) => s.sessionId === currentId) : -1;

    if (idx >= 0) {
      sessions[idx] = {
        ...sessions[idx],
        entries: [...sessions[idx].entries, ...entries],
      };
    } else {
      // No current session — start one
      const newSession: AuditSession = {
        sessionId: `session_${Date.now()}`,
        startedAt: new Date().toISOString(),
        entries,
      };
      sessions.push(newSession);
      setCurrentSessionId(newSession.sessionId);
    }

    saveAllSessions(sessions);

    const current = loadAuditSession();
    window.dispatchEvent(new CustomEvent("urban_audit_update", { detail: current }));
    window.dispatchEvent(new CustomEvent("urban_audit_sessions_update", { detail: loadAllSessions() }));
  } catch { /* ignore */ }
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

export function newAuditSession(): string {
  try {
    const sessions = loadAllSessions();
    const session: AuditSession = {
      sessionId: `session_${Date.now()}`,
      startedAt: new Date().toISOString(),
      entries: [],
    };
    sessions.push(session);
    saveAllSessions(sessions);
    setCurrentSessionId(session.sessionId);

    window.dispatchEvent(new CustomEvent("urban_audit_update", { detail: session }));
    window.dispatchEvent(new CustomEvent("urban_audit_sessions_update", { detail: loadAllSessions() }));
    return session.sessionId;
  } catch { return `session_${Date.now()}`; }
}

export function clearAuditSession() {
  try {
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(CURRENT_KEY);
    window.dispatchEvent(new CustomEvent("urban_audit_update", { detail: null }));
    window.dispatchEvent(new CustomEvent("urban_audit_sessions_update", { detail: [] }));
  } catch { /* ignore */ }
}

// ─── Legacy compat — used by audit page which passes no args ─────────────────
export function loadCurrentSession(): AuditSession | null {
  return loadAuditSession();
}
