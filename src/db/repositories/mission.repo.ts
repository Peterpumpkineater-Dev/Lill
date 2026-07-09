import { query } from "../pool";
import type { Mission, Task, TaskPriority, TaskStatus, AgentName } from "../../types/domain";

function mapMission(row: Record<string, unknown>): Mission {
  return {
    id: String(row.id),
    title: String(row.title),
    goal: String(row.goal),
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    missionId: row.mission_id ? String(row.mission_id) : null,
    agent: row.agent as AgentName,
    title: String(row.title),
    description: String(row.description),
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    payload: (row.payload as Record<string, unknown>) ?? {},
    result: (row.result as Record<string, unknown>) ?? null,
    scheduledFor: row.scheduled_for ? new Date(row.scheduled_for as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class MissionRepository {
  async create(input: {
    title: string;
    goal: string;
    priority?: TaskPriority;
    metadata?: Record<string, unknown>;
  }): Promise<Mission> {
    const res = await query(
      `INSERT INTO missions (title, goal, priority, metadata)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
      [
        input.title,
        input.goal,
        input.priority ?? "medium",
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapMission(res.rows[0]);
  }

  async findById(id: string): Promise<Mission | null> {
    const res = await query(`SELECT * FROM missions WHERE id = $1`, [id]);
    return res.rows[0] ? mapMission(res.rows[0]) : null;
  }

  async list(limit = 50): Promise<Mission[]> {
    const res = await query(
      `SELECT * FROM missions ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map(mapMission);
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Mission | null> {
    const res = await query(
      `UPDATE missions SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return res.rows[0] ? mapMission(res.rows[0]) : null;
  }
}

export class TaskRepository {
  async create(input: {
    missionId?: string | null;
    agent: AgentName;
    title: string;
    description?: string;
    priority?: TaskPriority;
    payload?: Record<string, unknown>;
    scheduledFor?: Date | null;
  }): Promise<Task> {
    const res = await query(
      `INSERT INTO tasks (mission_id, agent, title, description, priority, payload, scheduled_for)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
      [
        input.missionId ?? null,
        input.agent,
        input.title,
        input.description ?? "",
        input.priority ?? "medium",
        JSON.stringify(input.payload ?? {}),
        input.scheduledFor ?? null,
      ]
    );
    return mapTask(res.rows[0]);
  }

  async findById(id: string): Promise<Task | null> {
    const res = await query(`SELECT * FROM tasks WHERE id = $1`, [id]);
    return res.rows[0] ? mapTask(res.rows[0]) : null;
  }

  async list(opts?: {
    status?: TaskStatus;
    agent?: AgentName;
    limit?: number;
  }): Promise<Task[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (opts?.status) {
      clauses.push(`status = $${i++}`);
      params.push(opts.status);
    }
    if (opts?.agent) {
      clauses.push(`agent = $${i++}`);
      params.push(opts.agent);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(opts?.limit ?? 100);
    const res = await query(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT $${i}`,
      params
    );
    return res.rows.map(mapTask);
  }

  async update(
    id: string,
    patch: {
      status?: TaskStatus;
      result?: Record<string, unknown> | null;
      payload?: Record<string, unknown>;
    }
  ): Promise<Task | null> {
    const res = await query(
      `UPDATE tasks SET
         status = COALESCE($2, status),
         result = COALESCE($3::jsonb, result),
         payload = COALESCE($4::jsonb, payload),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        patch.status ?? null,
        patch.result !== undefined ? JSON.stringify(patch.result) : null,
        patch.payload !== undefined ? JSON.stringify(patch.payload) : null,
      ]
    );
    return res.rows[0] ? mapTask(res.rows[0]) : null;
  }

  async dueTasks(before: Date, limit = 50): Promise<Task[]> {
    const res = await query(
      `SELECT * FROM tasks
       WHERE status IN ('pending', 'approved')
         AND scheduled_for IS NOT NULL
         AND scheduled_for <= $1
       ORDER BY scheduled_for ASC
       LIMIT $2`,
      [before, limit]
    );
    return res.rows.map(mapTask);
  }
}
