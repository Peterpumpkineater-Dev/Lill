/** Shared domain types for Lilly OS */

export type AgentName =
  | "mission-director"
  | "content-planner"
  | "community"
  | "analytics"
  | "memory-manager"
  | "compliance"
  | "scheduler"
  | "publisher"
  | "dashboard"
  | "autonomy";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type ContentType = "image" | "video" | "text" | "carousel" | "story" | "live";

export type PlatformId =
  | "onlyfans"
  | "fansly"
  | "reddit"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "custom";

export type ComplianceVerdict = "pass" | "fail" | "needs_review";

export type MemoryScope = "brand" | "audience" | "campaign" | "preference" | "system";

export interface Mission {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface Task {
  id: string;
  missionId: string | null;
  agent: AgentName;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  scheduledFor: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentItem {
  id: string;
  title: string;
  body: string;
  caption: string;
  contentType: ContentType;
  mediaUrls: string[];
  tags: string[];
  platforms: PlatformId[];
  trafficUrl: string | null;
  status: TaskStatus;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  complianceVerdict: ComplianceVerdict | null;
  complianceNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DraftReply {
  id: string;
  platform: PlatformId;
  threadId: string;
  originalMessage: string;
  draft: string;
  status: "draft" | "approved" | "rejected" | "sent";
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricPoint {
  id: string;
  name: string;
  value: number;
  unit: string;
  platform: PlatformId | "all";
  dimensions: Record<string, string>;
  recordedAt: Date;
}

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  key: string;
  value: unknown;
  tags: string[];
  importance: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface PublishJob {
  id: string;
  contentId: string;
  platform: PlatformId;
  status: TaskStatus;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  attempts: number;
  scheduledFor: Date;
  completedAt: Date | null;
}

export interface AnalyticsReport {
  id: string;
  period: "daily" | "weekly" | "monthly";
  startDate: Date;
  endDate: Date;
  summary: string;
  kpis: Record<string, number>;
  trends: string[];
  experiments: string[];
  createdAt: Date;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "down";
  uptimeSeconds: number;
  agents: Record<AgentName, "online" | "offline" | "error">;
  db: boolean;
  redis: boolean;
  queueDepth: number;
  timestamp: Date;
}
