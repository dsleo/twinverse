import { describe, expect, it } from "vitest";
import { normalizePersonaRow, refreshPersonaMetadata } from "./personaSample";
import type { NormalizedPersona } from "../../lib/labSchemas";

describe("personaSample metadata derivation", () => {
  it("derives structured metadata from French household and occupation fields", () => {
    const persona = normalizePersonaRow(
      {
        persona:
          "Antoine Zawada incarne le mélange d’un ouvrier méticuleux qui répare les immeubles du 10e tout en nourrissant son foyer, vérifie deux fois chaque facture et reste attentif au coût de la vie.",
        age: 39,
        commune: "Paris 10e Arrondissement",
        departement: "Paris",
        occupation: "Ouvriers",
        household_type: "Famille monoparentale",
      },
      "2026-06-05",
      0,
    );

    expect(persona.assignmentMetadata.household_type).toBe("family_household");
    expect(persona.assignmentMetadata.employment_class).toBe("working_class");
    expect(persona.assignmentMetadata.income_posture).toBe("cost_sensitive");
    expect(persona.assignmentMetadata.housing_status).toBe("urban_renter_profile");
    expect(persona.assignmentMetadata.mobility_profile).toBe("transit_oriented");
    expect(persona.assignmentMetadata.policy_exposure_tags).toContain("family_budget_exposure");
    expect(persona.assignmentMetadata.issue_salience_tags).toEqual(expect.arrayContaining(["cost_of_living", "family_life", "housing", "transport"]));
  });

  it("derives trust and vulnerability signals from narrative cues", () => {
    const persona = normalizePersonaRow(
      {
        persona:
          "Daniel Turpin, retraité méthodique, garde une légère méfiance, vérifie ses papiers administratifs et cherche des preuves concrètes avant de faire confiance.",
        age: 68,
        commune: "Quincieux",
        departement: "Rhône",
        occupation: "Retraités",
        household_type: "Couple sans enfant",
      },
      "2026-06-05",
      1,
    );

    expect(persona.assignmentMetadata.life_stage).toBe("retirement_age");
    expect(persona.assignmentMetadata.economic_vulnerability_tags).toContain("fixed_income");
    expect(persona.assignmentMetadata.trust_orientation_tags).toEqual(
      expect.arrayContaining(["pragmatic", "proof_seeking", "institution_reliant"]),
    );
    expect(persona.assignmentMetadata.issue_salience_tags).toContain("healthcare");
  });

  it("refreshes stale cached metadata with current heuristics", () => {
    const stalePersona: NormalizedPersona = {
      id: "hf-2026-06-05-001",
      sourceRowId: "1",
      sourceDataset: "nvidia/Nemotron-Personas-France",
      sourceSampleVersion: "2026-06-05",
      name: "Alice Gomes",
      age: 41,
      city: "Saint-Pierre-d'Oléron",
      region: "Charente-Maritime",
      occupation: "Employés",
      household: "Famille monoparentale",
      economicPosture: "mixed",
      housingStatus: "mixed_housing",
      mobilityProfile: "mixed_mobility",
      urbanicity: "mixed_urbanicity",
      tvPreferenceDescription: "",
      traits: [],
      concerns: [],
      profileNarrative:
        "Alice Gomes allie rigueur administrative et chaleur communautaire, laisse parfois ses papiers administratifs s'empiler, vérifie chaque facture et surveille de près les dépenses du foyer.",
      assignmentMetadata: {
        life_stage: "midcareer",
        household_type: "other_household",
        employment_class: "service_employee",
        income_posture: "mixed",
        housing_status: "mixed_housing",
        mobility_profile: "mixed_mobility",
        urbanicity: "mixed_urbanicity",
        region_family: "regional_france",
        public_service_dependency: "medium",
        policy_exposure_tags: ["public_policy"],
        economic_vulnerability_tags: ["moderate_cost_pressure"],
        trust_orientation_tags: ["open_to_argument"],
        issue_salience_tags: ["public_policy"],
      },
    };

    const refreshed = refreshPersonaMetadata(stalePersona);

    expect(refreshed.assignmentMetadata.household_type).toBe("family_household");
    expect(refreshed.assignmentMetadata.public_service_dependency).toBe("medium_high");
    expect(refreshed.assignmentMetadata.trust_orientation_tags).toEqual(
      expect.arrayContaining(["proof_seeking", "institution_reliant"]),
    );
    expect(refreshed.assignmentMetadata.issue_salience_tags).toEqual(expect.arrayContaining(["public_services", "cost_of_living"]));
  });
});
