import type { AgentName } from "../../types/domain";
import type { EventBus } from "../../core/event-bus";
import type { EventName, EventPayload } from "../../types/events";
import type { MemorySystem } from "../../core/memory";
import type { Logger } from "../../core/logger";
import { childLogger } from "../../core/logger";

export interface AgentContext {
  bus: EventBus;
  memory: MemorySystem;
  logger: Logger;
}

export interface AgentHandleResult {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Base class for all Lilly agents.
 * Subclasses subscribe to events and implement domain behavior.
 * Agents must not call other agents directly — only via EventBus.
 */
export abstract class BaseAgent {
  abstract readonly name: AgentName;
  protected readonly bus: EventBus;
  protected readonly memory: MemorySystem;
  protected readonly log: Logger;
  private unsubs: Array<() => void> = [];
  private _running = false;

  constructor(ctx: AgentContext) {
    this.bus = ctx.bus;
    this.memory = ctx.memory;
    this.log = ctx.logger ?? childLogger(this.constructor.name);
  }

  get running(): boolean {
    return this._running;
  }

  /** Wire event subscriptions */
  protected abstract setup(): void;

  async start(): Promise<void> {
    if (this._running) return;
    this.setup();
    this._running = true;
    this.log.info({ agent: this.name }, "agent started");
  }

  async stop(): Promise<void> {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this._running = false;
    this.log.info({ agent: this.name }, "agent stopped");
  }

  protected subscribe<E extends EventName>(
    event: E,
    handler: (payload: EventPayload<E>) => void | Promise<void>
  ): void {
    const off = this.bus.on(event, async (ev) => {
      try {
        await handler(ev.payload as EventPayload<E>);
      } catch (err) {
        this.log.error({ err, event, agent: this.name }, "agent handler error");
      }
    });
    this.unsubs.push(off);
  }

  protected async emit<E extends EventName>(
    name: E,
    payload: EventPayload<E>,
    correlationId?: string
  ): Promise<void> {
    await this.bus.emit(name, payload, this.name, correlationId);
  }

  /** Optional direct invoke for API-driven actions */
  async handle(
    _action: string,
    _input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    return { ok: false, message: "action not supported" };
  }
}
