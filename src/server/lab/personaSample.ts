import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPersonaCachePath } from "./persistence";
import {
  normalizedPersonaSchema,
  personaAssignmentMetadataSchema,
  personaCacheSchema,
  type NormalizedPersona,
  type PersonaAssignmentMetadata,
  type PersonaCache,
} from "../../lib/labSchemas";

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

function normalizedText(...values: string[]) {
  return values
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(normalizedText(needle)));
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
  const text = normalizedText(household);
  if (includesAny(text, ["famille monoparentale", "avec enfant", "avec enfants", "children", "family"])) {
    return "family_household";
  }
  if (includesAny(text, ["personne seule", "vit seule", "single", "alone", "solo", "celibataire"])) {
    return "single_adult";
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
  const text = normalizedText(occupation);
  if (text.includes("retrait")) {
    return "retired";
  }
  if (includesAny(text, ["cadre", "profession intellectuelle", "ingenieur", "consultant", "directeur"])) {
    return "executive_professional";
  }
  if (includesAny(text, ["artisan", "commerc", "entreprise", "boulanger", "independant"])) {
    return "self_employed";
  }
  if (includesAny(text, ["interm", "technicien", "infirm", "enseign"])) {
    return "intermediate_professional";
  }
  if (includesAny(text, ["ouvrier", "manutention", "chantier", "atelier"])) {
    return "working_class";
  }
  if (includesAny(text, ["employ", "administratif", "vente", "accueil", "fonctionnaire"])) {
    return "service_employee";
  }
  if (includesAny(text, ["sans activite", "sans emploi", "inactif", "autres sans activite professionnelle"])) {
    return "out_of_work";
  }
  return "other";
}

function inferIncomePosture(economicPosture: string, employmentClass: string, householdType: string, narrative: string) {
  const text = normalizedText(economicPosture, narrative);
  if (includesAny(text, ["affluent", "aise", "confortable", "patrimoine", "chef d entreprise"])) {
    return "affluent";
  }
  if (
    includesAny(text, ["budget", "prix", "facture", "loyer", "economie", "epargner", "fuite", "reparation", "cout"]) ||
    employmentClass === "out_of_work" ||
    employmentClass === "working_class" ||
    (employmentClass === "service_employee" && householdType === "family_household")
  ) {
    return "cost_sensitive";
  }
  if (
    includesAny(text, ["stable", "fonctionnaire", "administratif", "rigueur", "methodique"]) ||
    employmentClass === "retired" ||
    employmentClass === "executive_professional" ||
    employmentClass === "intermediate_professional" ||
    employmentClass === "self_employed"
  ) {
    return "stable_middle";
  }
  return "mixed";
}

function inferHousingStatus(household: string, city: string, narrative: string) {
  const text = normalizedText(household, city, narrative);
  if (includesAny(text, ["paris", "arrondissement", "orly", "argenteuil", "montreuil", "appartement", "immeuble"])) {
    return "urban_renter_profile";
  }
  if (includesAny(text, ["famille", "avec enfant", "maison", "foyer", "potager", "jardin"])) {
    return "family_home_profile";
  }
  return "mixed_housing";
}

function inferMobilityProfile(city: string) {
  const text = normalizedText(city);
  if (includesAny(text, ["paris", "argenteuil", "orly", "montreuil"])) {
    return "transit_oriented";
  }
  if (includesAny(text, ["saint ", "saint-", "mons", "lille", "lyon", "grenoble"])) {
    return "mixed_commute";
  }
  return "car_and_local_service";
}

function inferUrbanicity(city: string) {
  const text = normalizedText(city);
  if (includesAny(text, ["paris", "arrondissement"])) {
    return "major_urban";
  }
  if (includesAny(text, ["saint-", "saint ", "mons", "argenteuil", "orly", "montreuil", "chambery", "clermont", "nantes"])) {
    return "secondary_urban";
  }
  return "small_town_rural";
}

function inferRegionFamily(region: string) {
  const text = normalizedText(region);
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

function inferPublicServiceDependency(economicPosture: string, age: number, employmentClass: string, householdType: string, narrative: string) {
  const text = normalizedText(economicPosture, narrative);
  if (age >= 60 || employmentClass === "retired") {
    return "high";
  }
  if (
    includesAny(text, ["administratif", "fonctionnaire", "papiers administratifs", "service", "demarches"]) ||
    employmentClass === "out_of_work" ||
    householdType === "family_household"
  ) {
    return "medium_high";
  }
  return "medium";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferTrustOrientationTags(persona: Omit<NormalizedPersona, "assignmentMetadata">, publicServiceDependency: string) {
  const text = normalizedText(persona.profileNarrative, ...persona.traits, ...persona.concerns);
  return unique([
    includesAny(text, ["pragmat", "sens pratique", "terre a terre", "rigueur", "methodique"]) ? "pragmatic" : "open_to_argument",
    includesAny(text, ["verifie", "critique", "mefiance", "anxiet", "controle", "etiquette de securite"]) ? "proof_seeking" : "",
    publicServiceDependency === "high" || includesAny(text, ["fonctionnaire", "administratif", "papier", "demarche"]) ? "institution_reliant" : "",
  ]);
}

function inferIssueSalienceTags(
  persona: Omit<NormalizedPersona, "assignmentMetadata">,
  householdType: string,
  employmentClass: string,
  mobilityProfile: string,
  urbanicity: string,
) {
  const text = normalizedText(persona.profileNarrative, persona.occupation, persona.household, persona.city, persona.region);
  return unique([
    ...persona.concerns.map((concern) => slugify(concern).replace(/-/g, "_")),
    employmentClass === "retired" ? "healthcare" : "",
    employmentClass === "working_class" || employmentClass === "service_employee" || employmentClass === "out_of_work" ? "cost_of_living" : "",
    employmentClass === "working_class" || employmentClass === "self_employed" ? "employment" : "",
    householdType === "family_household" ? "family_life" : "",
    mobilityProfile === "transit_oriented" || urbanicity !== "small_town_rural" ? "transport" : "",
    includesAny(text, ["administratif", "fonctionnaire", "papiers administratifs", "service public"]) ? "public_services" : "",
    includesAny(text, ["atelier", "chantier", "boulanger", "commerce", "potager"]) ? "local_economy" : "",
    includesAny(text, ["immeuble", "appartement", "logement", "foyer"]) ? "housing" : "",
    "public_policy",
  ]);
}

function inferTvPreferenceDescription(
  lifeStage: string,
  householdType: string,
  employmentClass: string,
): string {
  const genrePrefs: Record<string, string> = {
    young_adult: "contemporary series, action films, variety shows",
    midcareer: "drama series, thrillers, documentaries",
    established_adult: "premium dramas, cultural programs, news",
    retirement_age: "classic films, documentaries, news, light entertainment",
  };

  const scheduleContext: Record<string, string> = {
    family_household: "primetime viewing with family, early evening preference",
    single_adult: "flexible solo viewing, anytime preference",
    couple_without_children: "evening and late-night viewing, quality-focused",
    other_household: "flexible group viewing",
  };

  const timeAvailability: Record<string, string> = {
    retired: "afternoon and primetime viewing available",
    executive_professional: "evening-only viewing after work",
    self_employed: "variable schedule, flexible viewing times",
    intermediate_professional: "evening primetime viewing",
    working_class: "evening and weekend viewing",
    service_employee: "irregular schedule, shift-dependent",
    out_of_work: "anytime viewing available",
  };

  const genres = genrePrefs[lifeStage] || "diverse programming";
  const context = scheduleContext[householdType] || "flexible viewing";
  const timing = timeAvailability[employmentClass] || "evening viewing";

  return `Likely prefers ${genres}. Watches during ${timing.toLowerCase()}, typically ${context.toLowerCase()}.`;
}

export function deriveAssignmentMetadata(persona: Omit<NormalizedPersona, "assignmentMetadata">): PersonaAssignmentMetadata {
  const employmentClass = inferEmploymentClass(persona.occupation);
  const lifeStage = inferLifeStage(persona.age);
  const householdType = inferHouseholdType(persona.household);
  const incomePosture = inferIncomePosture(persona.economicPosture, employmentClass, householdType, persona.profileNarrative);
  const mobilityProfile = inferMobilityProfile(persona.city);
  const urbanicity = inferUrbanicity(persona.city);
  const regionFamily = inferRegionFamily(persona.region);
  const publicServiceDependency = inferPublicServiceDependency(
    persona.economicPosture,
    persona.age,
    employmentClass,
    householdType,
    persona.profileNarrative,
  );
  const housingStatus = inferHousingStatus(persona.household, persona.city, persona.profileNarrative);

  const policyExposureTags = unique([
    employmentClass,
    mobilityProfile,
    urbanicity,
    householdType === "family_household" ? "family_budget_exposure" : householdType === "single_adult" ? "solo_household_exposure" : "shared_household_exposure",
    housingStatus === "urban_renter_profile" ? "housing_cost_exposure" : "",
    publicServiceDependency !== "medium" ? "public_service_interface" : "",
  ]);
  const economicVulnerabilityTags = unique([
    incomePosture === "cost_sensitive" ? "high_cost_of_living_pressure" : incomePosture === "stable_middle" ? "moderate_cost_pressure" : "low_cost_pressure",
    employmentClass === "out_of_work" ? "employment_insecurity" : "",
    lifeStage === "retirement_age" ? "fixed_income" : "",
  ]);
  const trustOrientationTags = inferTrustOrientationTags(persona, publicServiceDependency);
  const issueSalienceTags = inferIssueSalienceTags(persona, householdType, employmentClass, mobilityProfile, urbanicity);

  return personaAssignmentMetadataSchema.parse({
    life_stage: lifeStage,
    household_type: householdType,
    employment_class: employmentClass,
    income_posture: incomePosture,
    housing_status: housingStatus,
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

export function refreshPersonaMetadata(persona: NormalizedPersona): NormalizedPersona {
  const assignmentMetadata = deriveAssignmentMetadata({
    ...persona,
    housingStatus: persona.housingStatus,
    mobilityProfile: persona.mobilityProfile,
    urbanicity: persona.urbanicity,
  });

  const tvPreferenceDescription = inferTvPreferenceDescription(
    assignmentMetadata.life_stage,
    assignmentMetadata.household_type,
    assignmentMetadata.employment_class,
  );

  return normalizedPersonaSchema.parse({
    ...persona,
    housingStatus: persona.housingStatus === "mixed_housing" ? assignmentMetadata.housing_status : persona.housingStatus,
    mobilityProfile: persona.mobilityProfile === "mixed_mobility" ? assignmentMetadata.mobility_profile : persona.mobilityProfile,
    urbanicity: persona.urbanicity === "mixed_urbanicity" ? assignmentMetadata.urbanicity : persona.urbanicity,
    assignmentMetadata,
    tvPreferenceDescription,
  });
}

export function normalizePersonaRow(row: Record<string, unknown>, sampleVersion: string, index: number) {
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
    tvPreferenceDescription: "",
  };

  return refreshPersonaMetadata(
    normalizedPersonaSchema.parse({
    ...basePersona,
      assignmentMetadata: personaAssignmentMetadataSchema.parse({
        life_stage: inferLifeStage(basePersona.age),
        household_type: inferHouseholdType(basePersona.household),
        employment_class: inferEmploymentClass(basePersona.occupation),
        income_posture: "mixed",
        housing_status: basePersona.housingStatus,
        mobility_profile: basePersona.mobilityProfile,
        urbanicity: basePersona.urbanicity,
        region_family: inferRegionFamily(basePersona.region),
        public_service_dependency: "medium",
        policy_exposure_tags: ["public_policy"],
        economic_vulnerability_tags: ["moderate_cost_pressure"],
        trust_orientation_tags: ["open_to_argument"],
        issue_salience_tags: ["public_policy"],
      }),
    }),
  );
}

async function readCachedPersonas() {
  try {
    const contents = await readFile(getPersonaCachePath(), "utf8");
    const cached = personaCacheSchema.parse(JSON.parse(contents));
    return personaCacheSchema.parse({
      ...cached,
      personas: cached.personas.map((persona) => refreshPersonaMetadata(persona)),
    });
  } catch {
    return null;
  }
}

async function writeCache(cache: PersonaCache) {
  await mkdir(path.dirname(getPersonaCachePath()), { recursive: true });
  await writeFile(getPersonaCachePath(), JSON.stringify(cache, null, 2), "utf8");
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
