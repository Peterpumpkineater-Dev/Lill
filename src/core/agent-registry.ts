import type { AgentName } from "../types/domain";
import type { BaseAgent, AgentHandleResult } from "../agents/base";
import { childLogger } from "./logger";

const log = childLogger("agent-registry");

export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.name, agent);
    log.info({ agent: agent.name }, "registered");
  }

  get(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  list(): AgentName[] {
    return [...this.agents.keys()] as AgentName[];
  }

  async startAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.stop();
    }
  }

  async invoke(
    name: string,
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    const agent = this.agents.get(name);
    if (!agent) return { ok: false, message: `unknown agent: ${name}` };
    return agent.handle(action, input);
  }
}
