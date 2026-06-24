"use client";

import { create } from "zustand";
import type { ToastMessage } from "@/types";

interface ToastStore {
  toast: ToastMessage | null;
  showToast: (toast: Omit<ToastMessage, "id">) => void;
  clearToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  showToast: (toast) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }

    const payload: ToastMessage = {
      id: crypto.randomUUID(),
      durationMs: 3000,
      ...toast
    };

    set({ toast: payload });

    toastTimer = setTimeout(() => {
      set({ toast: null });
    }, payload.durationMs ?? 3000);
  },
  clearToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    set({ toast: null });
  }
}));
