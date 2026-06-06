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
  buildReactionsForSegment: vi.fn(async (_input, segment, personas, contextPack) => ({
    reactions: personas.map((persona: { id: string }) => ({
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
    })),
    diagnostics: { name: "ReactionAgentBatch", model: "test", outputText: "{}" },
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

import { createLabRun, executeLabRun } from "./pipeline";
import { readRun } from "./persistence";
import { mapPopulationToPanel } from "./populationMapping";
import { retrieveSources } from "./retrieval";

const dataDir = path.join(process.cwd(), ".tmp-tests", "pipeline");

afterEach(async () => {
  vi.restoreAllMocks();
  process.env.LAB_DATA_ROOT = dataDir;
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.LAB_DATA_ROOT;
});

describe("executeLabRun", () => {
  it("persists a completed run with real stage transitions and ten evaluated personas", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const run = await createLabRun({
      input: {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      mode: "le_figaro_daily",
      audiencePreset: "le_figaro_reader",
      promptSnapshot: "Faut-il construire de nouvelles centrales nucléaires en France ?",
      promptSource: {
        publisher: "Le Figaro",
        label: "Question du jour",
        url: "https://video.lefigaro.fr/figaro/la-question-du-jour",
        questionDate: "2026-06-05",
        fetchedAt: new Date().toISOString(),
        cacheStatus: "fresh",
      },
    });

    await executeLabRun(run.id);
    const persisted = await readRun(run.id);

    expect(persisted.status).toBe("completed");
    expect(persisted.mode).toBe("le_figaro_daily");
    expect(persisted.audiencePreset).toBe("le_figaro_reader");
    expect(persisted.promptSnapshot).toContain("centrales nucléaires");
    expect(persisted.promptSource?.publisher).toBe("Le Figaro");
    expect(persisted.steps.every((step) => step.status === "completed")).toBe(true);
    expect(persisted.contextPacks).toHaveLength(5);
    expect(persisted.reactions).toHaveLength(10);
    expect(persisted.aggregateReport?.perSegmentSummary).toHaveLength(5);
  });

  it("fails the retrieval stage without leaking an unhandled rejection when retrieval rejects early", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    vi.mocked(retrieveSources).mockImplementationOnce(async () => {
      throw new Error("retrieval exploded");
    });
    vi.mocked(mapPopulationToPanel).mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
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
                    rankingSignals: [],
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
              }),
            20,
          );
        }),
    );

    const run = await createLabRun({
      input: {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      mode: "manual",
      audiencePreset: "france_general",
      promptSnapshot: "Faut-il construire de nouvelles centrales nucléaires en France ?",
    });

    const unhandled: unknown[] = [];
    const handler = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", handler);

    try {
      await executeLabRun(run.id);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", handler);
    }

    const persisted = await readRun(run.id);
    expect(unhandled).toEqual([]);
    expect(persisted.status).toBe("failed");
    expect(persisted.steps.find((step) => step.id === "retrieval")?.status).toBe("failed");
    expect(persisted.steps.find((step) => step.id === "population_mapping")?.status).toBe("completed");
    expect(persisted.steps.some((step) => step.status === "running")).toBe(false);
    expect(persisted.error).toContain("retrieval exploded");
  });
});
