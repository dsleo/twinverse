import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audiencePresetAffinityScore } from "../src/server/lab/audiencePresets";
import { buildMetadataValueFrequencies, scorePersona } from "../src/server/lab/populationMapping";
import { refreshPersonaMetadata } from "../src/server/lab/personaSample";
import { personaCacheSchema, type AudiencePreset, type MetadataTagFilter, type NormalizedPersona, type PopulationSegmentSpec } from "../src/lib/labSchemas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function oldTagMatches(persona: NormalizedPersona, filter: MetadataTagFilter) {
  const value = persona.assignmentMetadata[filter.family];
  if (Array.isArray(value)) {
    return filter.values.some((candidate) => value.includes(candidate));
  }
  return filter.values.includes(value);
}

function oldScorePersona(persona: NormalizedPersona, segment: PopulationSegmentSpec, audiencePreset: AudiencePreset) {
  if (segment.exclusionTags.some((filter) => oldTagMatches(persona, filter))) {
    return -100;
  }

  let score = 0;
  for (const filter of segment.inclusionTags) {
    if (oldTagMatches(persona, filter)) {
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

function inclusionMatchCount(persona: NormalizedPersona, segment: PopulationSegmentSpec) {
  return segment.inclusionTags.filter((filter) => oldTagMatches(persona, filter)).length;
}

function allInclusionsMatch(persona: NormalizedPersona, segment: PopulationSegmentSpec) {
  return inclusionMatchCount(persona, segment) === segment.inclusionTags.length;
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const segments: PopulationSegmentSpec[] = [
  {
    id: "workers",
    label: "Cost-exposed workers",
    summary: "Working households exposed to cost pressure.",
    concerns: ["cost of living", "job stability"],
    informationNeeds: ["who pays", "job effects"],
    inclusionTags: [
      { family: "employment_class", values: ["working_class", "service_employee"] },
      { family: "economic_vulnerability_tags", values: ["moderate_cost_pressure"] },
    ],
    exclusionTags: [],
    preferredDiversityHints: [],
    rankingSignals: [{ family: "household_type", values: ["family_household"], weight: 0.8 }],
    rankingCriteria: ["job stability", "cost of living"],
  },
  {
    id: "urban_idf",
    label: "Urban Ile-de-France households",
    summary: "Dense-service households in Ile-de-France.",
    concerns: ["convenience", "service reliability"],
    informationNeeds: ["near-term effects", "plain-language summary"],
    inclusionTags: [
      { family: "urbanicity", values: ["major_urban", "secondary_urban"] },
      { family: "region_family", values: ["ile_de_france"] },
    ],
    exclusionTags: [],
    preferredDiversityHints: [],
    rankingSignals: [{ family: "mobility_profile", values: ["transit_oriented"], weight: 0.8 }],
    rankingCriteria: ["urban services", "mobility"],
  },
  {
    id: "retired",
    label: "Retired fixed-income households",
    summary: "Older households reading issues through stability and fixed income.",
    concerns: ["stability", "public services"],
    informationNeeds: ["what changes now", "what remains stable"],
    inclusionTags: [
      { family: "life_stage", values: ["retirement_age"] },
      { family: "economic_vulnerability_tags", values: ["fixed_income"] },
    ],
    exclusionTags: [],
    preferredDiversityHints: [],
    rankingSignals: [{ family: "employment_class", values: ["retired"], weight: 1.2 }],
    rankingCriteria: ["fixed income", "stability"],
  },
  {
    id: "professionals",
    label: "Operational professionals",
    summary: "Professionals focused on implementation detail and risk control.",
    concerns: ["business risk", "efficiency"],
    informationNeeds: ["implementation detail", "risk control"],
    inclusionTags: [
      { family: "employment_class", values: ["executive_professional", "self_employed", "intermediate_professional"] },
      { family: "trust_orientation_tags", values: ["proof_seeking", "pragmatic"] },
    ],
    exclusionTags: [],
    preferredDiversityHints: [],
    rankingSignals: [{ family: "income_posture", values: ["stable_middle", "affluent"], weight: 0.8 }],
    rankingCriteria: ["implementation", "efficiency"],
  },
  {
    id: "out_of_work",
    label: "Out-of-work proof-seeking households",
    summary: "Households outside formal work looking for practical proof and reassurance.",
    concerns: ["security", "public services"],
    informationNeeds: ["what changes now", "material impact"],
    inclusionTags: [
      { family: "employment_class", values: ["out_of_work"] },
      { family: "trust_orientation_tags", values: ["proof_seeking"] },
    ],
    exclusionTags: [],
    preferredDiversityHints: [],
    rankingSignals: [{ family: "public_service_dependency", values: ["medium", "high"], weight: 1.2 }],
    rankingCriteria: ["security", "proof"],
  },
];

async function main() {
  const cachePath = path.join(__dirname, "..", "data", "personas", "nemotron-france-cache.json");
  const rawCache = personaCacheSchema.parse(JSON.parse(await readFile(cachePath, "utf8")));
  const cache = personaCacheSchema.parse({
    ...rawCache,
    personas: rawCache.personas.map((persona) => refreshPersonaMetadata(persona)),
  });
  const frequencies = buildMetadataValueFrequencies(cache.personas);

  for (const audiencePreset of ["france_general", "le_figaro_reader"] as const) {
    console.log(`\n=== Audience preset: ${audiencePreset} ===`);

    for (const segment of segments) {
      const oldRanked = [...cache.personas]
        .map((persona) => ({ persona, score: oldScorePersona(persona, segment, audiencePreset) }))
        .sort((a, b) => b.score - a.score || a.persona.name.localeCompare(b.persona.name));

      const newRanked = [...cache.personas]
        .map((persona) => ({
          persona,
          score: scorePersona(persona, segment, audiencePreset, frequencies, cache.personas.length),
        }))
        .sort(
          (a, b) =>
            b.score.total - a.score.total ||
            b.score.inclusionCoverage - a.score.inclusionCoverage ||
            a.persona.name.localeCompare(b.persona.name),
        );

      const oldTop10 = oldRanked.slice(0, 10);
      const newTop10 = newRanked.filter((entry) => entry.score.eligible).slice(0, 10);

      const oldFullMatchRate = average(oldTop10.map((entry) => (allInclusionsMatch(entry.persona, segment) ? 1 : 0)));
      const newFullMatchRate = average(newTop10.map((entry) => (allInclusionsMatch(entry.persona, segment) ? 1 : 0)));
      const oldCoverage = average(oldTop10.map((entry) => inclusionMatchCount(entry.persona, segment) / segment.inclusionTags.length));
      const newCoverage = average(newTop10.map((entry) => inclusionMatchCount(entry.persona, segment) / segment.inclusionTags.length));

      console.log(`\n${segment.label}`);
      console.log(`old top10 full-match rate: ${oldFullMatchRate.toFixed(2)} | avg inclusion coverage: ${oldCoverage.toFixed(2)}`);
      console.log(`new top10 full-match rate: ${newFullMatchRate.toFixed(2)} | avg inclusion coverage: ${newCoverage.toFixed(2)}`);
      console.log(
        `old top3: ${oldTop10
          .slice(0, 3)
          .map((entry) => `${entry.persona.name} (${inclusionMatchCount(entry.persona, segment)}/${segment.inclusionTags.length})`)
          .join(" | ")}`,
      );
      console.log(
        `new top3: ${newTop10
          .slice(0, 3)
          .map((entry) => `${entry.persona.name} (${inclusionMatchCount(entry.persona, segment)}/${segment.inclusionTags.length})`)
          .join(" | ")}`,
      );
    }
  }
}

void main();
