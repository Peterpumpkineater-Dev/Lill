import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../../src/core/event-bus/index";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus(100);
  });

  it("delivers typed events to subscribers", async () => {
    const received: string[] = [];
    bus.on("system.started", (ev) => {
      received.push(ev.payload.version);
    });

    await bus.emit("system.started", { version: "1.0.0", at: new Date() }, "system");
    expect(received).toEqual(["1.0.0"]);
  });

  it("supports once handlers", async () => {
    let count = 0;
    bus.once("scheduler.tick", () => {
      count++;
    });

    await bus.emit("scheduler.tick", { at: new Date() });
    await bus.emit("scheduler.tick", { at: new Date() });
    expect(count).toBe(1);
  });

  it("onAny receives all events", async () => {
    const names: string[] = [];
    bus.onAny((ev) => {
      names.push(ev.name);
    });

    await bus.emit("memory.updated", { key: "a", scope: "brand" });
    await bus.emit("scheduler.tick", { at: new Date() });
    expect(names).toEqual(["memory.updated", "scheduler.tick"]);
  });

  it("keeps history bounded", async () => {
    const small = new EventBus(3);
    for (let i = 0; i < 5; i++) {
      await small.emit("scheduler.tick", { at: new Date() });
    }
    expect(small.getHistory(10)).toHaveLength(3);
  });

  it("unsubscribe works", async () => {
    let n = 0;
    const off = bus.on("system.health", () => {
      n++;
    });
    off();
    await bus.emit("system.health", { status: "ok", at: new Date() });
    expect(n).toBe(0);
  });
});
