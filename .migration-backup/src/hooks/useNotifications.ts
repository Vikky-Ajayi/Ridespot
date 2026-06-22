"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { useAuth } from "@/hooks/useAuth";
import { notificationRepository } from "@/services/repositories";
import { useNotificationStore } from "@/store/notification-store";
import type { AppNotification } from "@/types";

export function useNotifications(enabled = true) {
  const { hydrated, isAuthenticated } = useAuth();
  const setNotifications = useNotificationStore((state) => state.setNotifications);
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    if (!enabled || !hydrated || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    notificationRepository
      .getNotifications(50)
      .then((payload) => {
        if (!cancelled) {
          setNotifications(payload.notifications, payload.unreadCount);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotifications([], 0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, hydrated, isAuthenticated, setNotifications]);

  useEffect(() => {
    if (
      !enabled ||
      !hydrated ||
      !isAuthenticated ||
      typeof window === "undefined" ||
      !process.env.NEXT_PUBLIC_API_URL
    ) {
      return;
    }

    const token = window.localStorage.getItem("ridespot_token");
    if (!token) {
      return;
    }

    const socket = io(process.env.NEXT_PUBLIC_API_URL, {
      auth: { token },
      transports: ["websocket", "polling"]
    });

    const handleNotification = (notification: AppNotification) => {
      addNotification(notification, { showPopup: true });
    };

    socket.on("notification:new", handleNotification);

    return () => {
      socket.off("notification:new", handleNotification);
      socket.disconnect();
    };
  }, [addNotification, enabled, hydrated, isAuthenticated]);
}
