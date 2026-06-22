import dotenv from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:event-ingestion timed out");
  process.exit(1);
}, 60000);

const imports = {
  database: await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href),
  redis: await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href),
  events: await import(pathToFileURL(resolve(backendRoot, "dist/modules/events/events.service.js")).href)
};

const { db, verifyDatabaseConnection } = imports.database;
const { redis } = imports.redis;
const { eventsService } = imports.events;
let exitCode = 0;

try {
  await verifyDatabaseConnection();
  const result = await eventsService.ingestEvents([{ city: "London", countryCode: "GB" }]);

  if (!Array.isArray(result.errors)) {
    throw new Error(`Expected ingestion errors array, got ${JSON.stringify(result)}`);
  }

  console.log(
    JSON.stringify(
      {
        passed: true,
        result
      },
      null,
      2
    )
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
