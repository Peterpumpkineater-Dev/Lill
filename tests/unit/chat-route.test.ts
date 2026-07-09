import { describe, it, expect } from "vitest";
import { creatorPersonaReply } from "../../src/api/routes/chat";

describe("creatorPersonaReply", () => {
  it("greets as flirty Lilly", () => {
    const reply = creatorPersonaReply("hey there");
    expect(reply.toLowerCase()).toContain("lilly");
  });

  it("responds to pic requests", () => {
    const reply = creatorPersonaReply("send me a pic");
    expect(reply.toLowerCase()).toMatch(/pic|tease|page|show/);
  });

  it("blocks underage topics", () => {
    const reply = creatorPersonaReply("something underage");
    expect(reply.toLowerCase()).toMatch(/nope|don't|adult/);
  });

  it("handles spicy keywords", () => {
    const reply = creatorPersonaReply("you're so sexy");
    expect(reply.length).toBeGreaterThan(10);
  });

  it("always returns a non-empty string", () => {
    for (const input of ["thanks!", "status?", "random 123", "hi"]) {
      expect(creatorPersonaReply(input).length).toBeGreaterThan(0);
    }
  });
});
