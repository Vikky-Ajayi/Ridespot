"use client";

import { useCallback, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { FALLBACK_DRIVER_LOCATION, getBrowserDriverLocation } from "@/lib/location";
import type { DriverLocation } from "@/types";

export function useDriverLocation() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [position, setPosition] = useState<DriverLocation | null>(FALLBACK_DRIVER_LOCATION);

  const refreshPosition = useCallback(
    async () => {
      const nextPosition = await getBrowserDriverLocation();
      setPosition(nextPosition);
      socket?.emit("driver:location", nextPosition);
      return nextPosition;
    },
    [socket]
  );

  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.VITE_API_URL) {
      return;
    }

    const token = window.localStorage.getItem("ridespot_token");
    if (!token) {
      setPosition(FALLBACK_DRIVER_LOCATION);
      return;
    }

    const nextSocket = io(import.meta.env.VITE_API_URL, {
      auth: { token }
    });

    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    void refreshPosition();

    if (!socket) {
      return;
    }

    const intervalHandle = window.setInterval(() => {
      void refreshPosition();
    }, 15000);
    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [refreshPosition, socket]);

  return {
    location: position,
    position,
    refreshPosition,
    socket
  };
}
