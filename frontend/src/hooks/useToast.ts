"use client";

import { useToastStore } from "@/store/toast-store";

export function useToast() {
  const toast = useToastStore((state) => state.toast);
  const showToast = useToastStore((state) => state.showToast);
  const clearToast = useToastStore((state) => state.clearToast);

  return {
    toast,
    showToast,
    clearToast
  };
}
