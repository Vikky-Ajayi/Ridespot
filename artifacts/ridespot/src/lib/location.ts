import type { DriverLocation } from "@/types";

export const FALLBACK_DRIVER_LOCATION: DriverLocation = {
  lat: 51.5559,
  lng: -0.2793
};

export function getBrowserDriverLocation() {
  return new Promise<DriverLocation>((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve(FALLBACK_DRIVER_LOCATION);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (result) => {
        resolve({
          lat: result.coords.latitude,
          lng: result.coords.longitude
        });
      },
      () => resolve(FALLBACK_DRIVER_LOCATION),
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000
      }
    );
  });
}
