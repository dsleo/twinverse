import "server-only";

import { z } from "zod";
import { logLabRun } from "./logging";
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
  type PopulationSegmentSpec,
  type PersonaAssignmentMetadata,
  type RankingSignal,
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

export type PersonaScore = {
  eligible: boolean;
  total: number;
  inclusionCoverage: number;
  audiencePrior: number;
  tieBreakers: {
    familyCoverage: number;
    rarityBonus: number;
    rankingSignalScore: number;
  };
  reasons: string[];
};

type ScoredCandidate = {
  persona: NormalizedPersona;
  score: PersonaScore;
};

type MetadataValueFrequencies = Partial<Record<keyof PersonaAssignmentMetadata, Map<string, number>>>;

const DIVERSITY_FAMILIES: Array<keyof PersonaAssignmentMetadata> = [
  "life_stage",
  "employment_class",
  "urbanicity",
  "income_posture",
  "region_family",
];

function metadataValues(metadata: PersonaAssignmentMetadata, family: keyof PersonaAssignmentMetadata) {
  const rawValue = metadata[family];
  return Array.isArray(rawValue) ? rawValue : [rawValue];
}

function signalMatches(metadata: PersonaAssignmentMetadata, signal: RankingSignal | MetadataTagFilter) {
  const values = metadataValues(metadata, signal.family);
  return signal.values.some((candidate) => values.includes(candidate));
}

export function buildMetadataValueFrequencies(personas: NormalizedPersona[]): MetadataValueFrequencies {
  const frequencies: MetadataValueFrequencies = {};
  for (const persona of personas) {
    for (const family of Object.keys(persona.assignmentMetadata) as Array<keyof PersonaAssignmentMetadata>) {
      const familyMap = frequencies[family] ?? new Map<string, number>();
      for (const value of metadataValues(persona.assignmentMetadata, family)) {
        familyMap.set(value, (familyMap.get(value) ?? 0) + 1);
      }
      frequencies[family] = familyMap;
    }
  }
  return frequencies;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rarityForSignal(
  metadata: PersonaAssignmentMetadata,
  signal: RankingSignal | MetadataTagFilter,
  frequencies: MetadataValueFrequencies,
  populationSize: number,
) {
  const matchedValues = metadataValues(metadata, signal.family).filter((value) => signal.values.includes(value));
  const familyMap = frequencies[signal.family] ?? new Map<string, number>();
  const rarities = matchedValues.map((value) => 1 - (familyMap.get(value) ?? populationSize) / populationSize);
  return average(rarities);
}

export function scorePersona(
  persona: NormalizedPersona,
  segment: PopulationSegmentSpec,
  audiencePreset: AudiencePreset,
  frequencies: MetadataValueFrequencies,
  populationSize: number,
): PersonaScore {
  const reasons: string[] = [];

  if (segment.exclusionTags.some((filter) => signalMatches(persona.assignmentMetadata, filter))) {
    return {
      eligible: false,
      total: Number.NEGATIVE_INFINITY,
      inclusionCoverage: 0,
      audiencePrior: 0,
      tieBreakers: {
        familyCoverage: 0,
        rarityBonus: 0,
        rankingSignalScore: 0,
      },
      reasons: ["excluded_by_segment"],
    };
  }

  const matchedInclusion = segment.inclusionTags.filter((filter) => signalMatches(persona.assignmentMetadata, filter));
  if (matchedInclusion.length === 0) {
    return {
      eligible: false,
      total: Number.NEGATIVE_INFINITY,
      inclusionCoverage: 0,
      audiencePrior: 0,
      tieBreakers: {
        familyCoverage: 0,
        rarityBonus: 0,
        rankingSignalScore: 0,
      },
      reasons: ["no_inclusion_match"],
    };
  }

  const inclusionCoverage = (matchedInclusion.length / segment.inclusionTags.length) * 6;
  const matchedFamilies = new Set(matchedInclusion.map((filter) => filter.family));
  const distinctInclusionFamilies = new Set(segment.inclusionTags.map((filter) => filter.family));
  const familyCoverage = (matchedFamilies.size / Math.max(1, distinctInclusionFamilies.size)) * 2;
  const rarityBonus =
    average(matchedInclusion.map((filter) => rarityForSignal(persona.assignmentMetadata, filter, frequencies, populationSize))) * 1.5;
  const rankingSignals = segment.rankingSignals ?? [];
  const matchedRankingSignals = rankingSignals.filter((signal) => signalMatches(persona.assignmentMetadata, signal));
  const rankingSignalScore =
    rankingSignals.length === 0
      ? 0
      : matchedRankingSignals.reduce((sum, signal) => sum + (signal.weight ?? 1), 0) / rankingSignals.length;
  const audiencePrior = audiencePresetAffinityScore(audiencePreset, persona.assignmentMetadata) * 0.35;

  if (matchedInclusion.length > 0) {
    reasons.push(`matched_inclusion:${matchedInclusion.map((filter) => filter.family).join(",")}`);
  }
  if (matchedRankingSignals.length > 0) {
    reasons.push(`matched_ranking_signals:${matchedRankingSignals.map((signal) => signal.family).join(",")}`);
  }
  if (audiencePrior !== 0) {
    reasons.push(`audience_prior:${audiencePrior.toFixed(2)}`);
  }

  const total = inclusionCoverage + familyCoverage + rarityBonus + rankingSignalScore + audiencePrior;
  return {
    eligible: true,
    total,
    inclusionCoverage,
    audiencePrior,
    tieBreakers: {
      familyCoverage,
      rarityBonus,
      rankingSignalScore,
    },
    reasons,
  };
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate) {
  return (
    b.score.total - a.score.total ||
    b.score.inclusionCoverage - a.score.inclusionCoverage ||
    b.score.tieBreakers.familyCoverage - a.score.tieBreakers.familyCoverage ||
    a.persona.name.localeCompare(b.persona.name)
  );
}

function diversityPenalty(persona: NormalizedPersona, selected: NormalizedPersona[]) {
  if (selected.length === 0) {
    return 0;
  }

  const similarities = selected.map((other) => {
    const shared = DIVERSITY_FAMILIES.filter((family) => {
      const left = metadataValues(persona.assignmentMetadata, family);
      const right = metadataValues(other.assignmentMetadata, family);
      return left.some((value) => right.includes(value));
    }).length;
    return shared / DIVERSITY_FAMILIES.length;
  });

  return Math.max(...similarities) * 1.5;
}

function adjustedCandidateScore(candidate: ScoredCandidate, selected: NormalizedPersona[]) {
  if (!candidate.score.eligible) {
    return Number.NEGATIVE_INFINITY;
  }
  return candidate.score.total - diversityPenalty(candidate.persona, selected);
}

function chooseCandidate(candidates: ScoredCandidate[], selected: NormalizedPersona[], usedIds: Set<string>) {
  let best: ScoredCandidate | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (usedIds.has(candidate.persona.id) || !candidate.score.eligible) {
      continue;
    }
    const adjusted = adjustedCandidateScore(candidate, selected);
    if (
      adjusted > bestScore ||
      (adjusted === bestScore && best && compareCandidates(candidate, best) < 0)
    ) {
      best = candidate;
      bestScore = adjusted;
    }
  }

  return best;
}

function choosePanel(scoredBySegment: Array<{ segment: PopulationSegmentSpec; candidates: ScoredCandidate[] }>) {
  const selected = new Map<string, NormalizedPersona>();
  const selectedList: NormalizedPersona[] = [];
  const scarcityOrdered = [...scoredBySegment].sort((a, b) => {
    const eligibleA = a.candidates.filter((candidate) => candidate.score.eligible).length;
    const eligibleB = b.candidates.filter((candidate) => candidate.score.eligible).length;
    return eligibleA - eligibleB || a.segment.label.localeCompare(b.segment.label);
  });

  for (let round = 0; round < 2; round += 1) {
    for (const { candidates } of scarcityOrdered) {
      const pick = chooseCandidate(candidates, selectedList, new Set(selected.keys()));
      if (!pick) {
        continue;
      }
      selected.set(pick.persona.id, pick.persona);
      selectedList.push(pick.persona);
    }
  }

  const candidatePool = new Map<string, { persona: NormalizedPersona; gain: number }>();
  for (const { candidates } of scoredBySegment) {
    const currentSegmentCount = selectedList.filter((persona) => candidates.some((candidate) => candidate.persona.id === persona.id && candidate.score.eligible)).length;
    const segmentWeight = 1 / Math.max(1, currentSegmentCount);
    for (const candidate of candidates) {
      if (!candidate.score.eligible || selected.has(candidate.persona.id)) {
        continue;
      }
      const previous = candidatePool.get(candidate.persona.id);
      const contribution = candidate.score.total * segmentWeight;
      candidatePool.set(candidate.persona.id, {
        persona: candidate.persona,
        gain: (previous?.gain ?? 0) + contribution,
      });
    }
  }

  while (selected.size < 20) {
    let best: { persona: NormalizedPersona; gain: number } | null = null;
    let bestAdjustedGain = Number.NEGATIVE_INFINITY;
    for (const candidate of candidatePool.values()) {
      if (selected.has(candidate.persona.id)) {
        continue;
      }
      const adjustedGain = candidate.gain - diversityPenalty(candidate.persona, selectedList);
      if (
        adjustedGain > bestAdjustedGain ||
        (adjustedGain === bestAdjustedGain && best && candidate.persona.name.localeCompare(best.persona.name) < 0)
      ) {
        best = candidate;
        bestAdjustedGain = adjustedGain;
      }
    }

    if (!best) {
      break;
    }

    selected.set(best.persona.id, best.persona);
    selectedList.push(best.persona);
  }

  return Array.from(selected.values()).slice(0, 20);
}

export async function mapPopulationToPanel(
  input: LabInput,
  cache: PersonaCache,
  audiencePreset: AudiencePreset = "france_general",
  options?: { runId?: string },
) {
  const audience = audiencePresetSchema.parse(audiencePreset);
  if (options?.runId) {
    logLabRun(options.runId, "population-mapping-start", {
      audience: audiencePreset,
      sampleSize: cache.sampleSize,
    });
  }

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
          "segments[].rankingSignals",
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
    runId: options?.runId,
    traceLabel: "population_mapping",
  });

  const frequencies = buildMetadataValueFrequencies(cache.personas);
  const scoredBySegment = mapped.data.segments.map((segment) => ({
    segment: {
      ...segment,
      id: segment.id || slugify(segment.label),
    },
    candidates: [...cache.personas]
      .map((persona) => ({
        persona,
        score: scorePersona(persona, segment, audience, frequencies, cache.personas.length),
      }))
      .sort(compareCandidates),
  }));

  const panel = choosePanel(scoredBySegment);
  const panelIds = panel.map((persona) => persona.id);
  const panelIdSet = new Set(panelIds);

  const segments = scoredBySegment
    .map(({ segment, candidates }) => {
      const panelCandidates = candidates.filter((candidate) => panelIdSet.has(candidate.persona.id) && candidate.score.eligible);
      const memberPersonaIds = panelCandidates.map((candidate) => candidate.persona.id);
      const representativePersonaIds = panelCandidates.slice(0, 3).map((candidate) => candidate.persona.id);
      return {
        ...segment,
        memberPersonaIds,
        representativePersonaIds,
        evaluatedPersonaIds: panelCandidates.slice(0, 2).map((candidate) => candidate.persona.id),
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
