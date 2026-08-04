import type { Response } from "express";

const clients = new Set<Response>();

export function addSSEClient(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Railway nginx fix
  res.flushHeaders();

  // Keep-alive ping every 30s
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      // client disconnected
    }
  }, 30_000);

  clients.add(res);
  res.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function broadcastHotspotUpdate(hotspots: unknown[]): void {
  if (clients.size === 0) return;
  const payload = JSON.stringify({ type: "hotspots_update", data: hotspots, ts: Date.now() });
  for (const client of clients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

export function getSSEClientCount(): number {
  return clients.size;
}
