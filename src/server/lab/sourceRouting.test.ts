import { describe, expect, it } from "vitest";
import type { AssignedSegment, NormalizedPersona, RetrievedSource, RetrievalPlan } from "../../lib/labSchemas";
import { routeSourcesBySegment } from "./sourceRouting";

const segment = (id: string): AssignedSegment => ({
  id,
  label: id,
  summary: "A source-aware segment.",
  concerns: ["public safety"],
  informationNeeds: ["reliable information"],
  inclusionTags: [{ family: "employment_class", values: ["working_class"] }],
  exclusionTags: [],
  preferredDiversityHints: [],
  rankingSignals: [],
  rankingCriteria: ["public safety"],
  memberPersonaIds: [],
  representativePersonaIds: [],
  evaluatedPersonaIds: ["persona-a", "persona-b"],
});

const source = (id: string, query: string): RetrievedSource => ({
  id,
  provider: "rss",
  provenance: "live",
  title: "Fire response update",
  snippet: "Public safety information.",
  query,
  relevanceScore: 0.8,
  tags: [],
});

describe("routeSourcesBySegment", () => {
  it("only routes a planned source to its intended segments", () => {
    const segments = [segment("segment-a"), segment("segment-b")];
    const plan: RetrievalPlan = {
      inputTerms: ["fire"],
      providerDecisions: [{ provider: "rss", query: "fire response", segmentIds: ["segment-a"], reason: "Fire response coverage.", triggeredBy: ["segment-a"], confidence: 0.8 }],
      skippedProviders: [],
      queryVariants: ["fire response"],
    };
    const routed = routeSourcesBySegment(segments, new Map<string, NormalizedPersona[]>(), [source("source-1", "fire response")], plan);

    expect(routed.get("segment-a")?.map((item) => item.id)).toEqual(["source-1"]);
    expect(routed.get("segment-b")).toEqual([]);
  });
});
