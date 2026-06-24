

import { create } from "zustand";
import type { DriverLocation, Hotspot, NavigationSession, NavigationStatus } from "@/types";

interface NavigationState {
  status: NavigationStatus;
  activeSession: NavigationSession | null;
  selectedHotspot: Hotspot | null;
  previewOrigin: DriverLocation | null;
  previewDestination: DriverLocation | null;
  setStarting: (hotspot: Hotspot, origin: DriverLocation) => void;
  setActiveSession: (session: NavigationSession, hotspot?: Hotspot | null) => void;
  setFailed: (hotspot?: Hotspot | null) => void;
  clearNavigation: () => NavigationSession | null;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  status: "idle",
  activeSession: null,
  selectedHotspot: null,
  previewOrigin: null,
  previewDestination: null,
  setStarting: (hotspot, origin) =>
    set({
      status: "starting",
      activeSession: null,
      selectedHotspot: hotspot,
      previewOrigin: origin,
      previewDestination: { lat: hotspot.lat, lng: hotspot.lng }
    }),
  setActiveSession: (session, hotspot = null) =>
    set((state) => ({
      status: "active",
      activeSession: session,
      selectedHotspot: hotspot ?? state.selectedHotspot,
      previewOrigin: session.origin,
      previewDestination: session.destination
    })),
  setFailed: (hotspot = null) =>
    set((state) => ({
      status: "failed",
      activeSession: null,
      selectedHotspot: hotspot ?? state.selectedHotspot
    })),
  clearNavigation: () => {
    const session = get().activeSession;
    set({
      status: "idle",
      activeSession: null,
      selectedHotspot: null,
      previewOrigin: null,
      previewDestination: null
    });
    return session;
  }
}));
