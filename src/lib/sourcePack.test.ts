import { describe, expect, it } from "vitest";
import { getSourcePack, searchSourcePack } from "./sourcePack";

describe("sourcePack", () => {
  it("builds a source pack per demo", () => {
    const pack = getSourcePack("opinion");
    expect(pack.demo).toBe("opinion");
    expect(pack.questionBank).toHaveLength(1);
    expect(pack.eventBriefs.length).toBeGreaterThan(0);
    expect(pack.sources.length).toBeGreaterThan(0);
    expect(pack.freshness).toBe("updated today");
  });

  it("narrows results when tags match", () => {
    const pack = searchSourcePack("retail", ["subscription", "consumer_confidence"]);
    expect(pack.eventBriefs.some((brief) => brief.id === "brief-retail")).toBe(true);
    expect(pack.sources.every((source) => source.tags.includes("consumer_confidence") || source.tags.includes("AI"))).toBe(true);
  });

  it("falls back to full pack when tags do not match", () => {
    const pack = searchSourcePack("b2b", ["nonexistent"]);
    expect(pack.eventBriefs).toHaveLength(getSourcePack("b2b").eventBriefs.length);
    expect(pack.sources).toHaveLength(getSourcePack("b2b").sources.length);
  });
});
