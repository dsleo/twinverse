import { describe, expect, it } from "vitest";
import { buildDecisionReportModel } from "./DecisionReport";
import type { PersistedLabRun } from "../../lib/labSchemas";

const baseRun: PersistedLabRun = {
  id: "lab-1",
  createdAt: "2026-06-05T08:00:00.000Z",
  updatedAt: "2026-06-05T08:00:01.000Z",
  status: "completed",
  mode: "manual",
  audiencePreset: "france_general",
  input: {
    rawInput: "Faut-il construire de nouvelles centrales nucleaires en France ?",
    inputType: "question",
  },
  promptSnapshot: "Faut-il construire de nouvelles centrales nucleaires en France ?",
  steps: [],
  panel: [],
  populationMap: {
    promptSummary: "Nuclear energy debate",
    topicDimensions: ["energy"],
    panelSampleVersion: "2026-06-04",
    panelPersonaIds: Array.from({ length: 20 }, (_, index) => `persona-${index}`),
    globalRationale: "Broad France-wide audience.",
    segments: [],
  },
  retrieval: {
    searchPhrase: "nucleaires france",
    outcomes: [
      {
        provider: "wikipedia",
        status: "success",
        query: "nucleaires france",
        sourceCount: 1,
        message: "Wikipedia returned one source.",
        diagnostics: {},
      },
    ],
    sources: [
      {
        id: "source-1",
        provider: "wikipedia",
        provenance: "live",
        title: "Nuclear energy in France",
        snippet: "Background context.",
        sourceName: "Wikipedia",
        query: "nucleaires france",
        relevanceScore: 0.9,
        tags: ["background"],
      },
    ],
  },
  contextPacks: [],
  reactions: [
    {
      personaId: "persona-1",
      segmentId: "segment-1",
      contextPackId: "pack-1",
      stance: "oppose",
      emotionalState: "concerned",
      confidence: 4,
      keyDrivers: ["cost"],
      reactionSummary: "Worried about cost.",
      quote: "This seems expensive.",
      perceivedImpact: "Higher bills.",
      misunderstanding: "May assume all costs hit households immediately.",
    },
    {
      personaId: "persona-2",
      segmentId: "segment-2",
      contextPackId: "pack-2",
      stance: "mixed",
      emotionalState: "skeptical",
      confidence: 3,
      keyDrivers: ["safety"],
      reactionSummary: "Sees tradeoffs.",
      quote: "I need more proof.",
      perceivedImpact: "Energy security.",
      misunderstanding: null,
    },
  ],
  aggregateReport: {
    executiveSummary: "The panel is not settled.",
    overallPattern: "Resistance and uncertainty outweigh support.",
    perSegmentSummary: [
      {
        segmentId: "segment-1",
        label: "Cost-sensitive households",
        dominantStance: "oppose",
        emotionalTone: "concerned",
        keyDrivers: ["cost", "bills"],
        representativeQuotes: ["This seems expensive."],
      },
      {
        segmentId: "segment-2",
        label: "Security pragmatists",
        dominantStance: "mixed",
        emotionalTone: "skeptical",
        keyDrivers: ["security", "proof"],
        representativeQuotes: ["I need more proof."],
      },
      {
        segmentId: "segment-3",
        label: "Climate-first supporters",
        dominantStance: "support",
        emotionalTone: "hopeful",
        keyDrivers: ["climate"],
        representativeQuotes: ["It could help."],
      },
      {
        segmentId: "segment-4",
        label: "Local skeptics",
        dominantStance: "oppose",
        emotionalTone: "concerned",
        keyDrivers: ["local risk"],
        representativeQuotes: ["Not near us."],
      },
      {
        segmentId: "segment-5",
        label: "Budget watchers",
        dominantStance: "mixed",
        emotionalTone: "calm",
        keyDrivers: ["tax"],
        representativeQuotes: ["Show the bill."],
      },
    ],
    mainDivergences: [
      {
        title: "Cost versus security",
        description: "Energy security helps, but household cost creates resistance.",
        affectedSegmentIds: ["segment-1", "segment-2"],
      },
      {
        title: "Trust in delivery",
        description: "Support depends on trust in implementation.",
        affectedSegmentIds: ["segment-3", "segment-5"],
      },
      {
        title: "Local risk",
        description: "Location changes the reaction.",
        affectedSegmentIds: ["segment-4"],
      },
    ],
    caveats: ["Synthetic simulation only.", "Not a representative poll.", "Depends on retrieved sources."],
  },
  tvSchedule: [],
  tvViewingChoices: [],
  tvPredictions: [],
  rawModelDiagnostics: [],
};

describe("buildDecisionReportModel", () => {
  it("compresses aggregate output into an actionable report model", () => {
    const model = buildDecisionReportModel(baseRun);

    expect(model?.metrics.find((metric) => metric.label === "Resistance")?.value).toBe("50%");
    expect(model?.divergences).toHaveLength(2);
    expect(model?.title).toBe(
      "What the France-wide panel takes from this question",
    );
    expect(model?.lead).toBe("Resistance and uncertainty outweigh support.");
  });

  it("does not produce a report while aggregation is missing", () => {
    expect(buildDecisionReportModel({ ...baseRun, aggregateReport: undefined })).toBeNull();
  });
});
