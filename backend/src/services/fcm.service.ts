import axios from "axios";

// Sends push notifications via Expo's push service instead of the Firebase Admin SDK.
// The mobile client (artifacts/mobile/contexts/...) registers tokens through
// expo-notifications' getExpoPushTokenAsync(), which returns Expo push tokens
// ("ExponentPushToken[...]") -- Firebase Admin's messaging().send() only accepts real
// FCM/APNs registration tokens, which a managed Expo app can't mint without the native
// Firebase SDK and platform config files (google-services.json / GoogleService-Info.plist).
// Expo's push API is a token-compatible superset: it forwards to FCM/APNs on Expo's
// infrastructure, needs no Firebase project credentials, and keeps this service usable
// without native build config this repo doesn't have.
//
// FIREBASE_PROJECT_ID/FIREBASE_PRIVATE_KEY/FIREBASE_CLIENT_EMAIL (see config/env.ts) are no
// longer read here -- if you migrate to native Firebase messaging later (e.g. via
// @react-native-firebase/messaging for richer delivery guarantees), reintroduce
// firebase-admin in this file and switch the mobile client to a real FCM/APNs token.

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_CHUNK_SIZE = 100;

const expoPushClient = axios.create({
  timeout: 10000,
  headers: { "Content-Type": "application/json", Accept: "application/json" }
});

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

function isExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function sendToMany(tokens: string[], notification: PushNotificationPayload) {
  const validTokens = tokens.filter(isExpoPushToken);
  const skipped = tokens.length - validTokens.length;
  if (skipped > 0) {
    console.warn(
      JSON.stringify({
        event: "expo_push_invalid_tokens_skipped",
        skipped,
        message: "Token(s) were not Expo push tokens (ExponentPushToken[...]) -- skipped."
      })
    );
  }

  if (!validTokens.length) {
    return;
  }

  for (let i = 0; i < validTokens.length; i += EXPO_PUSH_CHUNK_SIZE) {
    const chunk = validTokens.slice(i, i + EXPO_PUSH_CHUNK_SIZE);
    const messages = chunk.map((token) => ({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: "default" as const,
      priority: "high" as const
    }));

    try {
      const response = await expoPushClient.post(EXPO_PUSH_ENDPOINT, messages, {
        validateStatus: () => true
      });

      if (response.status < 200 || response.status >= 300) {
        console.warn(
          JSON.stringify({
            event: "expo_push_send_failed",
            status: response.status,
            body: response.data
          })
        );
        continue;
      }

      const tickets: ExpoPushTicket[] = Array.isArray(response.data?.data) ? response.data.data : [];
      const errors = tickets.filter((ticket) => ticket.status === "error");
      if (errors.length) {
        console.warn(
          JSON.stringify({
            event: "expo_push_tickets_had_errors",
            errorCount: errors.length,
            sample: errors.slice(0, 3)
          })
        );
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "expo_push_send_error",
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }
}

export async function sendToDriver(token: string, notification: PushNotificationPayload) {
  await sendToMany([token], notification);
}
