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

export function batchedContextPackOutputSchema(segmentIds: [string, ...string[]]) {
  return z.object({
    contextPacks: z.array(
      contextPackOutputSchema.extend({ segmentId: z.enum(segmentIds) }),
    ).length(segmentIds.length),
  });
}

function combineTokenUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    estimated: left.estimated || right.estimated,
  };
}

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

  if (segments.length === 0) {
    throw new Error("Context pack batch has no segments to build.");
  }

  const requestedSegmentIds = segments.map((segment) => segment.id) as [string, ...string[]];
  const outputSchema = batchedContextPackOutputSchema(requestedSegmentIds);
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

  let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const attemptUser = attempt === 1
      ? user
      : `${user}\n\nCorrection: return exactly one context pack for each of these segmentIds: ${requestedSegmentIds.join(", ")}.`;
    const result = await callStructuredModel({
      schema: outputSchema,
      schemaName: "context_packs_batch",
      stageName: "ContextPackBuilderAgentBatch",
      system,
      user: attemptUser,
      runId: options?.runId,
      traceLabel: `context_packs_batch:attempt-${attempt}`,
    });
    tokenUsage = combineTokenUsage(tokenUsage, result.tokenUsage);

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
    const packs = segments.map((segment) => packsBySegmentId.get(segment.id));
    if (packsBySegmentId.size === segments.length && packs.every((pack): pack is ContextPack => Boolean(pack))) {
      return { packs, diagnostics: result.diagnostics, tokenUsage };
    }

    lastError = new Error(`Context pack batch did not return one pack for each requested segment.`);
    if (options?.runId) {
      logLabRun(options.runId, "context-pack-batch-invalid", {
        attempt,
        expectedSegments: requestedSegmentIds.length,
        uniqueSegments: packsBySegmentId.size,
      });
    }
  }

  throw lastError ?? new Error("Context pack batch failed validation.");
}
