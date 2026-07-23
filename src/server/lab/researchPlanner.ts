import "server-only";

import { z } from "zod";
import { type LabInput, providerDecisionSchema, type PopulationSegmentSpec, retrievalPlanSchema, type RetrievalPlan } from "../../lib/labSchemas";
import { callStructuredModel, type StructuredCallResult } from "./openaiStructured";
import type { TokenUsage } from "./tokenAccounting";

const plannerSchema = z.object({ tasks: z.array(providerDecisionSchema).min(1).max(6) });
type PlannerDiagnostics = StructuredCallResult<z.infer<typeof plannerSchema>>["diagnostics"];

type ResearchPlanResult = {
  plan: RetrievalPlan;
  diagnostics: PlannerDiagnostics;
  tokenUsage: TokenUsage;
};

export async function planSegmentResearch(
  input: LabInput,
  segments: PopulationSegmentSpec[],
  options?: { runId?: string },
): Promise<ResearchPlanResult> {
  const system = [
    "You are a source research planner for an audience simulation.",
    "Plan the smallest useful set of source retrieval requests for the supplied question and segments.",
    "Do not retrieve, invent sources, URLs, facts, or results.",
    "A source can be relevant to a segment without proving every person consumed it.",
    "Reuse a search when the same information is relevant to multiple segments; never duplicate a provider/query pair.",
    "Use wikipedia only for stable concepts, rss for current reporting, vie_publique for institutional context, data_gouv for official datasets, and reddit only for public-discourse language.",
    "Do not query every provider by default. Use concise faithful search queries, not raw conversational questions.",
    "Each task must include the segmentIds it is intended to inform, a concise reason, and the triggering segment concerns. Maximum six tasks and at most two RSS tasks. Return structured tasks only.",
  ].join(" ");
  const user = JSON.stringify(
    {
      userQuestion: input.rawInput,
      segments: segments.map(({ id, label, summary, concerns, informationNeeds }) => ({ id, label, summary, concerns, informationNeeds })),
      approvedProviders: ["wikipedia", "rss", "vie_publique", "data_gouv", "reddit"],
    },
    null,
    2,
  );
  const result = await callStructuredModel({
    schema: plannerSchema,
    schemaName: "research_plan",
    stageName: "ResearchPlannerAgent",
    system,
    user,
    runId: options?.runId,
    traceLabel: "research_planner",
  });
  const seen = new Set<string>();
  const knownSegmentIds = new Set(segments.map((segment) => segment.id));
  const providerCounts = new Map<string, number>();
  const decisions = result.data.tasks.filter((task) => {
    const key = `${task.provider}:${task.query.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    const valid = task.query.trim().length > 2 && task.segmentIds.length > 0 && task.segmentIds.every((segmentId) => knownSegmentIds.has(segmentId));
    if (!valid) return false;
    const maxTasksForProvider = task.provider === "rss" ? 2 : 1;
    const count = providerCounts.get(task.provider) ?? 0;
    if (count >= maxTasksForProvider) return false;
    seen.add(key);
    providerCounts.set(task.provider, count + 1);
    return true;
  });
  if (decisions.length === 0) throw new Error("Research planner returned no valid retrieval tasks.");
  return {
    plan: retrievalPlanSchema.parse({
      inputTerms: [input.rawInput],
      providerDecisions: decisions,
      skippedProviders: [],
      queryVariants: Array.from(new Set(decisions.map((task) => task.query))),
    }),
    diagnostics: result.diagnostics,
    tokenUsage: result.tokenUsage,
  };
}
