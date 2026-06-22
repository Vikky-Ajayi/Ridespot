"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export interface ProtectedAppLayoutProps {
  children: ReactNode;
}

export function ProtectedAppLayout({ children }: ProtectedAppLayoutProps) {
  const router = useRouter();
  const searchParams = useLocationSearchParams();
  const { hydrated, isAuthenticated } = useAuth();
  const previewAccess =
    process.env.NODE_ENV === "development" && searchParams.get("preview") === "app";
  usePushNotifications(!previewAccess && hydrated && isAuthenticated);

  useEffect(() => {
    if (!previewAccess && hydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, previewAccess, router]);

  if (previewAccess) {
    return <>{children}</>;
  }

  if (!hydrated && !isAuthenticated) {
    return (
      <div className="brand-shell flex min-h-screen items-center justify-center text-white">
        <p className="text-lg font-semibold">Preparing your RideSpot dashboard...</p>
      </div>
    );
  }

  if (!hydrated && isAuthenticated) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
