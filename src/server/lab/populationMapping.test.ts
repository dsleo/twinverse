import { describe, expect, it, vi } from "vitest";

vi.mock("./openaiStructured", () => ({
  callStructuredModel: vi.fn(async () => ({
    data: {
      promptSummary: "Nuclear build-out in France",
      topicDimensions: ["energy", "cost", "trust"],
      globalRationale: "Segments are derived from exposure, cost, and trust differences.",
      segments: [
        {
          id: "workers",
          label: "Cost-exposed workers",
          summary: "Households that read the issue through bills and job stability.",
          concerns: ["cost of living", "job stability"],
          informationNeeds: ["who pays", "local jobs"],
          inclusionTags: [{ family: "employment_class", values: ["working_class", "service_employee"] }],
          exclusionTags: [],
          preferredDiversityHints: ["regional spread"],
          rankingCriteria: ["job stability", "cost of living"],
        },
        {
          id: "families",
          label: "Family-budget households",
          summary: "Households focused on family budgets and services.",
          concerns: ["family expenses", "public services"],
          informationNeeds: ["timeline", "monthly impact"],
          inclusionTags: [{ family: "household_type", values: ["family_household"] }],
          exclusionTags: [],
          preferredDiversityHints: [],
          rankingCriteria: ["family expenses"],
        },
        {
          id: "retired",
          label: "Retired fixed-income households",
          summary: "Older households that prioritize stability and fairness.",
          concerns: ["stability", "public services"],
          informationNeeds: ["what changes now", "what remains stable"],
          inclusionTags: [{ family: "employment_class", values: ["retired"] }],
          exclusionTags: [],
          preferredDiversityHints: [],
          rankingCriteria: ["fixed income"],
        },
        {
          id: "professionals",
          label: "Operational professionals",
          summary: "Professionals who examine risk and implementation detail.",
          concerns: ["business risk", "efficiency"],
          informationNeeds: ["implementation detail", "risk control"],
          inclusionTags: [{ family: "employment_class", values: ["executive_professional", "self_employed"] }],
          exclusionTags: [],
          preferredDiversityHints: [],
          rankingCriteria: ["implementation", "efficiency"],
        },
        {
          id: "urban",
          label: "Urban trust-sensitive renters",
          summary: "Urban households focused on trust and convenience.",
          concerns: ["trust", "convenience"],
          informationNeeds: ["plain-language summary", "near-term effects"],
          inclusionTags: [{ family: "urbanicity", values: ["major_urban", "secondary_urban"] }],
          exclusionTags: [],
          preferredDiversityHints: [],
          rankingCriteria: ["trust", "convenience"],
        },
      ],
    },
    diagnostics: { name: "PopulationMapperAgent", model: "test-model", outputText: "{}" },
  })),
}));

import { mapPopulationToPanel } from "./populationMapping";
import type { PersonaCache } from "../../lib/labSchemas";

function makePersona(index: number, overrides: Partial<PersonaCache["personas"][number]> = {}): PersonaCache["personas"][number] {
  const employmentClasses = ["working_class", "service_employee", "retired", "executive_professional", "self_employed"] as const;
  const householdTypes = ["family_household", "family_household", "couple_without_children", "single_adult", "family_household"] as const;
  const urbanicity = ["secondary_urban", "small_town_rural", "small_town_rural", "major_urban", "secondary_urban"] as const;
  const employmentClass = employmentClasses[index % employmentClasses.length];
  return {
    id: `p-${index}`,
    sourceRowId: `row-${index}`,
    sourceDataset: "nvidia/Nemotron-Personas-France",
    sourceSampleVersion: "2026-06-04",
    name: `Persona ${index}`,
    age: 28 + (index % 40),
    city: index % 4 === 0 ? "Paris" : "Lyon",
    region: "France",
    occupation: employmentClass,
    household: householdTypes[index % householdTypes.length],
    economicPosture: index % 2 === 0 ? "cost sensitive" : "stable middle",
    housingStatus: "mixed_housing",
    mobilityProfile: "transit_oriented",
    urbanicity: urbanicity[index % urbanicity.length],
    traits: ["pragmatic"],
    concerns: ["cost of living", "public services"],
    profileNarrative: "French profile",
    assignmentMetadata: {
      life_stage: index > 10 ? "retirement_age" : "midcareer",
      household_type: householdTypes[index % householdTypes.length],
      employment_class: employmentClass,
      income_posture: index % 2 === 0 ? "cost_sensitive" : "stable_middle",
      housing_status: "mixed_housing",
      mobility_profile: "transit_oriented",
      urbanicity: urbanicity[index % urbanicity.length],
      region_family: "regional_france",
      public_service_dependency: index > 10 ? "high" : "medium",
      policy_exposure_tags: ["family_budget_exposure"],
      economic_vulnerability_tags: ["high_cost_of_living_pressure"],
      trust_orientation_tags: ["pragmatic"],
      issue_salience_tags: ["cost_of_living", "public_services"],
    },
    ...overrides,
  };
}

describe("mapPopulationToPanel", () => {
  it("produces five segments, a 20-person panel, and two evaluated personas per segment", async () => {
    const cache: PersonaCache = {
      dataset: "nvidia/Nemotron-Personas-France",
      fetchedAt: new Date().toISOString(),
      sampleVersion: "2026-06-04",
      sampleSize: 100,
      personas: Array.from({ length: 100 }, (_, index) => makePersona(index)),
    };

    const result = await mapPopulationToPanel(
      {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      cache,
      "france_general",
    );

    expect(result.assignment.segments).toHaveLength(5);
    expect(result.assignment.panelPersonaIds).toHaveLength(20);
    expect(result.assignment.segments.every((segment) => segment.evaluatedPersonaIds.length === 2)).toBe(true);
    expect(result.assignment.segments[0].memberPersonaIds.length).toBeGreaterThanOrEqual(result.assignment.segments[4].memberPersonaIds.length);
  });

  it("biases panel selection when using the Le Figaro audience preset", async () => {
    const cache: PersonaCache = {
      dataset: "nvidia/Nemotron-Personas-France",
      fetchedAt: new Date().toISOString(),
      sampleVersion: "2026-06-04",
      sampleSize: 40,
      personas: [
        ...Array.from({ length: 20 }, (_, index) =>
          makePersona(index, {
            assignmentMetadata: {
              ...makePersona(index).assignmentMetadata,
              life_stage: "retirement_age",
              employment_class: "retired",
              income_posture: "affluent",
              housing_status: "family_home_profile",
              trust_orientation_tags: ["pragmatic", "proof_seeking", "institution_reliant"],
            },
          }),
        ),
        ...Array.from({ length: 20 }, (_, index) =>
          makePersona(index + 20, {
            assignmentMetadata: {
              ...makePersona(index + 20).assignmentMetadata,
              life_stage: "young_adult",
              employment_class: "out_of_work",
              income_posture: "cost_sensitive",
              trust_orientation_tags: ["open_to_argument"],
            },
          }),
        ),
      ],
    };

    const result = await mapPopulationToPanel(
      {
        rawInput: "Faut-il construire de nouvelles centrales nucléaires en France ?",
        inputType: "question",
      },
      cache,
      "le_figaro_reader",
    );

    expect(result.panel.every((persona) => persona.assignmentMetadata.life_stage !== "young_adult")).toBe(true);
  });
});
