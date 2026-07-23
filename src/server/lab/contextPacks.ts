import "server-only";

import { z } from "zod";
import { logLabRun } from "./logging";
import { callStructuredModel } from "./openaiStructured";
import { type TokenUsage } from "./tokenAccounting";
import {
  contextPackSchema,
  type AssignedSegment,
  type ContextPack,
  type LabInput,
  type NormalizedPersona,
  type RetrievedSource,
} from "../../lib/labSchemas";

const contextPackOutputSchema = contextPackSchema.omit({
  id: true,
  supportingSourceIds: true,
});

const batchedContextPackOutputSchema = z.object({
  contextPacks: z.array(contextPackOutputSchema).length(5),
});

export type ContextPackBatchResult = {
  packs: ContextPack[];
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

export async function buildContextPacks(
  input: LabInput,
  segments: AssignedSegment[],
  personasBySegment: Map<string, NormalizedPersona[]>,
  sourcesBySegment: Map<string, RetrievedSource[]>,
  options?: { runId?: string },
): Promise<ContextPackBatchResult> {
  if (options?.runId) {
    logLabRun(options.runId, "context-pack-batch-build", {
      segments: segments.length,
      sources: Array.from(sourcesBySegment.values()).reduce((total, sources) => total + sources.length, 0),
    });
  }

  const system = [
    "You build compact context packs for a synthetic-audience simulation.",
    "Return concise segment briefings grounded only in the supplied prompt, personas, and sources.",
    "Do not editorialize. Do not mention being an AI system.",
    "Use only the sources supplied to each segment; do not assume every person consumed them. Return one context pack per segment in the same order as the input segments.",
  ].join(" ");

  const user = JSON.stringify(
    {
      prompt: input.rawInput,
      segments: segments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        summary: segment.summary,
        concerns: segment.concerns,
        informationNeeds: segment.informationNeeds,
      })),
      segmentPersonas: segments.map((segment) => ({
        segmentId: segment.id,
        representativePersonas: (personasBySegment.get(segment.id) ?? []).map((persona) => ({
          name: persona.name,
          city: persona.city,
          occupation: persona.occupation,
          household: persona.household,
          concerns: persona.concerns,
          traits: persona.traits,
          profileNarrative: persona.profileNarrative,
        })),
      })),
      sourcesBySegment: segments.map((segment) => ({ segmentId: segment.id, sources: (sourcesBySegment.get(segment.id) ?? []).map((source) => ({ id: source.id, title: source.title, snippet: source.snippet, sourceName: source.sourceName, provenance: source.provenance })) })),
    },
    null,
    2,
  );

  const result = await callStructuredModel({
    schema: batchedContextPackOutputSchema,
    schemaName: "context_packs_batch",
    stageName: "ContextPackBuilderAgentBatch",
    system,
    user,
    runId: options?.runId,
    traceLabel: "context_packs_batch",
  });

  const packsBySegmentId = new Map(
    result.data.contextPacks.map((pack) => [
      pack.segmentId,
      contextPackSchema.parse({
        id: `context-pack-${pack.segmentId}`,
        supportingSourceIds: (sourcesBySegment.get(pack.segmentId) ?? []).map((source) => source.id),
        ...pack,
      }),
    ]),
  );

  const packs = segments.map((segment) => {
    const pack = packsBySegmentId.get(segment.id);
    if (!pack) {
      throw new Error(`Context pack batch missing segment ${segment.id}.`);
    }
    return pack;
  });

  if (packsBySegmentId.size !== segments.length) {
    throw new Error(`Context pack batch returned ${packsBySegmentId.size} packs for ${segments.length} segments.`);
  }

  return {
    packs,
    diagnostics: result.diagnostics,
    tokenUsage: result.tokenUsage,
  };
}
