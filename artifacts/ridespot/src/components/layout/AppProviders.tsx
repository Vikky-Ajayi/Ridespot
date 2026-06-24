

import { useEffect, useRef, type ReactNode } from "react";
import { Toast } from "@/components/ui/Toast";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useToast } from "@/hooks/useToast";
import { PwaDisplayMode } from "./PwaDisplayMode";

export interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const searchParams = useLocationSearchParams();
  const { toast, showToast, clearToast } = useToast();
  const previewToastActiveRef = useRef(false);

  useEffect(() => {
    const syncPwaRegistration = async () => {
      if (!("serviceWorker" in navigator)) {
        return;
      }

      const isLocalPreviewHost = ["localhost", "127.0.0.1", "[::1]"].includes(
        window.location.hostname
      );

      if (isLocalPreviewHost) {
        const cleanupKey = "ridespot-local-sw-cleanup";
        if (!window.sessionStorage.getItem(cleanupKey)) {
          window.sessionStorage.setItem(cleanupKey, "true");

          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));

          if ("caches" in window) {
            const cacheKeys = await window.caches.keys();
            await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
          }
        }

        return;
      }

      if (
        import.meta.env.MODE !== "production" ||
        import.meta.env.VITE_DISABLE_PWA === "true"
      ) {
        return;
      }

      const existingRegistration = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!existingRegistration) {
        await navigator.serviceWorker.register("/sw.js");
      }
    };

    void syncPwaRegistration();
  }, []);

  useEffect(() => {
    const toastKey = searchParams.get("toast");
    const holdToast = searchParams.get("holdToast") === "true";

    if (!toastKey) {
      if (previewToastActiveRef.current) {
        clearToast();
        previewToastActiveRef.current = false;
      }

      return;
    }

    const previewToastMap: Record<
      string,
      { title: string; variant: "success" | "neutral" | "alert" | "info" }
    > = {
      "account-created": {
        title: "Account Created",
        variant: "success"
      },
      "password-changed": {
        title: "Password Changed",
        variant: "success"
      },
      recentered: {
        title: "Recentered to your Location",
        variant: "neutral"
      }
    };

    const previewToast = previewToastMap[toastKey];

    if (!previewToast) {
      return;
    }

    showToast({
      ...previewToast,
      durationMs: holdToast ? 60_000 : 3_000
    });
    previewToastActiveRef.current = true;
  }, [clearToast, searchParams, showToast]);

  return (
    <>
      <PwaDisplayMode />
      {children}
      <Toast toast={toast} />
    </>
  );
}
