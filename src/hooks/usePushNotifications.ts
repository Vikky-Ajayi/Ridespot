"use client";

import { useEffect, useState } from "react";
import { notificationRepository } from "@/services/repositories";

type PushPermissionState =
  | NotificationPermission
  | "unsupported"
  | "env-missing"
  | "idle";

const promptStorageKey = "ridespot-push-prompted";

function hasFirebaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  );
}

export function usePushNotifications(enabled = true) {
  const [permissionState, setPermissionState] = useState<PushPermissionState>("idle");

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
      if (alreadyPrompted) {
        setPermissionState(Notification.permission);
        return;
      }

      window.localStorage.setItem(promptStorageKey, "true");
      const permission = await Notification.requestPermission();
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
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
          });

        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
        const messagingInstance = messaging.getMessaging(firebaseApp);
        const token = await messaging.getToken(messagingInstance, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration
        });

        if (token) {
          await notificationRepository.registerPushToken({ token });
        }
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
  }, [enabled]);

  return {
    permissionState
  };
}
