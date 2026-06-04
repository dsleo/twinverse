import { afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";

vi.mock("./personaSample", () => ({
  loadPersonaSample: vi.fn(async () => ({
    dataset: "nvidia/Nemotron-Personas-France",
    fetchedAt: new Date().toISOString(),
    sampleVersion: "2026-06-04",
    sampleSize: 100,
    personas: [],
  })),
}));

vi.mock("./populationMapping", () => ({
  mapPopulationToPanel: vi.fn(async () => ({
    assignment: {
      promptSummary: "Nuclear build-out in France",
      topicDimensions: ["energy"],
      panelSampleVersion: "2026-06-04",
      panelPersonaIds: Array.from({ length: 20 }, (_, index) => `persona-${index}`),
      segments: Array.from({ length: 5 }, (_, index) => ({
        id: `segment-${index}`,
        label: `Segment ${index + 1}`,
        summary: `Summary ${index + 1}`,
        concerns: ["cost"],
        informationNeeds: ["timeline"],
        inclusionTags: [{ family: "employment_class", values: ["working_class"] }],
        exclusionTags: [],
        preferredDiversityHints: [],
        rankingCriteria: ["cost"],
        memberPersonaIds: [`persona-${index * 4}`, `persona-${index * 4 + 1}`, `persona-${index * 4 + 2}`, `persona-${index * 4 + 3}`],
        representativePersonaIds: [`persona-${index * 4}`, `persona-${index * 4 + 1}`, `persona-${index * 4 + 2}`],
        evaluatedPersonaIds: [`persona-${index * 4}`, `persona-${index * 4 + 1}`],
      })),
      globalRationale: "Synthetic rationale",
    },
    panel: Array.from({ length: 20 }, (_, index) => ({
      id: `persona-${index}`,
      sourceRowId: `row-${index}`,
      sourceDataset: "nvidia/Nemotron-Personas-France",
      sourceSampleVersion: "2026-06-04",
      name: `Persona ${index}`,
      age: 30 + index,
      city: "Paris",
      region: "France",
      occupation: "working_class",
      household: "family_household",
      economicPosture: "cost_sensitive",
      housingStatus: "mixed_housing",
      mobilityProfile: "transit_oriented",
      urbanicity: "major_urban",
      traits: ["pragmatic"],
      concerns: ["cost of living"],
      profileNarrative: "Profile",
      assignmentMetadata: {
        life_stage: "midcareer",
        household_type: "family_household",
        employment_class: "working_class",
        income_posture: "cost_sensitive",
        housing_status: "mixed_housing",
        mobility_profile: "transit_oriented",
        urbanicity: "major_urban",
        region_family: "ile_de_france",
        public_service_dependency: "medium",
        policy_exposure_tags: ["family_budget_exposure"],
        economic_vulnerability_tags: ["high_cost_of_living_pressure"],
        trust_orientation_tags: ["pragmatic"],
        issue_salience_tags: ["cost_of_living"],
      },
    })),
    diagnostics: { name: "PopulationMapperAgent", model: "test", outputText: "{}" },
  })),
}));

vi.mock("./retrieval", () => ({
  retrieveSources: vi.fn(async () => ({
    searchPhrase: "centrales nucleaires",
    outcomes: [
      { provider: "wikipedia", status: "success", query: "nucleaire", sourceCount: 1, message: "ok", diagnostics: {} },
    ],
    sources: [
      {
        id: "source-1",
        provider: "wikipedia",
        provenance: "live",
        title: "Énergie nucléaire en France",
        snippet: "Contexte factuel.",
        query: "nucleaire",
        relevanceScore: 0.9,
        tags: ["background"],
        sourceName: "Wikipedia",
      },
    ],
  })),
}));

vi.mock("./contextPacks", () => ({
  buildContextPack: vi.fn(async (_input, segment) => ({
    pack: {
      id: `context-pack-${segment.id}`,
      segmentId: segment.id,
      label: segment.label,
      conciseBriefing: "Briefing",
      likelyKnownFacts: ["Known fact"],
      likelyIgnoredFacts: ["Ignored fact"],
      emotionalPrimers: ["Primer"],
      practicalImplications: ["Practical implication"],
      rationale: "Rationale",
      supportingSourceIds: ["source-1"],
    },
    diagnostics: { name: "ContextPackBuilderAgent", model: "test", outputText: "{}" },
  })),
}));

vi.mock("./reactions", () => ({
  buildReaction: vi.fn(async (_input, segment, persona, contextPack) => ({
    reaction: {
      personaId: persona.id,
      segmentId: segment.id,
      contextPackId: contextPack.id,
      stance: "mixed",
      emotionalState: "concerned",
      confidence: 3,
      keyDrivers: ["cost"],
      reactionSummary: "Needs proof.",
      quote: "Je veux voir les chiffres.",
      perceivedImpact: "Could affect bills.",
      misunderstanding: null,
    },
    diagnostics: { name: "ReactionAgent", model: "test", outputText: "{}" },
  })),
}));

vi.mock("./aggregation", () => ({
  buildAggregation: vi.fn(async (_input, segments) => ({
    report: {
      executiveSummary: "The evaluated panel is split.",
      perSegmentSummary: segments.map((segment: { id: string; label: string }) => ({
        segmentId: segment.id,
        label: segment.label,
        dominantStance: "mixed",
        emotionalTone: "concerned",
        keyDrivers: ["cost"],
        representativeQuotes: ["Je veux voir les chiffres."],
      })),
      mainDivergences: [{ title: "Cost vs trust", description: "The split follows cost and trust.", affectedSegmentIds: ["segment-0"] }],
      overallPattern: "Exposure and trust drive the split.",
      caveats: [
        "This is a synthetic simulation.",
        "This is not a representative poll.",
        "Results depend on retrieved sources, context-pack design, and model behavior.",
      ],
    },
    diagnostics: { name: "AggregatorAgent", model: "test", outputText: "{}" },
  })),
}));

import { createMemoryRun, executeMemoryRun } from "./pipeline";
import { readRun } from "./persistence";

const dataDir = path.join(process.cwd(), "data");

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dataDir, { recursive: true, force: true });
});

describe("executeMemoryRun", () => {
  it("persists a completed run with real stage transitions and ten evaluated personas", async () => {
    const run = await createMemoryRun({
      rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      inputType: "question",
    });

    await executeMemoryRun(run.id);
    const persisted = await readRun(run.id);

    expect(persisted.status).toBe("completed");
    expect(persisted.steps.every((step) => step.status === "completed")).toBe(true);
    expect(persisted.contextPacks).toHaveLength(5);
    expect(persisted.reactions).toHaveLength(10);
    expect(persisted.aggregateReport?.perSegmentSummary).toHaveLength(5);
  });
});
