import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env.js";

function isLocalDatabaseUrl(databaseUrl: string) {
  try {
    const { hostname } = new URL(databaseUrl);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".railway.internal")
    );
  } catch {
    return false;
  }
}

function shouldUseDatabaseSsl(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode");

    if (sslMode === "disable") return false;
    if (sslMode === "require" || sslMode === "no-verify" || sslMode === "prefer") return true;

    return env.NODE_ENV === "production" && !isLocalDatabaseUrl(databaseUrl);
  } catch {
    return env.NODE_ENV === "production";
  }
}

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: shouldUseDatabaseSsl(env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  max: env.NODE_ENV === "production" ? 20 : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return db.query<T>(text, values);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyDatabaseConnection() {
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await db.query("SELECT 1");
      return;
    } catch (error) {
      const err = error as { code?: string; hostname?: string; message?: string };
      const isRetryable =
        err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT";

      if (!isRetryable || attempt === maxAttempts) {
        if (err.hostname?.endsWith(".railway.internal")) {
          console.error(
            `Cannot reach ${err.hostname}. Railway private hostnames only resolve when the API, Postgres, and Redis services are in the same project and environment.`
          );
        }

        throw error;
      }

      console.warn(
        `Database connection attempt ${attempt}/${maxAttempts} failed (${err.code ?? "unknown"}). Retrying...`
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}
