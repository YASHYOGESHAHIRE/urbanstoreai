const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user?: AuthUser;
  token?: string;
  error?: string;
  details?: Record<string, string[]>;
}

// ─── Token storage ────────────────────────────────────────────────────────────

const TOKEN_KEY = "urban_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Auth headers ─────────────────────────────────────────────────────────────

export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function apiRegister(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data: AuthResponse = await res.json();
  if (data.token) setStoredToken(data.token);
  return data;
}

export async function apiLogin(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data: AuthResponse = await res.json();
  if (data.token) setStoredToken(data.token);
  return data;
}

export async function apiLogout(): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  clearStoredToken();
}

export async function apiMe(): Promise<{
  authenticated: boolean;
  user: AuthUser | null;
}> {
  const token = getStoredToken();
  if (!token) return { authenticated: false, user: null };
  const res = await fetch(`${API}/auth/me`, {
    headers: authHeaders(),
  });
  return res.json();
}
