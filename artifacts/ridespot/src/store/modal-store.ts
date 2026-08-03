"use client";

import { create } from "zustand";
import type { Hotspot } from "@/types";

interface ModalStore {
  activeModal: "hotspotDetails" | "subscription" | "logout" | null;
  selectedHotspot: Hotspot | null;
  openHotspotDetails: (hotspot: Hotspot) => void;
  openSubscription: () => void;
  openLogout: () => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  activeModal: null,
  selectedHotspot: null,
  openHotspotDetails: (hotspot) =>
    set({
      activeModal: "hotspotDetails",
      selectedHotspot: hotspot
    }),
  openSubscription: () =>
    set({
      activeModal: "subscription",
      selectedHotspot: null
    }),
  openLogout: () =>
    set({
      activeModal: "logout",
      selectedHotspot: null
    }),
  closeModal: () =>
    set({
      activeModal: null,
      selectedHotspot: null
    })
}));
