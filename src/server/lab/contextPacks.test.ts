import { describe, expect, it } from "vitest";
import { batchedContextPackOutputSchema } from "./contextPacks";

const pack = {
  label: "Segment",
  conciseBriefing: "Concise briefing.",
  likelyKnownFacts: ["Known fact"],
  likelyIgnoredFacts: ["Ignored fact"],
  emotionalPrimers: ["Concern"],
  practicalImplications: ["Practical implication"],
  rationale: "Grounded in supplied sources.",
};

describe("batchedContextPackOutputSchema", () => {
  it("requires the requested number of known segment IDs", () => {
    const schema = batchedContextPackOutputSchema(["segment-a", "segment-b"]);

    expect(schema.safeParse({ contextPacks: [{ segmentId: "segment-a", ...pack }] }).success).toBe(false);
    expect(schema.safeParse({ contextPacks: [{ segmentId: "segment-a", ...pack }, { segmentId: "segment-c", ...pack }] }).success).toBe(false);
    expect(schema.safeParse({ contextPacks: [{ segmentId: "segment-a", ...pack }, { segmentId: "segment-b", ...pack }] }).success).toBe(true);
  });
});
