import { buildApp } from "./app.js";
import { db, verifyDatabaseConnection } from "./config/database.js";
import { env } from "./config/env.js";
import { runPendingMigrations } from "./config/migrations.js";
import { redis } from "./config/redis.js";
import { initSocketServer } from "./websocket/socket.server.js";

async function start() {
  const app = await buildApp();
  initSocketServer(app.server);

  await verifyDatabaseConnection();
  await runPendingMigrations();

  await app.listen({
    host: "::",
    port: env.PORT
  });

  const shutdown = async () => {
    await app.close();
    await db.end();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void start().catch((error) => {
  console.error(error);
  process.exit(1);
});
