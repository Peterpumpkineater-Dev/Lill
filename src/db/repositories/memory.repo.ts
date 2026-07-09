import { query } from "../pool";
import type { MemoryEntry, MemoryScope } from "../../types/domain";

function mapRow(row: Record<string, unknown>): MemoryEntry {
  return {
    id: String(row.id),
    scope: row.scope as MemoryScope,
    key: String(row.key),
    value: row.value,
    tags: (row.tags as string[]) ?? [],
    importance: Number(row.importance),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
  };
}

export class MemoryRepository {
  async upsert(input: {
    scope: MemoryScope;
    key: string;
    value: unknown;
    tags: string[];
    importance: number;
    expiresAt?: Date | null;
  }): Promise<MemoryEntry> {
    const res = await query(
      `INSERT INTO memory_entries (scope, key, value, tags, importance, expires_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       ON CONFLICT (scope, key) DO UPDATE SET
         value = EXCLUDED.value,
         tags = EXCLUDED.tags,
         importance = EXCLUDED.importance,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()
       RETURNING *`,
      [
        input.scope,
        input.key,
        JSON.stringify(input.value),
        JSON.stringify(input.tags),
        input.importance,
        input.expiresAt ?? null,
      ]
    );
    return mapRow(res.rows[0]);
  }

  async findByKey(key: string, scope?: MemoryScope): Promise<MemoryEntry | null> {
    const res = scope
      ? await query(
          `SELECT * FROM memory_entries
           WHERE key = $1 AND scope = $2
             AND (expires_at IS NULL OR expires_at > NOW())`,
          [key, scope]
        )
      : await query(
          `SELECT * FROM memory_entries
           WHERE key = $1
             AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY importance DESC LIMIT 1`,
          [key]
        );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async search(q: {
    scope?: MemoryScope;
    tags?: string[];
    keyPrefix?: string;
    limit?: number;
  }): Promise<MemoryEntry[]> {
    const clauses: string[] = ["(expires_at IS NULL OR expires_at > NOW())"];
    const params: unknown[] = [];
    let i = 1;

    if (q.scope) {
      clauses.push(`scope = $${i++}`);
      params.push(q.scope);
    }
    if (q.keyPrefix) {
      clauses.push(`key LIKE $${i++}`);
      params.push(`${q.keyPrefix}%`);
    }
    if (q.tags?.length) {
      clauses.push(`tags @> $${i++}::jsonb`);
      params.push(JSON.stringify(q.tags));
    }

    const limit = q.limit ?? 50;
    params.push(limit);

    const res = await query(
      `SELECT * FROM memory_entries
       WHERE ${clauses.join(" AND ")}
       ORDER BY importance DESC, updated_at DESC
       LIMIT $${i}`,
      params
    );
    return res.rows.map(mapRow);
  }

  async deleteByKey(key: string, scope?: MemoryScope): Promise<boolean> {
    const res = scope
      ? await query(`DELETE FROM memory_entries WHERE key = $1 AND scope = $2`, [
          key,
          scope,
        ])
      : await query(`DELETE FROM memory_entries WHERE key = $1`, [key]);
    return (res.rowCount ?? 0) > 0;
  }
}
