import fs from "fs";
import path from "path";
import { pool, query } from "./pool";
import { childLogger } from "../core/logger";

const log = childLogger("migrate");

export async function runMigrations(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, "migrations");
  if (!fs.existsSync(dir)) {
    log.warn({ dir }, "migrations directory missing");
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file;
    const existing = await query<{ id: string }>(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [id]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      log.info({ file }, "skip (already applied)");
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
      log.info({ file }, "migration applied");
    } catch (err) {
      await client.query("ROLLBACK");
      log.error({ err, file }, "migration failed");
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main(): Promise<void> {
  await runMigrations();
  log.info("migrations complete");
  await pool.end();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(async (err) => {
      log.error({ err }, "migrate fatal");
      await pool.end();
      process.exit(1);
    });
}
