"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useNotifications } from "@/hooks/useNotifications";
import { useStartNavigation } from "@/hooks/useStartNavigation";
import { getBrowserDriverLocation } from "@/lib/location";
import { useHotspotStore } from "@/store/hotspot-store";
import { useModalStore } from "@/store/modal-store";
import { HotspotDetails } from "@/components/hotspot/HotspotDetails";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { NotificationPopup } from "@/components/notifications/NotificationPopup";
import { LogoutModal } from "@/components/profile/LogoutModal";
import { SubscriptionModal } from "@/components/profile/SubscriptionModal";

export function AuthenticatedOverlayHost() {
  const router = useRouter();
  const searchParams = useLocationSearchParams();
  const { logout } = useAuth();
  const startNavigation = useStartNavigation();
  const hotspots = useHotspotStore((state) => state.hotspots);
  const activeModal = useModalStore((state) => state.activeModal);
  const selectedHotspot = useModalStore((state) => state.selectedHotspot);
  const openHotspotDetails = useModalStore((state) => state.openHotspotDetails);
  const openSubscription = useModalStore((state) => state.openSubscription);
  const openLogout = useModalStore((state) => state.openLogout);
  const closeModal = useModalStore((state) => state.closeModal);
  useNotifications(searchParams.get("preview") !== "app");

  useEffect(() => {
    if (searchParams.get("preview") !== "app" || activeModal) {
      return;
    }

    const modal = searchParams.get("modal");

    if (modal === "hotspot-details") {
      if (hotspots[0]) {
        openHotspotDetails(hotspots[0]);
      }
    } else if (modal === "subscription") {
      openSubscription();
    } else if (modal === "logout") {
      openLogout();
    }
  }, [activeModal, hotspots, openHotspotDetails, openLogout, openSubscription, searchParams]);

  return (
    <>
      <HotspotDetails
        open={activeModal === "hotspotDetails"}
        hotspot={selectedHotspot}
        onClose={closeModal}
        onNavigate={async (hotspot) => {
          closeModal();
          const origin = await getBrowserDriverLocation();
          await startNavigation(hotspot, origin)
            .then(() => router.push("/app/home"))
            .catch(() => undefined);
        }}
      />

      <SubscriptionModal open={activeModal === "subscription"} onClose={closeModal} />
      <NotificationPopup />
      <NotificationCenter />

      <LogoutModal
        open={activeModal === "logout"}
        onClose={closeModal}
        onConfirm={() => {
          closeModal();
          logout();
          router.replace("/login");
        }}
      />
    </>
  );
}
