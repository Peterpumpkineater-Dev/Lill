import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "../config";
import { childLogger } from "../core/logger";

const log = childLogger("db");

export const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.poolMax,
});

pool.on("error", (err) => {
  log.error({ err }, "unexpected pool error");
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
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
