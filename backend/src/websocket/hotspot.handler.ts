import type { Server as SocketServer } from "socket.io";

export function broadcastHotspotUpdate(
  io: SocketServer,
  target: { city?: string | null; country?: string | null },
  hotspots: unknown[]
) {
  const payload = {
    hotspots,
    generatedAt: new Date().toISOString()
  };

  io.to("global").emit("hotspots:updated", payload);

  if (target.country) {
    io.to(`country:${target.country.toLowerCase()}`).emit("hotspots:updated", payload);
  }

  if (target.city) {
    io.to(`market:${target.city.toLowerCase().replace(/\s+/g, "-")}`).emit("hotspots:updated", payload);
  }
}
