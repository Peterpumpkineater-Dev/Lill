import { query } from "../pool";

export interface ChatLogRow {
  id: string;
  userId: string;
  userName: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  images: string[];
  channel: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

function mapRow(row: Record<string, unknown>): ChatLogRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: String(row.user_name),
    sessionId: String(row.session_id),
    role: row.role as ChatLogRow["role"],
    content: String(row.content),
    images: (row.images as string[]) ?? [],
    channel: String(row.channel),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
  };
}

export class ChatLogRepository {
  async insert(input: {
    userId: string;
    userName: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    images?: string[];
    channel?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChatLogRow> {
    const res = await query(
      `INSERT INTO chat_logs
         (user_id, user_name, session_id, role, content, images, channel, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
       RETURNING *`,
      [
        input.userId,
        input.userName,
        input.sessionId,
        input.role,
        input.content,
        JSON.stringify(input.images ?? []),
        input.channel ?? "training",
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapRow(res.rows[0]);
  }

  async list(opts?: {
    sessionId?: string;
    userId?: string;
    limit?: number;
  }): Promise<ChatLogRow[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (opts?.sessionId) {
      clauses.push(`session_id = $${i++}`);
      params.push(opts.sessionId);
    }
    if (opts?.userId) {
      clauses.push(`user_id = $${i++}`);
      params.push(opts.userId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(opts?.limit ?? 200);
    const res = await query(
      `SELECT * FROM chat_logs ${where}
       ORDER BY created_at ASC
       LIMIT $${i}`,
      params
    );
    return res.rows.map(mapRow);
  }

  async listRecent(limit = 100): Promise<ChatLogRow[]> {
    const res = await query(
      `SELECT * FROM chat_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map(mapRow);
  }

  /** Group into training turns (session-ordered pairs) for JSONL export */
  async exportSessions(limitSessions = 500): Promise<
    Array<{
      sessionId: string;
      userName: string;
      messages: Array<{ role: string; content: string }>;
    }>
  > {
    const res = await query(
      `SELECT * FROM chat_logs
       WHERE role IN ('user', 'assistant')
       ORDER BY session_id, created_at ASC
       LIMIT $1`,
      [limitSessions * 40]
    );
    const rows = res.rows.map(mapRow);
    const bySession = new Map<
      string,
      { sessionId: string; userName: string; messages: Array<{ role: string; content: string }> }
    >();

    for (const r of rows) {
      let s = bySession.get(r.sessionId);
      if (!s) {
        s = { sessionId: r.sessionId, userName: r.userName, messages: [] };
        bySession.set(r.sessionId, s);
      }
      let content = r.content;
      if (r.images.length) {
        content += `\n[images: ${r.images.join(", ")}]`;
      }
      s.messages.push({ role: r.role, content });
    }

    return [...bySession.values()].slice(0, limitSessions);
  }

  async count(): Promise<number> {
    const res = await query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM chat_logs`);
    return Number(res.rows[0]?.c ?? 0);
  }
}
