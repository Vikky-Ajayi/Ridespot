import type { ReactNode } from "react";
import { AuthenticatedOverlayHost } from "@/components/app/AuthenticatedOverlayHost";
import { ProtectedAppLayout } from "@/components/layout/ProtectedAppLayout";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedAppLayout>
      {children}
      <AuthenticatedOverlayHost />
    </ProtectedAppLayout>
  );
}
