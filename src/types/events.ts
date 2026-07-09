import type {
  AgentName,
  AnalyticsReport,
  ComplianceVerdict,
  ContentItem,
  DraftReply,
  MetricPoint,
  Mission,
  PlatformId,
  PublishJob,
  Task,
} from "./domain";

/** Typed event catalog — agents publish/subscribe by name */

export interface EventMap {
  "system.started": { version: string; at: Date };
  "system.health": { status: string; at: Date };

  "mission.created": { mission: Mission };
  "mission.updated": { mission: Mission };
  "task.created": { task: Task };
  "task.updated": { task: Task };
  "task.completed": { task: Task };
  "task.failed": { task: Task; error: string };

  "content.planned": { content: ContentItem };
  "content.updated": { content: ContentItem };
  "content.approved": { contentId: string };
  "content.rejected": { contentId: string; reason: string };

  "compliance.reviewed": {
    contentId: string;
    verdict: ComplianceVerdict;
    notes: string;
    flags: string[];
  };

  "community.draft_created": { draft: DraftReply };
  "community.draft_updated": { draft: DraftReply };

  "publish.queued": { job: PublishJob };
  "publish.started": { jobId: string; platform: PlatformId };
  "publish.completed": { job: PublishJob };
  "publish.failed": { jobId: string; platform: PlatformId; error: string };

  "metrics.recorded": { metrics: MetricPoint[] };
  "report.generated": { report: AnalyticsReport };

  "memory.updated": { key: string; scope: string };
  "memory.recalled": { keys: string[] };

  "scheduler.tick": { at: Date };
  "scheduler.reminder": { taskId: string; message: string };

  "agent.message": {
    from: AgentName;
    to: AgentName | "*";
    subject: string;
    body: Record<string, unknown>;
  };
}

export type EventName = keyof EventMap;
export type EventPayload<E extends EventName> = EventMap[E];

export interface DomainEvent<E extends EventName = EventName> {
  id: string;
  name: E;
  payload: EventPayload<E>;
  source: AgentName | "system";
  correlationId?: string;
  timestamp: Date;
}
