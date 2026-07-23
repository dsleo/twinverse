import "server-only";

import { z } from "zod";
import { reactionResultSchema, type AssignedSegment, type ContextPack, type LabInput, type NormalizedPersona, type RetrievedSource } from "../../lib/labSchemas";
import { logLabRun } from "./logging";
import { callStructuredModel } from "./openaiStructured";
import { type TokenUsage } from "./tokenAccounting";

const reactionOutputSchema = reactionResultSchema.omit({
  personaId: true,
  segmentId: true,
  contextPackId: true,
});

export function batchedReactionOutputSchema(personaIds: [string, ...string[]]) {
  return z.object({
    reactions: z.array(
      z.object({
        personaId: z.enum(personaIds),
        ...reactionOutputSchema.shape,
      }),
    ).length(personaIds.length),
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

export type ReactionBatchResult = {
  reactions: z.infer<typeof reactionResultSchema>[];
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

export async function buildReactionsForSegment(
  input: LabInput,
  segment: AssignedSegment,
  personas: NormalizedPersona[],
  contextPack: ContextPack,
  sources: RetrievedSource[],
  options?: { runId?: string },
): Promise<ReactionBatchResult> {
  if (options?.runId) {
    logLabRun(options.runId, "reaction-batch-build", {
      segment: segment.id,
      personas: personas.length,
      sources: sources.length,
    });
  }

  if (personas.length === 0) {
    throw new Error(`Reaction batch for ${segment.id} has no personas to evaluate.`);
  }

  const requestedPersonaIds = personas.map((persona) => persona.id) as [string, ...string[]];
  const outputSchema = batchedReactionOutputSchema(requestedPersonaIds);
  const personaIds = new Set(requestedPersonaIds);
  const system = [
    "You simulate French personas' reactions to a public prompt.",
    "Use only the supplied persona profiles, segment framing, context pack, and sources.",
    "Return exactly one structured reaction per provided persona.",
    "Each reaction must include the matching personaId from the input.",
  ].join(" ");

  const user = JSON.stringify(
    {
      prompt: input.rawInput,
      segment: {
        label: segment.label,
        summary: segment.summary,
        concerns: segment.concerns,
        informationNeeds: segment.informationNeeds,
      },
      personas: personas.map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        age: persona.age,
        city: persona.city,
        region: persona.region,
        occupation: persona.occupation,
        household: persona.household,
        economicPosture: persona.economicPosture,
        concerns: persona.concerns,
        traits: persona.traits,
        profileNarrative: persona.profileNarrative,
      })),
      contextPack,
      sources: sources.map((source) => ({
        title: source.title,
        snippet: source.snippet,
        sourceName: source.sourceName,
      })),
    },
    null,
    2,
  );

  let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const attemptUser = attempt === 1
      ? user
      : `${user}\n\nCorrection: return exactly one reaction for each of these personaIds: ${requestedPersonaIds.join(", ")}.`;
    const result = await callStructuredModel({
      schema: outputSchema,
      schemaName: `reactions_${segment.id}`,
      stageName: "ReactionAgentBatch",
      system,
      user: attemptUser,
      runId: options?.runId,
      traceLabel: `reactions:${segment.id}:attempt-${attempt}`,
    });
    tokenUsage = combineTokenUsage(tokenUsage, result.tokenUsage);

    const reactions = result.data.reactions.map((reaction) => {
      const { personaId, ...reactionData } = reaction;
      return reactionResultSchema.parse({
        personaId,
        segmentId: segment.id,
        contextPackId: contextPack.id,
        ...reactionData,
      });
    });

    const returnedPersonaIds = reactions.map((reaction) => reaction.personaId);
    if (new Set(returnedPersonaIds).size === reactions.length && returnedPersonaIds.every((personaId) => personaIds.has(personaId))) {
      return { reactions, diagnostics: result.diagnostics, tokenUsage };
    }

    lastError = new Error(`Reaction batch for ${segment.id} did not return one reaction for each requested persona.`);
    if (options?.runId) {
      logLabRun(options.runId, "reaction-batch-invalid", {
        segment: segment.id,
        attempt,
        expectedPersonas: requestedPersonaIds.length,
        returnedPersonas: reactions.length,
        uniquePersonas: new Set(returnedPersonaIds).size,
      });
    }
  }

  throw lastError ?? new Error(`Reaction batch for ${segment.id} failed validation.`);
}
