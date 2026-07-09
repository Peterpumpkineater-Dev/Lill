import { z } from "zod";
import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName, TaskPriority } from "../../types/domain";
import { MissionRepository, TaskRepository } from "../../db/repositories/mission.repo";
import { reasoningService } from "../../services/reasoning";

const planSchema = z.object({
  steps: z.array(
    z.object({
      agent: z.enum([
        "mission-director",
        "content-planner",
        "community",
        "analytics",
        "memory-manager",
        "compliance",
        "scheduler",
        "publisher",
        "dashboard",
        "autonomy",
        "persona",
        "media",
      ]),
      title: z.string(),
      description: z.string(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      payload: z.record(z.unknown()).optional(),
    })
  ),
});

/**
 * Mission Director — decomposes high-level business goals into agent tasks.
 */
export class MissionDirectorAgent extends BaseAgent {
  readonly name: AgentName = "mission-director";
  private missions = new MissionRepository();
  private tasks = new TaskRepository();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "mission-director" }) });
  }

  protected setup(): void {
    this.subscribe("task.completed", async (payload) => {
      const task = payload.task;
      if (!task.missionId) return;
      const open = await this.tasks.list({ limit: 200 });
      const remaining = open.filter(
        (t) =>
          t.missionId === task.missionId &&
          !["completed", "cancelled", "failed", "rejected"].includes(t.status)
      );
      if (remaining.length === 0) {
        const mission = await this.missions.updateStatus(task.missionId, "completed");
        if (mission) await this.emit("mission.updated", { mission });
      }
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "create_mission") {
      const title = String(input.title ?? "Untitled mission");
      const goal = String(input.goal ?? "");
      if (!goal) return { ok: false, message: "goal is required" };

      const priority = (input.priority as TaskPriority) ?? "medium";
      const mission = await this.missions.create({ title, goal, priority });
      await this.emit("mission.created", { mission });

      const plan = await this.decompose(goal);
      const created = [];
      for (const step of plan) {
        const task = await this.tasks.create({
          missionId: mission.id,
          agent: step.agent,
          title: step.title,
          description: step.description,
          priority: step.priority ?? priority,
          payload: step.payload,
        });
        await this.emit("task.created", { task });
        created.push(task);
      }

      await this.missions.updateStatus(mission.id, "in_progress");
      return {
        ok: true,
        message: `Mission created with ${created.length} tasks`,
        data: { mission, tasks: created },
      };
    }

    if (action === "list_missions") {
      const missions = await this.missions.list();
      return { ok: true, data: { missions } };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async decompose(goal: string): Promise<
    Array<{
      agent: AgentName;
      title: string;
      description: string;
      priority?: TaskPriority;
      payload: Record<string, unknown>;
    }>
  > {
    if (reasoningService.enabled) {
      const llmPlan = await reasoningService.completeJSON(
        {
          system:
            "You are Lilly Mission Director for an adult content creator business. Break goals into agent tasks. Always include memory-manager, compliance, content-planner when posting/traffic is involved, scheduler for publishing, analytics for tracking. Never plan auto-DMs or deceptive engagement.",
          prompt: `Goal: ${goal}\n\nReturn JSON: {"steps":[{"agent":"...","title":"...","description":"...","priority":"high|medium|low","payload":{}}]}`,
          temperature: 0.3,
        },
        planSchema
      );
      if (llmPlan?.steps?.length) {
        return llmPlan.steps.map((s) => ({
          agent: s.agent as AgentName,
          title: s.title,
          description: s.description,
          priority: s.priority,
          payload: { goal, ...(s.payload ?? {}) },
        }));
      }
    }
    return this.decomposeHeuristic(goal);
  }

  /** Deterministic fallback when LLM is off or fails */
  private decomposeHeuristic(goal: string): Array<{
    agent: AgentName;
    title: string;
    description: string;
    priority?: TaskPriority;
    payload: Record<string, unknown>;
  }> {
    const g = goal.toLowerCase();
    const steps: Array<{
      agent: AgentName;
      title: string;
      description: string;
      priority?: TaskPriority;
      payload: Record<string, unknown>;
    }> = [];

    steps.push({
      agent: "memory-manager",
      title: "Load brand context",
      description: "Recall brand voice, traffic URL, and audience insights",
      payload: { goal },
    });

    if (
      g.includes("content") ||
      g.includes("post") ||
      g.includes("calendar") ||
      g.includes("caption") ||
      g.includes("traffic")
    ) {
      steps.push({
        agent: "content-planner",
        title: "Plan content calendar",
        description: `Create content plan aligned to: ${goal}`,
        priority: "high",
        payload: { goal, includeTrafficHooks: true },
      });
    }

    if (g.includes("traffic") || g.includes("grow") || g.includes("publish")) {
      steps.push({
        agent: "scheduler",
        title: "Schedule continuous publishing",
        description: "Queue approved posts across allowed adult platforms",
        priority: "high",
        payload: { goal, continuous: true },
      });
    }

    if (g.includes("engage") || g.includes("community") || g.includes("reply")) {
      steps.push({
        agent: "community",
        title: "Draft engagement opportunities",
        description: "Suggest replies and engagement (human review required)",
        payload: { goal },
      });
    }

    steps.push({
      agent: "compliance",
      title: "Compliance review of plan",
      description: "Flag policy risks before any publishing",
      priority: "high",
      payload: { goal },
    });

    steps.push({
      agent: "analytics",
      title: "Baseline analytics snapshot",
      description: "Capture current KPIs for experiment tracking",
      payload: { goal },
    });

    return steps;
  }
}
