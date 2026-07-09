import { query } from "../pool";
import type {
  AnalyticsReport,
  MetricPoint,
  PlatformId,
  PublishJob,
  TaskStatus,
  DraftReply,
} from "../../types/domain";

function mapMetric(row: Record<string, unknown>): MetricPoint {
  return {
    id: String(row.id),
    name: String(row.name),
    value: Number(row.value),
    unit: String(row.unit),
    platform: row.platform as PlatformId | "all",
    dimensions: (row.dimensions as Record<string, string>) ?? {},
    recordedAt: new Date(row.recorded_at as string),
  };
}

function mapJob(row: Record<string, unknown>): PublishJob {
  return {
    id: String(row.id),
    contentId: String(row.content_id),
    platform: row.platform as PlatformId,
    status: row.status as TaskStatus,
    externalId: row.external_id ? String(row.external_id) : null,
    externalUrl: row.external_url ? String(row.external_url) : null,
    error: row.error ? String(row.error) : null,
    attempts: Number(row.attempts),
    scheduledFor: new Date(row.scheduled_for as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
  };
}

function mapReport(row: Record<string, unknown>): AnalyticsReport {
  return {
    id: String(row.id),
    period: row.period as AnalyticsReport["period"],
    startDate: new Date(row.start_date as string),
    endDate: new Date(row.end_date as string),
    summary: String(row.summary),
    kpis: (row.kpis as Record<string, number>) ?? {},
    trends: (row.trends as string[]) ?? [],
    experiments: (row.experiments as string[]) ?? [],
    createdAt: new Date(row.created_at as string),
  };
}

function mapDraft(row: Record<string, unknown>): DraftReply {
  return {
    id: String(row.id),
    platform: row.platform as PlatformId,
    threadId: String(row.thread_id),
    originalMessage: String(row.original_message),
    draft: String(row.draft),
    status: row.status as DraftReply["status"],
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class MetricsRepository {
  async record(input: {
    name: string;
    value: number;
    unit?: string;
    platform?: PlatformId | "all";
    dimensions?: Record<string, string>;
    recordedAt?: Date;
  }): Promise<MetricPoint> {
    const res = await query(
      `INSERT INTO metrics (name, value, unit, platform, dimensions, recorded_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING *`,
      [
        input.name,
        input.value,
        input.unit ?? "count",
        input.platform ?? "all",
        JSON.stringify(input.dimensions ?? {}),
        input.recordedAt ?? new Date(),
      ]
    );
    return mapMetric(res.rows[0]);
  }

  async recordMany(
    points: Array<{
      name: string;
      value: number;
      unit?: string;
      platform?: PlatformId | "all";
      dimensions?: Record<string, string>;
      recordedAt?: Date;
    }>
  ): Promise<MetricPoint[]> {
    const out: MetricPoint[] = [];
    for (const p of points) out.push(await this.record(p));
    return out;
  }

  async sum(
    name: string,
    since: Date,
    platform?: PlatformId | "all"
  ): Promise<number> {
    const res = platform
      ? await query<{ sum: string }>(
          `SELECT COALESCE(SUM(value), 0) AS sum FROM metrics
           WHERE name = $1 AND recorded_at >= $2 AND platform = $3`,
          [name, since, platform]
        )
      : await query<{ sum: string }>(
          `SELECT COALESCE(SUM(value), 0) AS sum FROM metrics
           WHERE name = $1 AND recorded_at >= $2`,
          [name, since]
        );
    return Number(res.rows[0]?.sum ?? 0);
  }

  async average(name: string, since: Date): Promise<number> {
    const res = await query<{ avg: string }>(
      `SELECT COALESCE(AVG(value), 0) AS avg FROM metrics
       WHERE name = $1 AND recorded_at >= $2`,
      [name, since]
    );
    return Number(res.rows[0]?.avg ?? 0);
  }

  async series(
    name: string,
    since: Date,
    limit = 100
  ): Promise<MetricPoint[]> {
    const res = await query(
      `SELECT * FROM metrics WHERE name = $1 AND recorded_at >= $2
       ORDER BY recorded_at ASC LIMIT $3`,
      [name, since, limit]
    );
    return res.rows.map(mapMetric);
  }

  async latestKpis(): Promise<Record<string, number>> {
    const names = [
      "clicks",
      "conversions",
      "revenue",
      "engagement",
      "followers",
      "posts_published",
    ];
    const kpis: Record<string, number> = {};
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const name of names) {
      kpis[name] = await this.sum(name, dayAgo);
    }
    return kpis;
  }
}

export class PublishJobRepository {
  async create(input: {
    contentId: string;
    platform: PlatformId;
    scheduledFor?: Date;
  }): Promise<PublishJob> {
    const res = await query(
      `INSERT INTO publish_jobs (content_id, platform, scheduled_for)
       VALUES ($1, $2, $3) RETURNING *`,
      [input.contentId, input.platform, input.scheduledFor ?? new Date()]
    );
    return mapJob(res.rows[0]);
  }

  async findById(id: string): Promise<PublishJob | null> {
    const res = await query(`SELECT * FROM publish_jobs WHERE id = $1`, [id]);
    return res.rows[0] ? mapJob(res.rows[0]) : null;
  }

  async list(status?: TaskStatus, limit = 50): Promise<PublishJob[]> {
    const res = status
      ? await query(
          `SELECT * FROM publish_jobs WHERE status = $1
           ORDER BY scheduled_for ASC LIMIT $2`,
          [status, limit]
        )
      : await query(
          `SELECT * FROM publish_jobs ORDER BY scheduled_for DESC LIMIT $1`,
          [limit]
        );
    return res.rows.map(mapJob);
  }

  async update(
    id: string,
    patch: Partial<{
      status: TaskStatus;
      externalId: string | null;
      externalUrl: string | null;
      error: string | null;
      attempts: number;
      completedAt: Date | null;
    }>
  ): Promise<PublishJob | null> {
    const res = await query(
      `UPDATE publish_jobs SET
         status = COALESCE($2, status),
         external_id = COALESCE($3, external_id),
         external_url = COALESCE($4, external_url),
         error = COALESCE($5, error),
         attempts = COALESCE($6, attempts),
         completed_at = COALESCE($7, completed_at)
       WHERE id = $1 RETURNING *`,
      [
        id,
        patch.status ?? null,
        patch.externalId !== undefined ? patch.externalId : null,
        patch.externalUrl !== undefined ? patch.externalUrl : null,
        patch.error !== undefined ? patch.error : null,
        patch.attempts ?? null,
        patch.completedAt !== undefined ? patch.completedAt : null,
      ]
    );
    return res.rows[0] ? mapJob(res.rows[0]) : null;
  }

  async due(before: Date, limit = 20): Promise<PublishJob[]> {
    const res = await query(
      `SELECT * FROM publish_jobs
       WHERE status IN ('pending', 'approved')
         AND scheduled_for <= $1
       ORDER BY scheduled_for ASC LIMIT $2`,
      [before, limit]
    );
    return res.rows.map(mapJob);
  }
}

export class ReportRepository {
  async create(input: {
    period: AnalyticsReport["period"];
    startDate: Date;
    endDate: Date;
    summary: string;
    kpis: Record<string, number>;
    trends: string[];
    experiments: string[];
  }): Promise<AnalyticsReport> {
    const res = await query(
      `INSERT INTO analytics_reports
         (period, start_date, end_date, summary, kpis, trends, experiments)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) RETURNING *`,
      [
        input.period,
        input.startDate,
        input.endDate,
        input.summary,
        JSON.stringify(input.kpis),
        JSON.stringify(input.trends),
        JSON.stringify(input.experiments),
      ]
    );
    return mapReport(res.rows[0]);
  }

  async latest(limit = 10): Promise<AnalyticsReport[]> {
    const res = await query(
      `SELECT * FROM analytics_reports ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map(mapReport);
  }
}

export class DraftRepository {
  async create(input: {
    platform: PlatformId;
    threadId: string;
    originalMessage: string;
    draft: string;
  }): Promise<DraftReply> {
    const res = await query(
      `INSERT INTO draft_replies (platform, thread_id, original_message, draft)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.platform, input.threadId, input.originalMessage, input.draft]
    );
    return mapDraft(res.rows[0]);
  }

  async list(status?: DraftReply["status"], limit = 50): Promise<DraftReply[]> {
    const res = status
      ? await query(
          `SELECT * FROM draft_replies WHERE status = $1
           ORDER BY created_at DESC LIMIT $2`,
          [status, limit]
        )
      : await query(
          `SELECT * FROM draft_replies ORDER BY created_at DESC LIMIT $1`,
          [limit]
        );
    return res.rows.map(mapDraft);
  }

  async updateStatus(
    id: string,
    status: DraftReply["status"]
  ): Promise<DraftReply | null> {
    const res = await query(
      `UPDATE draft_replies SET status = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return res.rows[0] ? mapDraft(res.rows[0]) : null;
  }
}
