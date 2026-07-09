import { describe, expect, it } from "vitest";
import { localPersonaReply } from "../../src/api/routes/chat";

describe("localPersonaReply", () => {
  it("greets on hello", () => {
    const reply = localPersonaReply("hey there");
    expect(reply.toLowerCase()).toContain("lilly");
  });

  it("describes capabilities when asked for help", () => {
    const reply = localPersonaReply("help");
    expect(reply.toLowerCase()).toContain("plan");
  });

  it("echoes unknown messages with basic-mode notice", () => {
    const reply = localPersonaReply("what is the meaning of life?");
    expect(reply).toContain("what is the meaning of life?");
    expect(reply).toContain("basic mode");
  });

  it("truncates very long messages in the echo", () => {
    const long = "a".repeat(500);
    const reply = localPersonaReply(long);
    expect(reply.length).toBeLessThan(500);
    expect(reply).toContain("…");
  });

  it("always returns a non-empty string", () => {
    for (const input of ["", "thanks!", "status?", "random 123"]) {
      expect(localPersonaReply(input).length).toBeGreaterThan(0);
    }
  });
});
