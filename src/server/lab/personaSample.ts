import "server-only";

import {
  normalizedPersonaSchema,
  personaAssignmentMetadataSchema,
  personaCacheSchema,
  type NormalizedPersona,
  type PersonaAssignmentMetadata,
  type PersonaCache,
} from "../../lib/labSchemas";
import { getLabStorage, PERSONA_CACHE_KEY } from "./storage";

const DATASET_NAME = "nvidia/Nemotron-Personas-France";
const DEFAULT_SAMPLE_SIZE = 100;
const CACHE_TTL_MS = Number(process.env.HF_PERSONA_CACHE_TTL_HOURS || "24") * 60 * 60 * 1000;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 36);
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" ? [entry.trim()] : [])).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,/|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function pickNumber(row: Record<string, unknown>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return fallback;
}

function inferHouseholdType(household: string) {
  const text = household.toLowerCase();
  if (text.includes("alone") || text.includes("solo")) {
    return "single_adult";
  }
  if (text.includes("children") || text.includes("family")) {
    return "family_household";
  }
  if (text.includes("couple")) {
    return "couple_without_children";
  }
  return "other_household";
}

function inferLifeStage(age: number) {
  if (age <= 29) {
    return "young_adult";
  }
  if (age <= 44) {
    return "midcareer";
  }
  if (age <= 59) {
    return "established_adult";
  }
  return "retirement_age";
}

function inferEmploymentClass(occupation: string) {
  const text = occupation.toLowerCase();
  if (text.includes("retrait")) {
    return "retired";
  }
  if (text.includes("cadre") || text.includes("profession intellectuelle")) {
    return "executive_professional";
  }
  if (text.includes("artisan") || text.includes("commer") || text.includes("entreprise")) {
    return "self_employed";
  }
  if (text.includes("interm")) {
    return "intermediate_professional";
  }
  if (text.includes("ouvrier")) {
    return "working_class";
  }
  if (text.includes("employ")) {
    return "service_employee";
  }
  if (text.includes("sans activité")) {
    return "out_of_work";
  }
  return "other";
}

function inferIncomePosture(economicPosture: string) {
  const text = economicPosture.toLowerCase();
  if (text.includes("affluent")) {
    return "affluent";
  }
  if (text.includes("working class") || text.includes("budget") || text.includes("cost aware") || text.includes("value conscious")) {
    return "cost_sensitive";
  }
  if (text.includes("stable")) {
    return "stable_middle";
  }
  return "mixed";
}

function inferHousingStatus(household: string, city: string) {
  const text = `${household} ${city}`.toLowerCase();
  if (text.includes("paris") || text.includes("arrondissement")) {
    return "urban_renter_profile";
  }
  if (text.includes("family")) {
    return "family_home_profile";
  }
  return "mixed_housing";
}

function inferMobilityProfile(city: string) {
  const text = city.toLowerCase();
  if (text.includes("paris") || text.includes("argenteuil") || text.includes("orly") || text.includes("montreuil")) {
    return "transit_oriented";
  }
  return "car_and_local_service";
}

function inferUrbanicity(city: string) {
  const text = city.toLowerCase();
  if (text.includes("paris") || text.includes("arrondissement")) {
    return "major_urban";
  }
  if (text.includes("saint-") || text.includes("mons") || text.includes("argenteuil") || text.includes("orly")) {
    return "secondary_urban";
  }
  return "small_town_rural";
}

function inferRegionFamily(region: string) {
  const text = region.toLowerCase();
  if (["paris", "val-de-marne", "val-d'oise"].some((token) => text.includes(token))) {
    return "ile_de_france";
  }
  if (["nord", "pas-de-calais"].some((token) => text.includes(token))) {
    return "north_industrial";
  }
  if (["savoie", "rhône", "isère", "haute-loire"].some((token) => text.includes(token))) {
    return "alpine_rhone";
  }
  if (["la réunion"].some((token) => text.includes(token))) {
    return "overseas";
  }
  return "regional_france";
}

function inferPublicServiceDependency(economicPosture: string, age: number) {
  const text = economicPosture.toLowerCase();
  if (age >= 60) {
    return "high";
  }
  if (text.includes("working class") || text.includes("budget") || text.includes("sans activité")) {
    return "medium_high";
  }
  return "medium";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function deriveAssignmentMetadata(persona: Omit<NormalizedPersona, "assignmentMetadata">): PersonaAssignmentMetadata {
  const employmentClass = inferEmploymentClass(persona.occupation);
  const lifeStage = inferLifeStage(persona.age);
  const incomePosture = inferIncomePosture(persona.economicPosture);
  const householdType = inferHouseholdType(persona.household);
  const mobilityProfile = inferMobilityProfile(persona.city);
  const urbanicity = inferUrbanicity(persona.city);
  const regionFamily = inferRegionFamily(persona.region);
  const publicServiceDependency = inferPublicServiceDependency(persona.economicPosture, persona.age);

  const policyExposureTags = unique([
    employmentClass,
    mobilityProfile,
    urbanicity,
    householdType.includes("family") ? "family_budget_exposure" : "individual_budget_exposure",
  ]);
  const economicVulnerabilityTags = unique([
    incomePosture === "cost_sensitive" ? "high_cost_of_living_pressure" : "moderate_cost_pressure",
    employmentClass === "out_of_work" ? "employment_insecurity" : "",
    lifeStage === "retirement_age" ? "fixed_income" : "",
  ]);
  const trustOrientationTags = unique([
    persona.traits.some((trait) => trait.toLowerCase().includes("pragmatic")) ? "pragmatic" : "open_to_argument",
    publicServiceDependency === "high" ? "institution_reliant" : "proof_seeking",
  ]);
  const issueSalienceTags = unique([
    ...persona.concerns.map((concern) => slugify(concern).replace(/-/g, "_")),
    persona.profileNarrative.toLowerCase().includes("energy") ? "energy_policy" : "public_policy",
  ]);

  return personaAssignmentMetadataSchema.parse({
    life_stage: lifeStage,
    household_type: householdType,
    employment_class: employmentClass,
    income_posture: incomePosture,
    housing_status: inferHousingStatus(persona.household, persona.city),
    mobility_profile: mobilityProfile,
    urbanicity,
    region_family: regionFamily,
    public_service_dependency: publicServiceDependency,
    policy_exposure_tags: policyExposureTags,
    economic_vulnerability_tags: economicVulnerabilityTags,
    trust_orientation_tags: trustOrientationTags,
    issue_salience_tags: issueSalienceTags,
  });
}

function normalizePersonaRow(row: Record<string, unknown>, sampleVersion: string, index: number) {
  const profileNarrative = pickString(row, ["persona", "profile", "biography", "description", "narrative"], "French respondent profile");
  const traits = toStringArray(row.personality_traits ?? row.traits ?? row.personality);
  const concerns = toStringArray(row.concerns ?? row.key_concerns ?? row.priorities);

  // Extract name from the beginning of the persona narrative (e.g. "Epse Janiak allie...")
  const extractedName = profileNarrative.match(/^([^.,]+?)\s+(?:allie|est|habite|travaille|nourrit|entre|aime|partage|vit|pratique|occupe|pense|consacre|veut|souhaite|espère|cherche)/i)?.[1];

  const basePersona = {
    id: `hf-${sampleVersion}-${index.toString().padStart(3, "0")}`,
    sourceRowId: String(row.uuid ?? row.id ?? row.persona_id ?? row.profile_id ?? index),
    sourceDataset: DATASET_NAME,
    sourceSampleVersion: sampleVersion,
    name: extractedName || pickString(row, ["full_name", "name", "display_name"], `Persona ${index + 1}`),
    age: pickNumber(row, ["age"], 40),
    city: pickString(row, ["commune", "city", "town", "location_city"], "France"),
    region: pickString(row, ["departement", "region", "department", "location_region"], "France"),
    occupation: pickString(row, ["occupation", "professional_occupation", "job", "socio_professional_category"], "Unknown occupation"),
    household: pickString(row, ["household_type", "household", "family_situation", "marital_status"], "Household not specified"),
    economicPosture: pickString(row, ["economic_posture", "economic_status", "income_description"], "mixed"),
    housingStatus: pickString(row, ["housing_status"], "mixed_housing"),
    mobilityProfile: pickString(row, ["mobility_profile"], "mixed_mobility"),
    urbanicity: pickString(row, ["urbanicity"], "mixed_urbanicity"),
    traits,
    concerns,
    profileNarrative,
  };

  const assignmentMetadata = deriveAssignmentMetadata(basePersona);
  return normalizedPersonaSchema.parse({
    ...basePersona,
    housingStatus: basePersona.housingStatus === "mixed_housing" ? assignmentMetadata.housing_status : basePersona.housingStatus,
    mobilityProfile: basePersona.mobilityProfile === "mixed_mobility" ? assignmentMetadata.mobility_profile : basePersona.mobilityProfile,
    urbanicity: basePersona.urbanicity === "mixed_urbanicity" ? assignmentMetadata.urbanicity : basePersona.urbanicity,
    assignmentMetadata,
  });
}

async function readCachedPersonas() {
  return getLabStorage().readPersonaCache(PERSONA_CACHE_KEY);
}

async function writeCache(cache: PersonaCache) {
  await getLabStorage().writePersonaCache(PERSONA_CACHE_KEY, cache, CACHE_TTL_MS);
}

async function fetchDatasetRows(length: number) {
  const baseUrl =
    process.env.HF_DATASET_ROWS_URL ||
    "https://datasets-server.huggingface.co/rows?dataset=nvidia%2FNemotron-Personas-France&config=default&split=train";
  const response = await fetch(`${baseUrl}&offset=0&length=${length}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Hugging Face dataset request failed with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as { rows?: Array<{ row?: Record<string, unknown> }> };
  const rows = body.rows?.map((entry) => entry.row ?? {}).filter(Boolean) ?? [];
  if (rows.length === 0) {
    throw new Error("Hugging Face dataset request returned no rows.");
  }
  return rows;
}

export function metadataTaxonomy(personas: NormalizedPersona[]) {
  const taxonomy: Record<string, string[]> = {};
  for (const persona of personas) {
    const metadata = persona.assignmentMetadata;
    for (const [family, rawValue] of Object.entries(metadata)) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      taxonomy[family] = unique([...(taxonomy[family] ?? []), ...values]);
    }
  }
  return taxonomy;
}

export async function loadPersonaSample(forceRefresh = false) {
  const cached = await readCachedPersonas();
  if (!forceRefresh && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return cached;
    }
  }

  const sampleVersion = new Date().toISOString().slice(0, 10);
  const rows = await fetchDatasetRows(DEFAULT_SAMPLE_SIZE);
  const personas = rows.map((row, index) => normalizePersonaRow(row, sampleVersion, index));
  const cache = personaCacheSchema.parse({
    dataset: DATASET_NAME,
    fetchedAt: new Date().toISOString(),
    sampleVersion,
    sampleSize: personas.length,
    personas,
  });
  await writeCache(cache);
  return cache;
}
