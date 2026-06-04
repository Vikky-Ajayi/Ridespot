import type { Server as HttpServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { createRedisConnection } from "../config/redis.js";
import { verifyAuthToken } from "../utils/jwt.js";
import {
  handleDisconnect,
  handleDriverOffline,
  handleDriverOnline,
  handleLocationUpdate
} from "./location.handler.js";

let io: Server | null = null;
let adapterClients: {
  pubClient: ReturnType<typeof createRedisConnection>;
  subClient: ReturnType<typeof createRedisConnection>;
} | null = null;

export function initSocketServer(server: HttpServer) {
  if (io) {
    return io;
  }

  const socketServer = new Server(server, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true
    }
  });

  const pubClient = createRedisConnection();
  const subClient = createRedisConnection();
  adapterClients = { pubClient, subClient };
  socketServer.adapter(createAdapter(pubClient, subClient));

  socketServer.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== "string") {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    try {
      socket.data.driver = verifyAuthToken(token);
      socket.join("global");
      if (socket.data.driver.country) {
        socket.join(`country:${socket.data.driver.country.toLowerCase()}`);
      }
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  socketServer.on("connection", (socket) => {
    socket.on("driver:location", (payload) => void handleLocationUpdate(socket, payload));
    socket.on("driver:offline", () => void handleDriverOffline(socket));
    socket.on("driver:online", () => void handleDriverOnline(socket));
    socket.on("disconnect", () => void handleDisconnect(socket));
  });

  io = socketServer;
  return socketServer;
}

export function getSocketServer() {
  if (!io) {
    throw new Error("Socket server has not been initialised");
  }

  return io;
}

export async function closeSocketServer() {
  const socketServer = io;
  const clients = adapterClients;
  io = null;
  adapterClients = null;

  if (socketServer) {
    await new Promise<void>((resolve) => {
      socketServer.close(() => resolve());
    });
  }

  await Promise.all([
    clients?.pubClient.quit().catch(() => undefined),
    clients?.subClient.quit().catch(() => undefined)
  ]);
}
