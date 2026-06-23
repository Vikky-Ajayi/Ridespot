"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthUser } from "@/types";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  login: (payload: { token: string; user: AuthUser }) => void;
  syncUser: (user: AuthUser) => void;
  logout: () => void;
  markHydrated: () => void;
}

function getInitialAuthSnapshot(): Pick<AuthState, "hydrated" | "token" | "user"> {
  if (typeof window === "undefined") {
    return {
      token: null,
      user: null,
      hydrated: false
    };
  }

  try {
    const raw = window.localStorage.getItem("ridespot-auth");
    if (!raw) {
      return {
        token: null,
        user: null,
        hydrated: true
      };
    }

    const parsed = JSON.parse(raw) as {
      state?: {
        token?: string | null;
        user?: AuthUser | null;
      };
    };

    return {
      token: parsed.state?.token ?? null,
      user: parsed.state?.user ?? null,
      hydrated: true
    };
  } catch {
    return {
      token: null,
      user: null,
      hydrated: true
    };
  }
}

const initialAuthSnapshot = getInitialAuthSnapshot();

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: initialAuthSnapshot.token,
      user: initialAuthSnapshot.user,
      hydrated: initialAuthSnapshot.hydrated,
      login: ({ token, user }) => {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("ridespot_token", token);
        }

        set({
          token,
          hydrated: true,
          user
        });
      },
      syncUser: (user) =>
        set((state) => ({
          token: state.token,
          hydrated: true,
          user
        })),
      logout: () => {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("ridespot_token");
        }

        set({
          token: null,
          user: null,
          hydrated: true
        });
      },
      markHydrated: () => set({ hydrated: true })
    }),
    {
      name: "ridespot-auth",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      }
    }
  )
);
