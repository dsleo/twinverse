import "server-only";

import { z } from "zod";
import { callStructuredModel } from "./openaiStructured";
import { audiencePresetAffinityScore, audiencePresetDescription } from "./audiencePresets";
import { metadataTaxonomy } from "./personaSample";
import {
  audiencePresetSchema,
  populationAssignmentResultSchema,
  populationSegmentSpecSchema,
  type AudiencePreset,
  type LabInput,
  type MetadataTagFilter,
  type NormalizedPersona,
  type PersonaCache,
  type PopulationAssignmentResult,
  type PopulationSegmentSpec,
} from "../../lib/labSchemas";

const populationMapSchema = z.object({
  promptSummary: z.string().min(1),
  topicDimensions: z.array(z.string().min(1)).min(1),
  globalRationale: z.string().min(1),
  segments: z.array(populationSegmentSpecSchema).length(5),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 36);
}

function promptDimensions(rawInput: string) {
  const tokens = rawInput
    .toLowerCase()
    .match(/[a-zà-ÿ]{4,}/gi)
    ?.slice(0, 8)
    .map((token) => token.normalize("NFD").replace(/[^\w]/g, "")) ?? ["france"];
  return Array.from(new Set(tokens));
}

function tagMatches(persona: NormalizedPersona, filter: MetadataTagFilter) {
  const value = persona.assignmentMetadata[filter.family];
  if (Array.isArray(value)) {
    return filter.values.some((candidate) => value.includes(candidate));
  }
  return filter.values.includes(value);
}

function scorePersona(persona: NormalizedPersona, segment: PopulationSegmentSpec, audiencePreset: AudiencePreset) {
  if (segment.exclusionTags.some((filter) => tagMatches(persona, filter))) {
    return -100;
  }

  let score = 0;
  for (const filter of segment.inclusionTags) {
    if (tagMatches(persona, filter)) {
      score += 3;
    }
  }

  const personaText = [
    persona.occupation,
    persona.household,
    persona.economicPosture,
    persona.profileNarrative,
    ...persona.concerns,
    ...persona.traits,
    ...segment.rankingCriteria,
  ]
    .join(" ")
    .toLowerCase();

  for (const criterion of segment.rankingCriteria) {
    const tokens = criterion.toLowerCase().split(/\s+/);
    if (tokens.some((token) => personaText.includes(token))) {
      score += 1;
    }
  }

  score += audiencePresetAffinityScore(audiencePreset, persona.assignmentMetadata);
  return score;
}

function choosePanel(sortedBySegment: Array<{ segment: PopulationSegmentSpec; personas: NormalizedPersona[] }>) {
  const selected = new Map<string, NormalizedPersona>();
  const perSegment = new Map<string, NormalizedPersona[]>();

  for (const { segment, personas } of sortedBySegment) {
    const picks = personas.slice(0, 4);
    perSegment.set(segment.id, picks);
    for (const persona of picks) {
      selected.set(persona.id, persona);
    }
  }

  const allRanked = sortedBySegment.flatMap(({ personas }) => personas);
  for (const persona of allRanked) {
    if (selected.size >= 20) {
      break;
    }
    selected.set(persona.id, persona);
  }

  const panel = Array.from(selected.values()).slice(0, 20);
  return { panel, perSegment };
}

function assignedPersonaIds(segmentId: string, panel: NormalizedPersona[], segmentPool: Map<string, NormalizedPersona[]>) {
  const pool = segmentPool.get(segmentId) ?? [];
  const panelIds = new Set(panel.map((persona) => persona.id));
  return pool.filter((persona) => panelIds.has(persona.id)).map((persona) => persona.id);
}

export async function mapPopulationToPanel(input: LabInput, cache: PersonaCache, audiencePreset: AudiencePreset = "france_general") {
  const audience = audiencePresetSchema.parse(audiencePreset);
  const taxonomy = metadataTaxonomy(cache.personas);
  const promptDimensionList = promptDimensions(input.rawInput);
  const system = [
    "You are a French public-opinion segmentation analyst.",
    "Return exactly five population segments.",
    `Audience lens: ${audiencePresetDescription(audience)}.`,
    "Every segment must use inclusionTags and exclusionTags that map directly onto the provided metadata families and values.",
    "Do not invent families that are not present in the taxonomy.",
    "Favor segments that reflect who is materially affected, who bears cost/risk, who depends on services, who evaluates implementation detail, and who filters through trust/convenience.",
    "All output must be compact and concrete.",
  ].join(" ");
  const user = JSON.stringify(
    {
      input,
      audiencePreset: audience,
      audienceDescription: audiencePresetDescription(audience),
      promptDimensions: promptDimensionList,
      metadataTaxonomy: taxonomy,
      instructions: {
        includeFamilies: Object.keys(taxonomy),
        returnFields: [
          "promptSummary",
          "topicDimensions",
          "globalRationale",
          "segments[].id",
          "segments[].label",
          "segments[].summary",
          "segments[].concerns",
          "segments[].informationNeeds",
          "segments[].inclusionTags",
          "segments[].exclusionTags",
          "segments[].preferredDiversityHints",
          "segments[].rankingCriteria",
        ],
      },
    },
    null,
    2,
  );

  const mapped = await callStructuredModel({
    schema: populationMapSchema,
    schemaName: "population_segments",
    stageName: "PopulationMapperAgent",
    system,
    user,
  });

  const rankedBySegment = mapped.data.segments.map((segment) => ({
    segment: {
      ...segment,
      id: segment.id || slugify(segment.label),
    },
    personas: [...cache.personas]
      .map((persona) => ({ persona, score: scorePersona(persona, segment, audience) }))
      .sort((a, b) => b.score - a.score || a.persona.name.localeCompare(b.persona.name))
      .map((entry) => entry.persona),
  }));

  const { panel, perSegment } = choosePanel(rankedBySegment);
  const panelIds = panel.map((persona) => persona.id);

  const segments = rankedBySegment
    .map(({ segment }) => {
      const memberPersonaIds = assignedPersonaIds(segment.id, panel, perSegment);
      const representativePersonaIds = memberPersonaIds.slice(0, 3);
      return {
        ...segment,
        memberPersonaIds,
        representativePersonaIds,
        evaluatedPersonaIds: Array.from(new Set([...memberPersonaIds, ...panelIds])).slice(0, 2),
      };
    })
    .sort((a, b) => b.memberPersonaIds.length - a.memberPersonaIds.length || a.label.localeCompare(b.label));

  const result = populationAssignmentResultSchema.parse({
    promptSummary: mapped.data.promptSummary,
    topicDimensions: mapped.data.topicDimensions,
    panelSampleVersion: cache.sampleVersion,
    panelPersonaIds: panelIds.slice(0, 20),
    segments,
    globalRationale: mapped.data.globalRationale,
  });

  return {
    assignment: result,
    panel,
    diagnostics: mapped.diagnostics,
  };
}
