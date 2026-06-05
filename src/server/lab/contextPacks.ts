import "server-only";

import { z } from "zod";
import { callStructuredModel } from "./openaiStructured";
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
  segmentId: true,
  supportingSourceIds: true,
});

export async function buildContextPack(input: LabInput, segment: AssignedSegment, personas: NormalizedPersona[], sources: RetrievedSource[]) {
  const system = [
    "You build compact context packs for a French synthetic-audience simulation.",
    "Return a concise segment briefing grounded only in the supplied prompt, personas, and sources.",
    "Do not editorialize. Do not mention being an AI system.",
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
      representativePersonas: personas.map((persona) => ({
        name: persona.name,
        city: persona.city,
        occupation: persona.occupation,
        household: persona.household,
        concerns: persona.concerns,
        traits: persona.traits,
        profileNarrative: persona.profileNarrative,
      })),
      sources: sources.map((source) => ({
        title: source.title,
        snippet: source.snippet,
        sourceName: source.sourceName,
        provenance: source.provenance,
      })),
    },
    null,
    2,
  );

  const result = await callStructuredModel({
    schema: contextPackOutputSchema,
    schemaName: `context_pack_${segment.id}`,
    stageName: "ContextPackBuilderAgent",
    system,
    user,
  });

  const pack = contextPackSchema.parse({
    id: `context-pack-${segment.id}`,
    segmentId: segment.id,
    supportingSourceIds: sources.map((source) => source.id).slice(0, 4),
    ...result.data,
  });

  return { pack, diagnostics: result.diagnostics };
}
