import "server-only";

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultRunSteps, persistedMemoryRunSchema, type MemoryInput, type PersistedMemoryRun, type RunStage, type StageId } from "../../lib/memorySchemas";

const DATA_ROOT = path.join(process.cwd(), "data");
const RUNS_DIR = path.join(DATA_ROOT, "memory-runs");
const PERSONA_DIR = path.join(DATA_ROOT, "personas");

function nowIso() {
  return new Date().toISOString();
}

async function ensureDirs() {
  await mkdir(RUNS_DIR, { recursive: true });
  await mkdir(PERSONA_DIR, { recursive: true });
}

export function getPersonaCachePath() {
  return path.join(PERSONA_DIR, "nemotron-france-cache.json");
}

function getRunPath(runId: string) {
  return path.join(RUNS_DIR, `${runId}.json`);
}

export function createRunId() {
  return `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createRunRecord(input: MemoryInput) {
  await ensureDirs();
  const createdAt = nowIso();
  const run: PersistedMemoryRun = {
    id: createRunId(),
    createdAt,
    updatedAt: createdAt,
    status: "created",
    input,
    steps: defaultRunSteps(),
    panel: [],
    contextPacks: [],
    reactions: [],
    rawModelDiagnostics: [],
  };
  await writeRun(run);
  return run;
}

export async function readRun(runId: string) {
  await ensureDirs();
  const contents = await readFile(getRunPath(runId), "utf8");
  return persistedMemoryRunSchema.parse(JSON.parse(contents));
}

export async function writeRun(run: PersistedMemoryRun) {
  await ensureDirs();
  const nextRun = { ...run, updatedAt: nowIso() };
  await writeFile(getRunPath(run.id), JSON.stringify(nextRun, null, 2), "utf8");
}

export async function listRuns() {
  await ensureDirs();
  const entries = await readdir(RUNS_DIR);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const contents = await readFile(path.join(RUNS_DIR, entry), "utf8");
        return persistedMemoryRunSchema.parse(JSON.parse(contents));
      }),
  );

  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateRun(runId: string, updater: (run: PersistedMemoryRun) => PersistedMemoryRun | Promise<PersistedMemoryRun>) {
  const run = await readRun(runId);
  const nextRun = await updater(run);
  await writeRun(nextRun);
  return nextRun;
}

export async function startStage(runId: string, stageId: StageId, summary?: string, diagnostics: Record<string, string> = {}) {
  return updateRun(runId, (run) => ({
    ...run,
    status: "running",
    steps: run.steps.map((step) =>
      step.id === stageId
        ? {
            ...step,
            status: "running",
            startedAt: nowIso(),
            completedAt: undefined,
            error: undefined,
            summary,
            diagnostics,
          }
        : step,
    ),
  }));
}

export async function completeStage(runId: string, stageId: StageId, summary?: string, diagnostics: Record<string, string> = {}) {
  return updateRun(runId, (run) => ({
    ...run,
    steps: run.steps.map((step) =>
      step.id === stageId
        ? {
            ...step,
            status: "completed",
            completedAt: nowIso(),
            summary: summary ?? step.summary,
            diagnostics: { ...step.diagnostics, ...diagnostics },
          }
        : step,
    ),
  }));
}

export async function failStage(runId: string, stageId: StageId, error: string, diagnostics: Record<string, string> = {}) {
  return updateRun(runId, (run) => ({
    ...run,
    status: "failed",
    error,
    steps: run.steps.map((step) =>
      step.id === stageId
        ? {
            ...step,
            status: "failed",
            completedAt: nowIso(),
            error,
            diagnostics: { ...step.diagnostics, ...diagnostics },
          }
        : step,
    ),
  }));
}

export function summarizeSteps(steps: RunStage[]) {
  return steps.map((step) => `${step.id}:${step.status}`).join(", ");
}
