import { describe, expect, it } from "vitest";
import { batchedReactionOutputSchema } from "./reactions";

const reaction = {
  stance: "mixed",
  emotionalState: "concerned",
  confidence: 3,
  keyDrivers: ["public safety"],
  reactionSummary: "Needs more evidence.",
  quote: "I would like clearer information.",
  perceivedImpact: "Local safety.",
  misunderstanding: null,
};

describe("batchedReactionOutputSchema", () => {
  it("requires exactly one response for each requested persona", () => {
    const schema = batchedReactionOutputSchema(["persona-a", "persona-b"]);

    expect(schema.safeParse({ reactions: [{ personaId: "persona-a", ...reaction }] }).success).toBe(false);
    expect(schema.safeParse({ reactions: [{ personaId: "persona-a", ...reaction }, { personaId: "persona-c", ...reaction }] }).success).toBe(false);
    expect(schema.safeParse({ reactions: [{ personaId: "persona-a", ...reaction }, { personaId: "persona-b", ...reaction }] }).success).toBe(true);
  });
});
