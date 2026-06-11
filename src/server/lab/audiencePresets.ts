import "server-only";

import type { AudiencePreset, PersonaAssignmentMetadata } from "../../lib/labSchemas";
import { audiencePresetDescriptions } from "../../lib/labAudience";

type WeightedFamily = keyof PersonaAssignmentMetadata;

const weights: Record<AudiencePreset, Partial<Record<WeightedFamily, Record<string, number>>>> = {
  france_general: {},
  le_figaro_reader: {
    life_stage: {
      established_adult: 3,
      retirement_age: 4,
      midcareer: 1,
      young_adult: -3,
    },
    employment_class: {
      executive_professional: 3,
      self_employed: 3,
      intermediate_professional: 2,
      retired: 3,
      out_of_work: -3,
    },
    income_posture: {
      stable_middle: 2,
      affluent: 3,
      cost_sensitive: -2,
    },
    housing_status: {
      family_home_profile: 2,
    },
    urbanicity: {
      major_urban: 1,
      secondary_urban: 1,
    },
    trust_orientation_tags: {
      pragmatic: 2,
      proof_seeking: 2,
      institution_reliant: 2,
    },
  },
  france_tv_viewer: {
    life_stage: {
      retirement_age: 4,
      established_adult: 3,
      midcareer: 1,
    },
    urbanicity: {
      small_town_rural: 2,
      secondary_urban: 1,
    },
    household_type: {
      family_household: 2,
    },
  },
};

export function audiencePresetDescription(audiencePreset: AudiencePreset) {
  return audiencePresetDescriptions[audiencePreset];
}

export function audiencePresetAffinityScore(audiencePreset: AudiencePreset, metadata: PersonaAssignmentMetadata) {
  const config = weights[audiencePreset];
  if (!config) {
    return 0;
  }

  let score = 0;
  for (const [family, familyWeights] of Object.entries(config) as Array<[WeightedFamily, Record<string, number>]>) {
    const rawValue = metadata[family];
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      score += familyWeights[value] ?? 0;
    }
  }
  return score;
}
