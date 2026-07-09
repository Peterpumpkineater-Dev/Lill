import { query } from "../pool";
import type {
  ComplianceVerdict,
  ContentItem,
  ContentType,
  PlatformId,
  TaskStatus,
} from "../../types/domain";

function mapContent(row: Record<string, unknown>): ContentItem {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    caption: String(row.caption),
    contentType: row.content_type as ContentType,
    mediaUrls: (row.media_urls as string[]) ?? [],
    tags: (row.tags as string[]) ?? [],
    platforms: (row.platforms as PlatformId[]) ?? [],
    trafficUrl: row.traffic_url ? String(row.traffic_url) : null,
    status: row.status as TaskStatus,
    scheduledFor: row.scheduled_for ? new Date(row.scheduled_for as string) : null,
    publishedAt: row.published_at ? new Date(row.published_at as string) : null,
    complianceVerdict: (row.compliance_verdict as ComplianceVerdict) ?? null,
    complianceNotes: row.compliance_notes ? String(row.compliance_notes) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class ContentRepository {
  async create(input: {
    title: string;
    body?: string;
    caption?: string;
    contentType?: ContentType;
    mediaUrls?: string[];
    tags?: string[];
    platforms?: PlatformId[];
    trafficUrl?: string | null;
    scheduledFor?: Date | null;
    metadata?: Record<string, unknown>;
  }): Promise<ContentItem> {
    const res = await query(
      `INSERT INTO content_items
         (title, body, caption, content_type, media_urls, tags, platforms, traffic_url, scheduled_for, metadata)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb)
       RETURNING *`,
      [
        input.title,
        input.body ?? "",
        input.caption ?? "",
        input.contentType ?? "text",
        JSON.stringify(input.mediaUrls ?? []),
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.platforms ?? []),
        input.trafficUrl ?? null,
        input.scheduledFor ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapContent(res.rows[0]);
  }

  async findById(id: string): Promise<ContentItem | null> {
    const res = await query(`SELECT * FROM content_items WHERE id = $1`, [id]);
    return res.rows[0] ? mapContent(res.rows[0]) : null;
  }

  async list(opts?: { status?: TaskStatus; limit?: number }): Promise<ContentItem[]> {
    const params: unknown[] = [];
    let where = "";
    if (opts?.status) {
      where = "WHERE status = $1";
      params.push(opts.status);
    }
    params.push(opts?.limit ?? 100);
    const res = await query(
      `SELECT * FROM content_items ${where}
       ORDER BY COALESCE(scheduled_for, created_at) DESC
       LIMIT $${params.length}`,
      params
    );
    return res.rows.map(mapContent);
  }

  async update(
    id: string,
    patch: Partial<{
      title: string;
      body: string;
      caption: string;
      status: TaskStatus;
      scheduledFor: Date | null;
      publishedAt: Date | null;
      complianceVerdict: ComplianceVerdict | null;
      complianceNotes: string | null;
      metadata: Record<string, unknown>;
    }>
  ): Promise<ContentItem | null> {
    const res = await query(
      `UPDATE content_items SET
         title = COALESCE($2, title),
         body = COALESCE($3, body),
         caption = COALESCE($4, caption),
         status = COALESCE($5, status),
         scheduled_for = COALESCE($6, scheduled_for),
         published_at = COALESCE($7, published_at),
         compliance_verdict = COALESCE($8, compliance_verdict),
         compliance_notes = COALESCE($9, compliance_notes),
         metadata = COALESCE($10::jsonb, metadata),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        patch.title ?? null,
        patch.body ?? null,
        patch.caption ?? null,
        patch.status ?? null,
        patch.scheduledFor !== undefined ? patch.scheduledFor : null,
        patch.publishedAt !== undefined ? patch.publishedAt : null,
        patch.complianceVerdict !== undefined ? patch.complianceVerdict : null,
        patch.complianceNotes !== undefined ? patch.complianceNotes : null,
        patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null,
      ]
    );
    return res.rows[0] ? mapContent(res.rows[0]) : null;
  }

  async upcoming(limit = 20): Promise<ContentItem[]> {
    const res = await query(
      `SELECT * FROM content_items
       WHERE status IN ('approved', 'pending', 'awaiting_approval')
         AND (scheduled_for IS NULL OR scheduled_for >= NOW())
       ORDER BY scheduled_for ASC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    return res.rows.map(mapContent);
  }
}
