
import { create } from "zustand";
import type { AppNotification } from "@/types";

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  isOpen: boolean;
  activePopup: AppNotification | null;
  setNotifications: (notifications: AppNotification[], unreadCount?: number) => void;
  addNotification: (notification: AppNotification, options?: { showPopup?: boolean }) => void;
  markReadLocal: (notificationId: string) => void;
  markAllReadLocal: () => void;
  openCenter: () => void;
  closeCenter: () => void;
  clearPopup: () => void;
}

let popupTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePopupClear(set: (state: Partial<NotificationStore>) => void) {
  if (popupTimer) {
    clearTimeout(popupTimer);
  }

  popupTimer = setTimeout(() => {
    set({ activePopup: null });
  }, 6000);
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  activePopup: null,
  setNotifications: (notifications, unreadCount) =>
    set({
      notifications,
      unreadCount:
        unreadCount ?? notifications.filter((notification) => !notification.isRead).length
    }),
  addNotification: (notification, options) =>
    set((state) => {
      const withoutDuplicate = state.notifications.filter((item) => item.id !== notification.id);
      const nextNotifications = [notification, ...withoutDuplicate].slice(0, 100);
      const nextUnreadCount = nextNotifications.filter((item) => !item.isRead).length;

      if (options?.showPopup !== false) {
        schedulePopupClear(set);
      }

      return {
        notifications: nextNotifications,
        unreadCount: nextUnreadCount,
        activePopup: options?.showPopup === false ? state.activePopup : notification
      };
    }),
  markReadLocal: (notificationId) =>
    set((state) => {
      const notifications = state.notifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              isRead: true,
              readAt: notification.readAt ?? new Date().toISOString()
            }
          : notification
      );
      return {
        notifications,
        unreadCount: notifications.filter((notification) => !notification.isRead).length
      };
    }),
  markAllReadLocal: () =>
    set((state) => {
      const readAt = new Date().toISOString();
      return {
        notifications: state.notifications.map((notification) => ({
          ...notification,
          isRead: true,
          readAt: notification.readAt ?? readAt
        })),
        unreadCount: 0
      };
    }),
  openCenter: () => set({ isOpen: true, activePopup: null }),
  closeCenter: () => set({ isOpen: false }),
  clearPopup: () => {
    if (popupTimer) {
      clearTimeout(popupTimer);
    }
    set({ activePopup: null });
  }
}));
