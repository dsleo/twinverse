import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { defaultRunSteps, type PersonaCache, type PersistedLabRun } from "../../lib/labSchemas";
import { PERSONA_CACHE_KEY, RedisLabStorage, createLabStorageForBackend } from "./storage";

const dataDir = path.join(process.cwd(), ".tmp-tests", "storage");

class FakeRedis {
  private readonly values = new Map<string, string>();
  private readonly scores = new Map<string, Array<{ score: number; member: string }>>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: unknown) {
    this.values.set(key, String(value));
    return "OK";
  }

  async expire(_key: string, _seconds: number) {
    return 1;
  }

  async zadd(key: string, member: { score: number; member: string }) {
    const current = this.scores.get(key) ?? [];
    const withoutExisting = current.filter((entry) => entry.member !== member.member);
    withoutExisting.push(member);
    this.scores.set(key, withoutExisting);
    return 1;
  }

  async zrange(key: string, min: number, max: number, options?: { rev?: boolean }) {
    const current = [...(this.scores.get(key) ?? [])].sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
    const ordered = options?.rev ? current.reverse() : current;
    return ordered.slice(min, max + 1).map((entry) => entry.member);
  }

  async mget(...keys: string[]) {
    return keys.map((key) => this.values.get(key) ?? null);
  }
}

function sampleRun(id: string, createdAt: string): PersistedLabRun {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    status: "created",
    mode: "manual",
    audiencePreset: "france_general",
    input: {
      rawInput: "Faut-il renforcer les transports publics dans les villes moyennes ?",
      inputType: "question",
    },
    promptSnapshot: "Faut-il renforcer les transports publics dans les villes moyennes ?",
    steps: defaultRunSteps(),
    panel: [],
    contextPacks: [],
    reactions: [],
    rawModelDiagnostics: [],
  };
}

function samplePersonaCache(): PersonaCache {
  return {
    dataset: "nvidia/Nemotron-Personas-France",
    fetchedAt: "2026-06-05T08:00:00.000Z",
    sampleVersion: "2026-06-05",
    sampleSize: 1,
    personas: [
      {
        id: "persona-1",
        sourceRowId: "row-1",
        sourceDataset: "nvidia/Nemotron-Personas-France",
        sourceSampleVersion: "2026-06-05",
        name: "Claire Martin",
        age: 48,
        city: "Paris",
        region: "Île-de-France",
        occupation: "Cadre",
        household: "Family household",
        economicPosture: "stable middle",
        housingStatus: "family_home_profile",
        mobilityProfile: "transit_oriented",
        urbanicity: "major_urban",
        traits: ["pragmatic"],
        concerns: ["public services"],
        profileNarrative: "Claire Martin suit de près les sujets de service public.",
        assignmentMetadata: {
          life_stage: "established_adult",
          household_type: "family_household",
          employment_class: "executive_professional",
          income_posture: "stable_middle",
          housing_status: "family_home_profile",
          mobility_profile: "transit_oriented",
          urbanicity: "major_urban",
          region_family: "ile_de_france",
          public_service_dependency: "medium",
          policy_exposure_tags: ["family_budget_exposure"],
          economic_vulnerability_tags: ["moderate_cost_pressure"],
          trust_orientation_tags: ["pragmatic"],
          issue_salience_tags: ["public_services"],
        },
      },
    ],
  };
}

afterEach(async () => {
  delete process.env.LAB_DATA_ROOT;
  await rm(dataDir, { recursive: true, force: true });
});

describe("Lab storage adapters", () => {
  it("keeps file storage and redis storage aligned for runs and caches", async () => {
    process.env.LAB_DATA_ROOT = dataDir;
    const fileStorage = createLabStorageForBackend("file");
    const redisStorage = new RedisLabStorage(new FakeRedis());
    const runA = sampleRun("lab-a", "2026-06-05T08:00:00.000Z");
    const runB = sampleRun("lab-b", "2026-06-05T09:00:00.000Z");
    const dailyQuestion = {
      source: "le_figaro" as const,
      question: "Faut-il geler les pensions de retraite ?",
      promptSource: {
        publisher: "Le Figaro",
        label: "Question du jour",
        url: "https://www.lefigaro.fr/politique/gel-pensions",
        questionDate: "2026-06-05",
        fetchedAt: "2026-06-05T08:00:00.000Z",
      },
    };
    const personaCache = samplePersonaCache();

    for (const storage of [fileStorage, redisStorage]) {
      await storage.createRunRecord({ run: runA });
      await storage.createRunRecord({ run: runB });
      await storage.writeDailyQuestion("le_figaro", "2026-06-05", dailyQuestion);
      await storage.writePersonaCache(PERSONA_CACHE_KEY, personaCache, 60_000);

      const listed = await storage.listRuns();
      expect(listed.map((run) => run.id)).toEqual(["lab-b", "lab-a"]);
      expect((await storage.readRun("lab-a")).input.rawInput).toContain("transports publics");
      expect(await storage.readDailyQuestion("le_figaro", "2026-06-05")).toEqual(dailyQuestion);
      expect(await storage.readPersonaCache(PERSONA_CACHE_KEY)).toEqual(personaCache);
    }
  });
});
