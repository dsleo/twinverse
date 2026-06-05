import "server-only";

import { reactionResultSchema, type AssignedSegment, type ContextPack, type LabInput, type NormalizedPersona, type RetrievedSource } from "../../lib/labSchemas";
import { callStructuredModel } from "./openaiStructured";

const reactionOutputSchema = reactionResultSchema.omit({
  personaId: true,
  segmentId: true,
  contextPackId: true,
});

export async function buildReaction(
  input: LabInput,
  segment: AssignedSegment,
  persona: NormalizedPersona,
  contextPack: ContextPack,
  sources: RetrievedSource[],
) {
  const system = [
    "You simulate one French persona's reaction to a public prompt.",
    "Use only the supplied persona profile, segment framing, context pack, and sources.",
    "Return a structured reaction only.",
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
      persona: {
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
      },
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
    schema: reactionOutputSchema,
    schemaName: `reaction_${segment.id}_${persona.id}`,
    stageName: "ReactionAgent",
    system,
    user,
  });

  return {
    reaction: reactionResultSchema.parse({
      personaId: persona.id,
      segmentId: segment.id,
      contextPackId: contextPack.id,
      ...result.data,
    }),
    diagnostics: result.diagnostics,
  };
}
