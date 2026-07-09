import { describe, it, expect } from "vitest";
import { slugify, clamp } from "../../src/utils";
import { createDefaultAdapters } from "../../src/services/platforms";

describe("utils", () => {
  it("slugify", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("platform adapters", () => {
  it("simulates publish", async () => {
    const adapters = createDefaultAdapters();
    const reddit = adapters.find((a) => a.platform === "reddit");
    expect(reddit).toBeDefined();
    const result = await reddit!.publish({
      title: "test",
      body: "body",
      caption: "caption with traffic",
      mediaUrls: [],
      trafficUrl: "https://example.com/onlyfans",
      tags: ["test"],
    });
    expect(result.externalId).toContain("reddit_");
    expect(result.externalUrl).toContain("reddit");
  });
});
