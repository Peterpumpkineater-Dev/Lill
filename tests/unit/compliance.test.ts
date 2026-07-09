import { describe, it, expect } from "vitest";
import { ComplianceAgent } from "../../src/agents/compliance";
import { EventBus } from "../../src/core/event-bus";
import { childLogger } from "../../src/core/logger";

// Access private analyze via handle review_text
describe("ComplianceAgent", () => {
  const bus = new EventBus();
  const memory = {
    brandVoice: async () => "playful",
    remember: async () => ({}),
    recall: async () => null,
    search: async () => [],
    forget: async () => false,
    setWorking: async () => undefined,
    getWorking: async () => null,
    clearWorking: async () => undefined,
    setBrandVoice: async () => undefined,
    recordCampaignLesson: async () => undefined,
  };

  const agent = new ComplianceAgent({
    bus,
    memory: memory as never,
    logger: childLogger("test-compliance"),
  });

  it("flags prohibited content", async () => {
    const result = await agent.handle("review_text", {
      text: "this involves revenge porn material",
    });
    expect(result.ok).toBe(true);
    expect(result.data?.verdict).toBe("fail");
  });

  it("passes clean promotional copy", async () => {
    const result = await agent.handle("review_text", {
      text: "New exclusive drop — link in bio for the full set!",
    });
    expect(result.ok).toBe(true);
    expect(result.data?.verdict).toBe("pass");
  });

  it("needs review for very short text", async () => {
    const result = await agent.handle("review_text", { text: "hi" });
    expect(result.ok).toBe(true);
    expect(result.data?.verdict).toBe("needs_review");
  });
});
