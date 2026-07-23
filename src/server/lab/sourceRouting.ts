import type { AssignedSegment, NormalizedPersona, RetrievedSource, RetrievalPlan } from "../../lib/labSchemas";
import { logLabRun } from "./logging";

function terms(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((term) => term.length >= 4);
}

export function routeSourcesBySegment(
  segments: AssignedSegment[],
  personas: Map<string, NormalizedPersona[]>,
  sources: RetrievedSource[],
  plan?: RetrievalPlan,
  options?: { runId?: string },
) {
  const routed = new Map(segments.map((segment) => {
    const audienceTerms = new Set(terms([segment.label, segment.summary, ...segment.concerns, ...segment.informationNeeds, ...(personas.get(segment.id) ?? []).flatMap((persona) => [persona.occupation, ...persona.concerns])].join(" ")));
    const ranked = sources
      .filter((source) => source.provenance === "live")
      .filter((source) => {
        const task = plan?.providerDecisions.find((decision) => decision.provider === source.provider && decision.query === source.query);
        return !task || !task.segmentIds?.length || task.segmentIds.includes(segment.id);
      })
      .map((source) => ({ source, score: source.relevanceScore + terms(`${source.title} ${source.snippet}`).filter((term) => audienceTerms.has(term)).length * 0.08 }))
      .sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title))
      .slice(0, 3)
      .map(({ source }) => source);
    return [segment.id, ranked];
  }));
  if (options?.runId) {
    logLabRun(options.runId, "source-routing-complete", {
      segments: segments.length,
      liveSources: sources.filter((source) => source.provenance === "live").length,
      routedAssignments: Array.from(routed.values()).reduce((total, segmentSources) => total + segmentSources.length, 0),
    });
    for (const segment of segments) {
      const segmentSources = routed.get(segment.id) ?? [];
      logLabRun(options.runId, "source-routing-segment", {
        segmentId: segment.id,
        plannedTasks: plan?.providerDecisions.filter((task) => task.segmentIds.includes(segment.id)).length ?? 0,
        routedSources: segmentSources.length,
        providers: Array.from(new Set(segmentSources.map((source) => source.provider))).join(",") || null,
      });
    }
  }
  return routed;
}
