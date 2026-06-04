self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  const title = payload.notification?.title || "RideSpot";
  const options = {
    body: payload.notification?.body || "A new RideSpot alert is available.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-64.png"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
