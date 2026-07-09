import { BaseAgent, type AgentContext } from "../base";
import type { AgentName, SystemHealth } from "../../types/domain";
import { checkDb } from "../../db/pool";
import { queueManager } from "../../core/queue";
import type Redis from "ioredis";

/**
 * Dashboard agent — aggregates system health for API/WS.
 */
export class DashboardAgent extends BaseAgent {
  readonly name: AgentName = "dashboard";
  private startedAt = Date.now();
  private agentStatus: Record<AgentName, "online" | "offline" | "error"> = {
    "mission-director": "offline",
    "content-planner": "offline",
    community: "offline",
    analytics: "offline",
    "memory-manager": "offline",
    compliance: "offline",
    scheduler: "offline",
    publisher: "offline",
    dashboard: "online",
    autonomy: "offline",
    persona: "offline",
    media: "offline",
  };

  constructor(
    ctx: AgentContext,
    private readonly redis: Redis
  ) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "dashboard" }) });
  }

  setAgentOnline(name: AgentName, online: boolean): void {
    this.agentStatus[name] = online ? "online" : "offline";
  }

  protected setup(): void {
    this.subscribe("system.started", async () => {
      this.agentStatus.dashboard = "online";
    });
  }

  async health(): Promise<SystemHealth> {
    const dbOk = await checkDb();
    let redisOk = false;
    try {
      redisOk = (await this.redis.ping()) === "PONG";
    } catch {
      redisOk = false;
    }

    let queueDepth = 0;
    try {
      queueDepth = await queueManager.totalDepth();
    } catch {
      queueDepth = -1;
    }

    const agentsDown = Object.values(this.agentStatus).filter((s) => s !== "online").length;
    let status: SystemHealth["status"] = "healthy";
    if (!dbOk || !redisOk) status = "down";
    else if (agentsDown > 2) status = "degraded";

    return {
      status,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      agents: { ...this.agentStatus },
      db: dbOk,
      redis: redisOk,
      queueDepth,
      timestamp: new Date(),
    };
  }
}
