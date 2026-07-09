import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "../config";
import { childLogger } from "../core/logger";

const log = childLogger("db");

function shouldUseSsl(url: string): boolean {
  if (!url) return false;
  if (process.env.PGSSL === "false" || process.env.DB_SSL === "false") return false;
  if (process.env.PGSSL === "true" || process.env.DB_SSL === "true") return true;
  // Railway / managed Postgres almost always need SSL
  if (/railway\.app|rlwy\.net|amazonaws\.com|neon\.tech|supabase/i.test(url)) return true;
  if (/sslmode=require/i.test(url)) return true;
  if (config.isProd) return true;
  return false;
}

const dbUrl = config.db.url;

export const pool = new Pool({
  connectionString: dbUrl || undefined,
  max: config.db.poolMax,
  connectionTimeoutMillis: dbUrl ? 15_000 : 1,
  ssl: dbUrl && shouldUseSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  log.error(
    { errMessage: err.message, errCode: (err as NodeJS.ErrnoException).code },
    "unexpected pool error"
  );
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  if (!config.db.url) {
    throw new Error("DATABASE_URL not configured");
  }
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  log.debug({ durationMs: Date.now() - start, rows: res.rowCount }, "query");
  return res;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDb(): Promise<boolean> {
  if (!config.db.url) return false;
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
