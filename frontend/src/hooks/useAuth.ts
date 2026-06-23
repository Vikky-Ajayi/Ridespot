"use client";

import { useAuthStore } from "@/store/auth-store";

export function useAuth() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state.hydrated);
  const login = useAuthStore((state) => state.login);
  const syncUser = useAuthStore((state) => state.syncUser);
  const logout = useAuthStore((state) => state.logout);

  return {
    token,
    user,
    hydrated,
    isAuthenticated: Boolean(token),
    login,
    syncUser,
    logout
  };
}
