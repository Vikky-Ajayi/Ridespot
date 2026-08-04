"use client";

import { useEffect, useRef } from "react";
import type { Hotspot } from "@/types";
import { mapHotspot, type BackendHotspot } from "@/services/repositories/shared";

interface SSEMessage {
  type: string;
  data: BackendHotspot[];
  ts: number;
}

/**
 * Subscribe to real-time hotspot updates via Server-Sent Events.
 * Falls back gracefully when the API is unavailable or SSE is unsupported.
 *
 * @param onUpdate - called with mapped hotspots whenever the server pushes an update
 * @returns cleanup function (also returned as a hook cleanup)
 */
export function useSSEHotspots(onUpdate: (hotspots: Hotspot[]) => void): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) return;

    const token = window.localStorage.getItem("ridespot_token");
    if (!token) return;

    let aborted = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/hotspots/stream`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok || !res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const msg = JSON.parse(dataLine.slice(6)) as SSEMessage;
              if (msg.type === "hotspots_update" && Array.isArray(msg.data)) {
                const mapped = msg.data.map(mapHotspot);
                onUpdateRef.current(mapped);
              }
            } catch {
              // malformed message — skip
            }
          }
        }
      } catch {
        // network error or server unavailable
      }

      // Reconnect after 5s unless the component unmounted
      if (!aborted) {
        retryTimeout = setTimeout(connect, 5000);
      }
    };

    void connect();

    return () => {
      aborted = true;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);
}
