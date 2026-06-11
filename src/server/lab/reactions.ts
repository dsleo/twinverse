import "server-only";

import { z } from "zod";
import { reactionResultSchema, type AssignedSegment, type ContextPack, type LabInput, type NormalizedPersona, type RetrievedSource } from "../../lib/labSchemas";
import { logLabRun } from "./logging";
import { callStructuredModel } from "./openaiStructured";

const reactionOutputSchema = reactionResultSchema.omit({
  personaId: true,
  segmentId: true,
  contextPackId: true,
});

const batchedReactionOutputSchema = z.object({
  reactions: z.array(
    z.object({
      personaId: z.string().min(1),
      ...reactionOutputSchema.shape,
    }),
  ).min(1),
});

export async function buildReactionsForSegment(
  input: LabInput,
  segment: AssignedSegment,
  personas: NormalizedPersona[],
  contextPack: ContextPack,
  sources: RetrievedSource[],
  options?: { runId?: string },
) {
  if (options?.runId) {
    logLabRun(options.runId, "reaction-batch-build", {
      segment: segment.id,
      personas: personas.length,
      sources: sources.length,
    });
  }

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

  const result = await callStructuredModel({
    schema: batchedReactionOutputSchema,
    schemaName: `reactions_${segment.id}`,
    stageName: "ReactionAgentBatch",
    system,
    user,
    runId: options?.runId,
    traceLabel: `reactions:${segment.id}`,
  });

  const personaIds = new Set(personas.map((persona) => persona.id));
  const reactions = result.data.reactions.map((reaction) => {
    const { personaId, ...reactionData } = reaction;
    return reactionResultSchema.parse({
      personaId,
      segmentId: segment.id,
      contextPackId: contextPack.id,
      ...reactionData,
    });
  });

  if (reactions.length !== personas.length) {
    throw new Error(`Reaction batch for ${segment.id} returned ${reactions.length} reactions for ${personas.length} personas.`);
  }

  if (new Set(reactions.map((reaction) => reaction.personaId)).size !== reactions.length) {
    throw new Error(`Reaction batch for ${segment.id} returned duplicate persona ids.`);
  }

  if (reactions.some((reaction) => !personaIds.has(reaction.personaId))) {
    throw new Error(`Reaction batch for ${segment.id} returned an unknown persona id.`);
  }

  return {
    reactions,
    diagnostics: result.diagnostics,
  };
}
