"use client";

import { create } from "zustand";

interface ProfileStore {
  mailNotifications: boolean;
  demandNotifications: boolean;
  nightModeAlerts: boolean;
  setPreferences: (payload: {
    mailNotifications: boolean;
    demandNotifications: boolean;
    nightModeAlerts: boolean;
  }) => void;
  toggleMailNotifications: () => void;
  toggleDemandNotifications: () => void;
  toggleNightModeAlerts: () => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  mailNotifications: true,
  demandNotifications: false,
  nightModeAlerts: false,
  setPreferences: (payload) =>
    set({
      mailNotifications: payload.mailNotifications,
      demandNotifications: payload.demandNotifications,
      nightModeAlerts: payload.nightModeAlerts
    }),
  toggleMailNotifications: () =>
    set((state) => ({ mailNotifications: !state.mailNotifications })),
  toggleDemandNotifications: () =>
    set((state) => ({ demandNotifications: !state.demandNotifications })),
  toggleNightModeAlerts: () =>
    set((state) => ({ nightModeAlerts: !state.nightModeAlerts }))
}));
