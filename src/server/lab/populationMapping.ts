import "server-only";

import { z } from "zod";
import { logLabRun } from "./logging";
import { callStructuredModel } from "./openaiStructured";
import { type TokenUsage } from "./tokenAccounting";
import { audiencePresetAffinityScore, audiencePresetDescription } from "./audiencePresets";
import { metadataTaxonomy } from "./personaSample";
import {
  audiencePresetSchema,
  audienceGuidanceSchema,
  populationAssignmentResultSchema,
  populationSegmentDesignSchema,
  type AudienceGuidance,
  type AudiencePreset,
  type LabInput,
  type MetadataTagFilter,
  type NormalizedPersona,
  type PersonaCache,
  type PopulationSegmentSpec,
  type PersonaAssignmentMetadata,
  type PopulationSegmentDesign,
  type RankingSignal,
} from "../../lib/labSchemas";

const populationMapSchema = populationSegmentDesignSchema;

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

export type PopulationMappingResult = {
  assignment: z.infer<typeof populationAssignmentResultSchema>;
  panel: NormalizedPersona[];
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

export type SegmentDesignResult = {
  data: z.infer<typeof populationMapSchema>;
  diagnostics: PopulationMappingResult["diagnostics"];
  tokenUsage: TokenUsage;
};

export function approvedSegmentDesignResult(data: PopulationSegmentDesign): SegmentDesignResult {
  return {
    data: populationMapSchema.parse(data),
    diagnostics: {
      name: "ApprovedAudienceDesign",
      model: "user-approved",
      outputText: JSON.stringify(data),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenUsageEstimated: false,
    },
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: false },
  };
}

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

export function validateAudienceGuidanceAgainstTaxonomy(guidance: AudienceGuidance, personas: NormalizedPersona[]) {
  const parsed = audienceGuidanceSchema.parse(guidance);
  const taxonomy = metadataTaxonomy(personas);
  for (const filter of [...parsed.include, ...parsed.avoid]) {
    const allowed = taxonomy[filter.family] ?? [];
    if (filter.values.some((value) => !allowed.includes(value))) {
      throw new Error(`Unknown audience attribute for ${filter.family}.`);
    }
  }
  return parsed;
}

export function validateSegmentDesignAgainstTaxonomy(design: PopulationSegmentDesign, personas: NormalizedPersona[]) {
  const parsed = populationSegmentDesignSchema.parse(design);
  const taxonomy = metadataTaxonomy(personas);
  for (const segment of parsed.segments) {
    for (const filter of [...segment.inclusionTags, ...segment.exclusionTags, ...segment.rankingSignals]) {
      const allowed = taxonomy[filter.family] ?? [];
      if (filter.values.some((value) => !allowed.includes(value))) {
        throw new Error(`Audience segment ${segment.id} uses an unknown attribute.`);
      }
    }
  }
  return parsed;
}

function combineTokenUsage(...usages: TokenUsage[]): TokenUsage {
  return {
    inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
    outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
    totalTokens: usages.reduce((total, usage) => total + usage.totalTokens, 0),
    estimated: usages.some((usage) => usage.estimated),
  };
}

export function segmentEligibilityCounts(
  personas: NormalizedPersona[],
  segments: PopulationSegmentSpec[],
  audiencePreset: AudiencePreset,
  guidance: AudienceGuidance,
) {
  const frequencies = buildMetadataValueFrequencies(personas);
  return segments.map((segment) => ({
    segmentId: segment.id,
    eligiblePersonaCount: personas.filter((persona) => scorePersona(persona, segment, audiencePreset, frequencies, personas.length, guidance).eligible).length,
  }));
}

export function audienceEligiblePersonaCount(
  personas: NormalizedPersona[],
  guidance: AudienceGuidance,
) {
  const parsed = audienceGuidanceSchema.parse(guidance);
  if (parsed.mode !== "guided" || parsed.include.length === 0) {
    return personas.length;
  }
  return personas.filter((persona) =>
    parsed.include.every((filter) => signalMatches(persona.assignmentMetadata, filter)),
  ).length;
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
  guidance: AudienceGuidance = { mode: "automatic", include: [], avoid: [], priorityConcerns: [] },
): PersonaScore {
  const reasons: string[] = [];
  const normalizedGuidance = audienceGuidanceSchema.parse(guidance);

  if (normalizedGuidance.mode === "guided" && normalizedGuidance.include.some((filter) => !signalMatches(persona.assignmentMetadata, filter))) {
    return {
      eligible: false,
      total: Number.NEGATIVE_INFINITY,
      inclusionCoverage: 0,
      audiencePrior: 0,
      tieBreakers: { familyCoverage: 0, rarityBonus: 0, rankingSignalScore: 0 },
      reasons: ["excluded_by_audience_guidance"],
    };
  }

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
  const avoidPenalty =
    normalizedGuidance.mode === "guided" && normalizedGuidance.avoid.some((filter) => signalMatches(persona.assignmentMetadata, filter))
      ? 0.75
      : 0;

  if (matchedInclusion.length > 0) {
    reasons.push(`matched_inclusion:${matchedInclusion.map((filter) => filter.family).join(",")}`);
  }
  if (matchedRankingSignals.length > 0) {
    reasons.push(`matched_ranking_signals:${matchedRankingSignals.map((signal) => signal.family).join(",")}`);
  }
  if (audiencePrior !== 0) {
    reasons.push(`audience_prior:${audiencePrior.toFixed(2)}`);
  }
  if (avoidPenalty > 0) {
    reasons.push("audience_guidance_avoid_penalty");
  }

  const total = inclusionCoverage + familyCoverage + rarityBonus + rankingSignalScore + audiencePrior - avoidPenalty;
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

export async function designPopulationSegments(
  input: LabInput,
  cache: PersonaCache,
  audiencePreset: AudiencePreset = "france_general",
  options?: { runId?: string; guidance?: AudienceGuidance },
): Promise<SegmentDesignResult> {
  const audience = audiencePresetSchema.parse(audiencePreset);
  const guidance = audienceGuidanceSchema.parse(options?.guidance ?? { mode: "automatic" });
  const taxonomy = metadataTaxonomy(cache.personas);
  const system = [
    "You are an audience segmentation analyst.",
    "Return exactly five population segments.",
    `Audience lens: ${audiencePresetDescription(audience)}.`,
    "Respect audience guidance when it is supplied, while retaining useful internal diversity.",
    "Every segment must use inclusionTags and exclusionTags that map directly onto the provided metadata families and values.",
    "Do not invent families that are not present in the taxonomy.",
    "All output must be compact and concrete.",
  ].join(" ");
  const user = JSON.stringify({ input, audiencePreset: audience, audienceDescription: audiencePresetDescription(audience), audienceGuidance: guidance, promptDimensions: promptDimensions(input.rawInput), metadataTaxonomy: taxonomy }, null, 2);
  const mapped = await callStructuredModel({ schema: populationMapSchema, schemaName: "population_segments", stageName: "PopulationMapperAgent", system, user, runId: options?.runId, traceLabel: "population_mapping" });

  try {
    return {
      data: validateSegmentDesignAgainstTaxonomy(mapped.data, cache.personas),
      diagnostics: mapped.diagnostics,
      tokenUsage: mapped.tokenUsage,
    };
  } catch (validationError) {
    const reason = validationError instanceof Error ? validationError.message : "The plan does not match the metadata taxonomy.";
    logLabRun(options?.runId ?? "population-mapper", "population-mapping-plan-repair", {
      reason,
    });

    const repaired = await callStructuredModel({
      schema: populationMapSchema,
      schemaName: "population_segments_repair",
      stageName: "PopulationMapperRepair",
      system: [
        system,
        "The previous plan failed metadata validation. Return a corrected replacement plan.",
        "For every inclusionTags, exclusionTags, and rankingSignals entry, copy both the family and values exactly from the provided metadata taxonomy.",
      ].join(" "),
      user: JSON.stringify({
        originalRequest: JSON.parse(user),
        invalidPlan: mapped.data,
        validationError: reason,
      }, null, 2),
      runId: options?.runId,
      traceLabel: "population_mapping_repair",
    });

    return {
      data: validateSegmentDesignAgainstTaxonomy(repaired.data, cache.personas),
      diagnostics: repaired.diagnostics,
      tokenUsage: combineTokenUsage(mapped.tokenUsage, repaired.tokenUsage),
    };
  }
}

export async function mapPopulationToPanel(
  input: LabInput,
  cache: PersonaCache,
  audiencePreset: AudiencePreset = "france_general",
  options?: { runId?: string; design?: SegmentDesignResult; guidance?: AudienceGuidance },
): Promise<PopulationMappingResult> {
  const audience = audiencePresetSchema.parse(audiencePreset);
  const guidance = audienceGuidanceSchema.parse(options?.guidance ?? { mode: "automatic" });
  if (options?.runId) {
    logLabRun(options.runId, "population-mapping-start", {
      audience: audiencePreset,
      sampleSize: cache.sampleSize,
      guidanceMode: guidance.mode,
      includeFilters: guidance.include.length,
      avoidFilters: guidance.avoid.length,
    });
  }

  const mapped = options?.design ?? await designPopulationSegments(input, cache, audience, { runId: options?.runId, guidance });

  const frequencies = buildMetadataValueFrequencies(cache.personas);
  const scoredBySegment = mapped.data.segments.map((segment) => ({
    segment: {
      ...segment,
      id: segment.id || slugify(segment.label),
    },
    candidates: [...cache.personas]
      .map((persona) => ({
        persona,
        score: scorePersona(persona, segment, audience, frequencies, cache.personas.length, guidance),
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
    tokenUsage: mapped.tokenUsage,
  };
}
