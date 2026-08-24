// Seeds event_ingestion_tiles with the UK-wide town/city grid + Lagos + Abuja, replacing the
// old hardcoded 3-UK-city + 2-Nigeria-city SUPPORTED_MARKETS list. Tile data lives in
// backend/src/data/eventIngestionTiles.ts (single source of truth, also used by
// admin.service.ts's seedEventIngestionTiles() for the equivalent HTTP-triggered version of
// this same seed). Safe to re-run: upserts on tile_key, never duplicates.
//
// Usage: pnpm run build && node scripts/seed-event-ingestion-tiles.mjs
// (requires a build first since this imports the compiled dist/ output)

import dotenv from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (checked backend/.env and process env). Aborting.");
  process.exit(1);
}

const { EVENT_INGESTION_TILES } = await import(
  pathToFileURL(resolve(backendRoot, "dist/data/eventIngestionTiles.js")).href
).catch((error) => {
  console.error(
    "Could not load dist/data/eventIngestionTiles.js -- run `pnpm run build` first.\n" + error.message
  );
  process.exit(1);
});

function isLocalDatabaseUrl(databaseUrl) {
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".railway.internal");
  } catch {
    return false;
  }
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabaseUrl(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false }
});

function slug(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const tile of EVENT_INGESTION_TILES) {
    const tileKey = `${tile.countryCode.toLowerCase()}-${slug(tile.label)}`;
    const result = await pool.query(
      `INSERT INTO event_ingestion_tiles (tile_key, label, country, country_code, lat, lng, radius_meters, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       ON CONFLICT (tile_key) DO UPDATE SET
         label = EXCLUDED.label,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         radius_meters = EXCLUDED.radius_meters,
         is_active = TRUE
       RETURNING (xmax = 0) AS inserted`,
      [tileKey, tile.label, tile.country, tile.countryCode, tile.lat, tile.lng, tile.radiusMeters]
    );

    if (result.rows[0]?.inserted) {
      inserted += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    JSON.stringify({ passed: true, totalTiles: EVENT_INGESTION_TILES.length, inserted, updated }, null, 2)
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
