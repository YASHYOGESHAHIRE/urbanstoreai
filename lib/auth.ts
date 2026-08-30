const API = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user?: AuthUser;
  error?: string;
  details?: Record<string, string[]>;
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
    credentials: "include",
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function apiLogin(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await fetch(`${API}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function apiMe(): Promise<{
  authenticated: boolean;
  user: AuthUser | null;
}> {
  const res = await fetch(`${API}/auth/me`, {
    credentials: "include",
  });
  return res.json();
}
