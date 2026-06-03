import { describe, expect, it } from "vitest";
import { compileScenario } from "./scenarioCompiler";

describe("scenarioCompiler", () => {
  it("compiles a packet for each demo", () => {
    for (const demo of ["opinion", "retail", "b2b"] as const) {
      const result = compileScenario(demo);
      expect(result.packet.scenario.demo).toBe(demo);
      expect(result.packet.question.demo).toBe(demo);
      expect(result.responses.length).toBeGreaterThan(0);
      expect(result.segments.length).toBe(3);
      expect(result.narrative.length).toBeGreaterThan(20);
    }
  });

  it("attaches evidence references to every persona response", () => {
    const result = compileScenario("opinion");
    expect(result.responses.every((response) => response.evidenceReferences.length > 0)).toBe(true);
    expect(result.responses.every((response) => response.confidence >= 0 && response.confidence <= 1)).toBe(true);
  });

  it("changes the output when a different scenario variant is selected", () => {
    const protection = compileScenario("opinion", "opinion-protection");
    const discipline = compileScenario("opinion", "opinion-discipline");

    expect(protection.summary).not.toBe(discipline.summary);
    expect(protection.segments[0].support).not.toBe(discipline.segments[0].support);
    expect(protection.responses[0].effectOfRecentEvents).not.toBe(discipline.responses[0].effectOfRecentEvents);
  });
});
