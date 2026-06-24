

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export interface ProtectedAppLayoutProps {
  children: ReactNode;
}

export function ProtectedAppLayout({ children }: ProtectedAppLayoutProps) {
  const [, navigate] = useLocation();
  const searchParams = useLocationSearchParams();
  const { hydrated, isAuthenticated } = useAuth();
  const previewAccess =
    import.meta.env.MODE === "development" && searchParams.get("preview") === "app";
  usePushNotifications(!previewAccess && hydrated && isAuthenticated);

  useEffect(() => {
    if (!previewAccess && hydrated && !isAuthenticated) {
      navigate("/login");
    }
  }, [hydrated, isAuthenticated, previewAccess, navigate]);

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
