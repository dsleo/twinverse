import "server-only";

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";
import {
  persistedLabRunSchema,
  personaCacheSchema,
  type PersistedLabRun,
  type PersonaCache,
  type PromptSource,
} from "../../lib/labSchemas";

export const PERSONA_CACHE_KEY = "nemotron-france";

export type CachedDailyQuestion = {
  source: "le_figaro";
  question: string;
  promptSource: Omit<PromptSource, "cacheStatus">;
};

export type StorageBackendName = "file" | "redis";

type RunRecordParams = {
  run: PersistedLabRun;
};

export interface LabStorage {
  createRunRecord(params: RunRecordParams): Promise<PersistedLabRun>;
  readRun(runId: string): Promise<PersistedLabRun>;
  writeRun(run: PersistedLabRun): Promise<void>;
  listRuns(): Promise<PersistedLabRun[]>;
  readDailyQuestion(source: string, questionDate: string): Promise<CachedDailyQuestion | null>;
  writeDailyQuestion(source: string, questionDate: string, payload: CachedDailyQuestion): Promise<void>;
  readPersonaCache(cacheKey: string): Promise<PersonaCache | null>;
  writePersonaCache(cacheKey: string, payload: PersonaCache, ttlMs?: number): Promise<void>;
}

type RedisLike = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  zadd(
    key: string,
    member: {
      score: number;
      member: string;
    },
  ): Promise<unknown>;
  zrange(key: string, min: number, max: number, options?: { rev?: boolean }): Promise<unknown[]>;
  mget(...keys: string[]): Promise<unknown[]>;
};

function dataRoot() {
  return process.env.LAB_DATA_ROOT || path.join(process.cwd(), "data");
}

function runsDir() {
  return path.join(dataRoot(), "lab-runs");
}

function personaDir() {
  return path.join(dataRoot(), "personas");
}

function dailyQuestionsDir() {
  return path.join(dataRoot(), "daily-questions");
}

function getRunPath(runId: string) {
  return path.join(runsDir(), `${runId}.json`);
}

function getPersonaCachePath() {
  return path.join(personaDir(), "nemotron-france-cache.json");
}

function getDailyQuestionCachePath(source: string, questionDate: string) {
  return path.join(dailyQuestionsDir(), `${source}-${questionDate}.json`);
}

function parseJsonString<T>(value: unknown, parser: (raw: unknown) => T) {
  if (typeof value === "string") {
    return parser(JSON.parse(value));
  }
  return parser(value);
}

function runKey(runId: string) {
  return `lab:run:${runId}`;
}

function runsIndexKey() {
  return "lab:runs:index";
}

function dailyQuestionKey(source: string, questionDate: string) {
  return `lab:daily-question:${source}:${questionDate}`;
}

function personaCacheKey(cacheKey: string) {
  return `lab:persona-cache:${cacheKey}`;
}

class FileLabStorage implements LabStorage {
  private async ensureDirs() {
    await mkdir(runsDir(), { recursive: true });
    await mkdir(personaDir(), { recursive: true });
    await mkdir(dailyQuestionsDir(), { recursive: true });
  }

  async createRunRecord({ run }: RunRecordParams) {
    await this.writeRun(run);
    return run;
  }

  async readRun(runId: string) {
    await this.ensureDirs();
    const contents = await readFile(getRunPath(runId), "utf8");
    return persistedLabRunSchema.parse(JSON.parse(contents));
  }

  async writeRun(run: PersistedLabRun) {
    await this.ensureDirs();
    await writeFile(getRunPath(run.id), JSON.stringify(run, null, 2), "utf8");
  }

  async listRuns() {
    await this.ensureDirs();
    const entries = await readdir(runsDir());
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const contents = await readFile(path.join(runsDir(), entry), "utf8");
          return persistedLabRunSchema.parse(JSON.parse(contents));
        }),
    );

    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async readDailyQuestion(source: string, questionDate: string) {
    try {
      const contents = await readFile(getDailyQuestionCachePath(source, questionDate), "utf8");
      return parseJsonString(contents, (raw) => raw as CachedDailyQuestion);
    } catch {
      return null;
    }
  }

  async writeDailyQuestion(source: string, questionDate: string, payload: CachedDailyQuestion) {
    const cachePath = getDailyQuestionCachePath(source, questionDate);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async readPersonaCache(cacheKey: string) {
    try {
      if (cacheKey !== PERSONA_CACHE_KEY) {
        return null;
      }
      const contents = await readFile(getPersonaCachePath(), "utf8");
      return parseJsonString(contents, (raw) => personaCacheSchema.parse(raw));
    } catch {
      return null;
    }
  }

  async writePersonaCache(cacheKey: string, payload: PersonaCache) {
    if (cacheKey !== PERSONA_CACHE_KEY) {
      return;
    }
    await mkdir(path.dirname(getPersonaCachePath()), { recursive: true });
    await writeFile(getPersonaCachePath(), JSON.stringify(payload, null, 2), "utf8");
  }
}

export class RedisLabStorage implements LabStorage {
  constructor(private readonly redis: RedisLike) {}

  async createRunRecord({ run }: RunRecordParams) {
    await this.writeRun(run);
    return run;
  }

  async readRun(runId: string) {
    const value = await this.redis.get(runKey(runId));
    if (!value) {
      throw new Error("Run not found.");
    }
    return parseJsonString(value, (raw) => persistedLabRunSchema.parse(raw));
  }

  async writeRun(run: PersistedLabRun) {
    await this.redis.set(runKey(run.id), JSON.stringify(run));
    await this.redis.zadd(runsIndexKey(), { score: Date.parse(run.createdAt), member: run.id });
  }

  async listRuns() {
    const runIds = await this.redis.zrange(runsIndexKey(), 0, 99, { rev: true });
    if (runIds.length === 0) {
      return [];
    }

    const rawRuns = await this.redis.mget(...runIds.map((runId) => runKey(String(runId))));
    return rawRuns
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .map((value) => parseJsonString(value, (raw) => persistedLabRunSchema.parse(raw)));
  }

  async readDailyQuestion(source: string, questionDate: string) {
    const value = await this.redis.get(dailyQuestionKey(source, questionDate));
    if (!value) {
      return null;
    }
    return parseJsonString(value, (raw) => raw as CachedDailyQuestion);
  }

  async writeDailyQuestion(source: string, questionDate: string, payload: CachedDailyQuestion) {
    await this.redis.set(dailyQuestionKey(source, questionDate), JSON.stringify(payload));
  }

  async readPersonaCache(cacheKey: string) {
    const value = await this.redis.get(personaCacheKey(cacheKey));
    if (!value) {
      return null;
    }
    return parseJsonString(value, (raw) => personaCacheSchema.parse(raw));
  }

  async writePersonaCache(cacheKey: string, payload: PersonaCache, ttlMs?: number) {
    const key = personaCacheKey(cacheKey);
    await this.redis.set(key, JSON.stringify(payload));
    if (ttlMs && ttlMs > 0) {
      await this.redis.expire(key, Math.max(1, Math.ceil(ttlMs / 1000)));
    }
  }
}

function configuredRedisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
}

function configuredRedisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
}

export function getConfiguredStorageBackend(): StorageBackendName {
  const configured = process.env.LAB_STORAGE_BACKEND;
  if (configured === "file" || configured === "redis") {
    return configured;
  }

  return configuredRedisUrl() && configuredRedisToken() ? "redis" : "file";
}

let cachedStorage: LabStorage | null = null;

function buildRedisClient() {
  return Redis.fromEnv();
}

export function createLabStorageForBackend(backend: StorageBackendName, options?: { redis?: RedisLike }) {
  if (backend === "redis") {
    return new RedisLabStorage(options?.redis ?? buildRedisClient());
  }
  return new FileLabStorage();
}

export function getLabStorage() {
  if (cachedStorage) {
    return cachedStorage;
  }

  cachedStorage = createLabStorageForBackend(getConfiguredStorageBackend());
  return cachedStorage;
}

export function resetLabStorageForTests() {
  cachedStorage = null;
}
