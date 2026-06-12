import "server-only";

import { z } from "zod";
import { aggregationResultSchema, type AssignedSegment, type ContextPack, type LabInput, type ReactionResult, type RetrievedSource } from "../../lib/labSchemas";
import { logLabRun } from "./logging";
import { callStructuredModel } from "./openaiStructured";
import { type TokenUsage } from "./tokenAccounting";

export type AggregationResult = {
  report: z.infer<typeof aggregationResultSchema>;
  diagnostics: {
    name: string;
    model: string;
    responseId?: string;
    outputText: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokenUsageEstimated: boolean;
  };
  tokenUsage: TokenUsage;
};

export async function buildAggregation(
  input: LabInput,
  segments: AssignedSegment[],
  contextPacks: ContextPack[],
  reactions: ReactionResult[],
  sources: RetrievedSource[],
  options?: { runId?: string },
): Promise<AggregationResult> {
  if (options?.runId) {
    logLabRun(options.runId, "aggregation-build", {
      segments: segments.length,
      reactions: reactions.length,
      sources: sources.length,
    });
  }

  const system = [
    "You aggregate persona-level reactions into a concise divergence report.",
    "Speak only about the evaluated personas. Do not imply that unevaluated personas were directly simulated.",
    "Keep the report grounded in the supplied reactions, packs, and source evidence.",
  ].join(" ");

  const user = JSON.stringify(
    {
      prompt: input.rawInput,
      segments: segments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        summary: segment.summary,
      })),
      contextPacks: contextPacks.map((pack) => ({
        segmentId: pack.segmentId,
        label: pack.label,
        conciseBriefing: pack.conciseBriefing,
        practicalImplications: pack.practicalImplications,
      })),
      reactions,
      sources: sources.map((source) => ({
        title: source.title,
        sourceName: source.sourceName,
        provenance: source.provenance,
      })),
      caveatInstructions: [
        "This is a synthetic simulation.",
        "This is not a representative poll.",
        "Results depend on retrieved sources, context-pack design, and model behavior.",
      ],
    },
    null,
    2,
  );

  const result = await callStructuredModel({
    schema: aggregationResultSchema,
    schemaName: "aggregation_report",
    stageName: "AggregatorAgent",
    system,
    user,
    runId: options?.runId,
    traceLabel: "aggregation_report",
  });

  return {
    report: aggregationResultSchema.parse(result.data),
    diagnostics: result.diagnostics,
    tokenUsage: result.tokenUsage,
  };
}
