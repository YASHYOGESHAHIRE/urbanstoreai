"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AuthUser,
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
} from "./auth";

interface UseAuthReturn {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error?: string; details?: Record<string, string[]> }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiMe();
      setUser(data.authenticated ? data.user : null);
    } catch {
      // Backend unreachable — treat as unauthenticated, don't crash
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await apiLogin(email, password);
      if (data.error) return { error: data.error };
      if (data.user) setUser(data.user);
      return {};
    } catch {
      return { error: "NETWORK_ERROR" };
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      try {
        const data = await apiRegister(name, email, password);
        if (data.error) return { error: data.error, details: data.details };
        if (data.user) setUser(data.user);
        return {};
      } catch {
        return { error: "NETWORK_ERROR" };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore network errors on logout
    }
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    register,
    logout,
    refreshUser,
  };
}
