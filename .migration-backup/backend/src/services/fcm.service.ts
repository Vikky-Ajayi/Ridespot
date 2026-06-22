import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { env, hasFirebaseAdminConfig } from "../config/env.js";

let initialised = false;

function ensureFirebaseApp() {
  if (!hasFirebaseAdminConfig() || initialised) {
    return;
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        privateKey: env.FIREBASE_PRIVATE_KEY,
        clientEmail: env.FIREBASE_CLIENT_EMAIL
      })
    });
  }

  initialised = true;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendToDriver(fcmToken: string, notification: PushNotificationPayload) {
  if (!hasFirebaseAdminConfig() || !fcmToken) {
    return;
  }

  ensureFirebaseApp();

  await getMessaging().send({
    token: fcmToken,
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: notification.data,
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default" } } }
  });
}

export async function sendToMany(tokens: string[], notification: PushNotificationPayload) {
  if (!hasFirebaseAdminConfig() || !tokens.length) {
    return;
  }

  ensureFirebaseApp();

  await getMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: notification.data
  });
}
