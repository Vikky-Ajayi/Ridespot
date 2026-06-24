"use client";

import { useEffect, useState } from "react";
import { notificationRepository } from "@/services/repositories";
import { useNotificationStore } from "@/store/notification-store";

type PushPermissionState =
  | NotificationPermission
  | "unsupported"
  | "env-missing"
  | "idle";

const promptStorageKey = "ridespot-push-prompted";

function hasFirebaseEnv(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID &&
      import.meta.env.VITE_FIREBASE_VAPID_KEY
  );
}

export function usePushNotifications(enabled = true) {
  const [permissionState, setPermissionState] = useState<PushPermissionState>("idle");
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const registerPush = async () => {
      if (cancelled) {
        return;
      }

      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        setPermissionState("unsupported");
        return;
      }

      if (!hasFirebaseEnv()) {
        setPermissionState("env-missing");
        return;
      }

      const alreadyPrompted = window.localStorage.getItem(promptStorageKey);
      const permission =
        Notification.permission === "default" && !alreadyPrompted
          ? await Notification.requestPermission()
          : Notification.permission;
      window.localStorage.setItem(promptStorageKey, "true");
      setPermissionState(permission);

      if (permission !== "granted") {
        return;
      }

      try {
        const [{ initializeApp, getApps }, messaging] = await Promise.all([
          import("firebase/app"),
          import("firebase/messaging")
        ]);

        const supported = await messaging.isSupported();
        if (!supported) {
          setPermissionState("unsupported");
          return;
        }

        const firebaseApp =
          getApps()[0] ??
          initializeApp({
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID
          });

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
        const messagingInstance = messaging.getMessaging(firebaseApp);
        const token = await messaging.getToken(messagingInstance, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration
        });

        if (token) {
          await notificationRepository.registerPushToken({ token });
        }

        messaging.onMessage(messagingInstance, (payload) => {
          addNotification(
            {
              id: crypto.randomUUID(),
              type: (payload.data?.type as "hotspot_alert" | "coverage_sufficient" | "surge_alert" | "system" | "test") ?? "system",
              title: payload.notification?.title ?? "RideSpot",
              body: payload.notification?.body ?? "A new RideSpot alert is available.",
              wasDelivered: true,
              wasActedOn: false,
              isRead: false,
              sentAt: new Date().toISOString(),
              data: payload.data ?? {}
            },
            { showPopup: true }
          );
        });
      } catch {
        setPermissionState("unsupported");
      }
    };

    const timeoutHandle = globalThis.setTimeout(() => {
      void registerPush();
    }, 800);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutHandle);
    };
  }, [addNotification, enabled]);

  return {
    permissionState
  };
}
