import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../../src/core/event-bus";
import { MissionDirectorAgent } from "../../src/agents/mission-director";
import { childLogger } from "../../src/core/logger";

/**
 * Unit tests for mission decomposition logic via mocked repos would need DB.
 * Here we verify agent name and unknown action handling without DB.
 */
describe("MissionDirectorAgent", () => {
  let agent: MissionDirectorAgent;

  beforeEach(() => {
    const bus = new EventBus();
    agent = new MissionDirectorAgent({
      bus,
      memory: {
        brandVoice: async () => "confident",
      } as never,
      logger: childLogger("test-md"),
    });
  });

  it("has correct name", () => {
    expect(agent.name).toBe("mission-director");
  });

  it("rejects unknown actions", async () => {
    const result = await agent.handle("nope", {});
    expect(result.ok).toBe(false);
  });

  it("requires goal for create_mission", async () => {
    const result = await agent.handle("create_mission", { title: "x" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/goal/i);
  });
});
