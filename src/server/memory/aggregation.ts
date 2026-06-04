import "server-only";

import { aggregationResultSchema, type AssignedSegment, type ContextPack, type MemoryInput, type ReactionResult, type RetrievedSource } from "../../lib/memorySchemas";
import { callStructuredModel } from "./openaiStructured";

export async function buildAggregation(input: MemoryInput, segments: AssignedSegment[], contextPacks: ContextPack[], reactions: ReactionResult[], sources: RetrievedSource[]) {
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
  });

  return {
    report: aggregationResultSchema.parse(result.data),
    diagnostics: result.diagnostics,
  };
}
