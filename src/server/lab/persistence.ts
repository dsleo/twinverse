import "server-only";

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import {
  defaultRunSteps,
  persistedLabRunSchema,
  type AudienceGuidance,
  type AudiencePreset,
  type LabInput,
  type PopulationSegmentDesign,
  type PersistedLabRun,
  type PromptSource,
  type RunMode,
  type RunStage,
  type StageId,
} from "../../lib/labSchemas";

export class RunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run not found: ${runId}`);
    this.name = "RunNotFoundError";
  }
}

export class RunStateCorruptError extends Error {
  constructor(runId: string, cause?: unknown) {
    super(`Persisted run state is unreadable for ${runId}.`);
    this.name = "RunStateCorruptError";
    this.cause = cause;
  }
}

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

function nowIso() {
  return new Date().toISOString();
}

async function ensureDirs() {
  await mkdir(runsDir(), { recursive: true });
  await mkdir(personaDir(), { recursive: true });
  await mkdir(dailyQuestionsDir(), { recursive: true });
}

export function getPersonaCachePath() {
  return path.join(personaDir(), "nemotron-france-cache.json");
}

export function getDailyQuestionCachePath(source: string, questionDate: string) {
  return path.join(dailyQuestionsDir(), `${source}-${questionDate}.json`);
}

function getRunPath(runId: string) {
  return path.join(runsDir(), `${runId}.json`);
}

function getTempRunPath(runId: string) {
  return path.join(runsDir(), `${runId}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
}

async function parseRunFile(runId: string, filePath: string) {
  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new RunNotFoundError(runId);
    }
    throw error;
  }

  try {
    return persistedLabRunSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new RunStateCorruptError(runId, error);
    }
    throw error;
  }
}

export function createRunId() {
  return `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createRunRecord({
  input,
  mode,
  audiencePreset,
  audienceGuidance = { mode: "automatic", include: [], avoid: [], priorityConcerns: [] },
  approvedSegmentDesign,
  promptSnapshot,
  promptSource,
}: {
  input: LabInput;
  mode: RunMode;
  audiencePreset: AudiencePreset;
  audienceGuidance?: AudienceGuidance;
  approvedSegmentDesign?: PopulationSegmentDesign;
  promptSnapshot: string;
  promptSource?: PromptSource;
}) {
  await ensureDirs();
  const createdAt = nowIso();
  const run: PersistedLabRun = {
    id: createRunId(),
    createdAt,
    updatedAt: createdAt,
    status: "created",
    mode,
    audiencePreset,
    audienceGuidance,
    approvedSegmentDesign,
    input,
    promptSnapshot,
    promptSource,
    steps: defaultRunSteps(mode),
    panel: [],
    contextPacks: [],
    reactions: [],
    tvSchedule: [],
    tvViewingChoices: [],
    tvPredictions: [],
    rawModelDiagnostics: [],
  };
  await writeRun(run);
  return run;
}

export async function readRun(runId: string) {
  await ensureDirs();
  return parseRunFile(runId, getRunPath(runId));
}

export async function writeRun(run: PersistedLabRun) {
  await ensureDirs();
  const nextRun = { ...run, updatedAt: nowIso() };
  const runPath = getRunPath(run.id);
  const tempPath = getTempRunPath(run.id);
  await writeFile(tempPath, JSON.stringify(nextRun, null, 2), "utf8");
  await rename(tempPath, runPath);
}

export async function listRuns() {
  await ensureDirs();
  const entries = await readdir(runsDir());
  const runs = (
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          const runId = entry.replace(/\.json$/, "");
          try {
            return await parseRunFile(runId, path.join(runsDir(), entry));
          } catch (error) {
            if (error instanceof RunNotFoundError || error instanceof RunStateCorruptError) {
              console.warn(`[lab:persistence] Skipping unreadable run file ${entry}: ${error.message}`);
              return null;
            }
            throw error;
          }
        }),
    )
  ).filter((run): run is PersistedLabRun => Boolean(run));

  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateRun(runId: string, updater: (run: PersistedLabRun) => PersistedLabRun | Promise<PersistedLabRun>) {
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
