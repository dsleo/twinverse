import { describe, expect, it } from "vitest";
import {
  getPersona,
  getScenario,
  listCompetitorFacts,
  listEventBriefs,
  listMarketFacts,
  listQuestionBankEntries,
  listSourceReferences,
} from "./contentRepository";

describe("contentRepository", () => {
  it("returns validated source references", () => {
    const sources = listSourceReferences();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((source) => source.url.startsWith("https://"))).toBe(true);
  });

  it("selects demo-specific content", () => {
    expect(listEventBriefs("opinion").every((brief) => brief.demo === "opinion")).toBe(true);
    expect(listQuestionBankEntries("retail")).toHaveLength(1);
    expect(listMarketFacts("b2b")).toHaveLength(2);
    expect(listCompetitorFacts("opinion")).toEqual([]);
  });

  it("provides stable lookups for personas and scenarios", () => {
    expect(getPersona("p-1").name).toBe("Epse Janiak");
    expect(getScenario("b2b").title).toBe("AI Back-Office Pilot");
  });

  it("throws on missing entities", () => {
    expect(() => getPersona("missing")).toThrow(/Unknown persona/);
  });
});
