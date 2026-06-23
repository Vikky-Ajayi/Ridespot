import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { db } from "./database.js";

const MIGRATION_LOCK_ID = 7763771;

function getErrorDiagnostics(error: unknown) {
  const err = error as {
    code?: string;
    constraint?: string;
    message?: string;
    name?: string;
    routine?: string;
    stack?: string;
    table?: string;
  };

  return {
    code: err.code,
    constraint: err.constraint,
    message: err.message ?? String(error),
    name: err.name,
    routine: err.routine,
    stack: err.stack,
    table: err.table
  };
}

async function pathExists(directory: string) {
  try {
    await readdir(directory);
    return true;
  } catch {
    return false;
  }
}

async function findMigrationsDirectory() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../migrations"),
    path.resolve(process.cwd(), "migrations"),
    path.resolve(process.cwd(), "backend/migrations")
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error(`Cannot find migrations directory. Checked: ${candidates.join(", ")}`);
}

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runPendingMigrations() {
  const migrationsDirectory = await findMigrationsDirectory();
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await db.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureMigrationTable(client);

    const appliedResult = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    for (const filename of files) {
      if (applied.has(filename)) continue;

      const startedAt = Date.now();
      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");

        console.log(
          JSON.stringify({
            event: "migration_applied",
            filename,
            durationMs: Date.now() - startedAt
          })
        );
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(
          JSON.stringify({
            event: "migration_failed",
            filename,
            ...getErrorDiagnostics(error)
          })
        );
        throw error;
      }
    }

    console.log(
      JSON.stringify({
        event: "migrations_complete",
        totalFiles: files.length,
        newlyApplied: files.filter((file) => !applied.has(file)).length
      })
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
