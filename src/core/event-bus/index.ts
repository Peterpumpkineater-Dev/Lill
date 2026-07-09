import { v4 as uuid } from "uuid";
import type { AgentName } from "../../types/domain";
import type { DomainEvent, EventMap, EventName, EventPayload } from "../../types/events";
import { childLogger } from "../logger";

const log = childLogger("event-bus");

export type EventHandler<E extends EventName> = (
  event: DomainEvent<E>
) => void | Promise<void>;

interface Subscription {
  id: string;
  event: EventName | "*";
  handler: EventHandler<EventName>;
  once: boolean;
}

/**
 * In-process typed event bus.
 * Designed for single-process agent coordination; multi-instance
 * deployments can bridge via Redis pub/sub (see RedisEventBridge).
 */
export class EventBus {
  private subs: Subscription[] = [];
  private history: DomainEvent[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
  }

  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    return this.add(event, handler as EventHandler<EventName>, false);
  }

  once<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    return this.add(event, handler as EventHandler<EventName>, true);
  }

  onAny(handler: EventHandler<EventName>): () => void {
    return this.add("*", handler, false);
  }

  private add(
    event: EventName | "*",
    handler: EventHandler<EventName>,
    once: boolean
  ): () => void {
    const id = uuid();
    this.subs.push({ id, event, handler, once });
    return () => {
      this.subs = this.subs.filter((s) => s.id !== id);
    };
  }

  async emit<E extends EventName>(
    name: E,
    payload: EventPayload<E>,
    source: AgentName | "system" = "system",
    correlationId?: string
  ): Promise<DomainEvent<E>> {
    const event: DomainEvent<E> = {
      id: uuid(),
      name,
      payload,
      source,
      correlationId,
      timestamp: new Date(),
    };

    this.history.push(event as DomainEvent);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    log.debug({ event: name, source, id: event.id }, "event emitted");

    const matching = this.subs.filter((s) => s.event === name || s.event === "*");
    const toRemove: string[] = [];

    await Promise.all(
      matching.map(async (sub) => {
        try {
          await sub.handler(event as DomainEvent);
          if (sub.once) toRemove.push(sub.id);
        } catch (err) {
          log.error({ err, event: name, sub: sub.id }, "event handler failed");
        }
      })
    );

    if (toRemove.length) {
      this.subs = this.subs.filter((s) => !toRemove.includes(s.id));
    }

    return event;
  }

  getHistory(limit = 50): DomainEvent[] {
    return this.history.slice(-limit);
  }

  clear(): void {
    this.subs = [];
    this.history = [];
  }

  listenerCount(event?: EventName | "*"): number {
    if (!event) return this.subs.length;
    return this.subs.filter((s) => s.event === event).length;
  }
}

export const eventBus = new EventBus();

/** Type helper for exhaustiveness when handling all events */
export type AnyEventPayload = {
  [K in keyof EventMap]: { name: K; payload: EventMap[K] };
}[keyof EventMap];
