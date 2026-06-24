

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AdminUser } from "@/services/repositories/admin.repository";

interface AdminAuthState {
  token: string | null;
  admin: AdminUser | null;
  hydrated: boolean;
  login: (payload: { token: string; admin: AdminUser }) => void;
  logout: () => void;
  markHydrated: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      hydrated: false,
      login: ({ token, admin }) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("ridespot_admin_token", token);
        }

        set({ token, admin, hydrated: true });
      },
      logout: () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("ridespot_admin_token");
        }

        set({ token: null, admin: null, hydrated: true });
      },
      markHydrated: () => set({ hydrated: true })
    }),
    {
      name: "ridespot-admin-auth",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      }
    }
  )
);
