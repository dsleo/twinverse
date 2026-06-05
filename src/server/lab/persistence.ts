import "server-only";

import {
  defaultRunSteps,
  type AudiencePreset,
  type LabInput,
  type PersistedLabRun,
  type PromptSource,
  type RunMode,
  type RunStage,
  type StageId,
} from "../../lib/labSchemas";
import { getLabStorage } from "./storage";

function nowIso() {
  return new Date().toISOString();
}

export function createRunId() {
  return `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createRunRecord({
  input,
  mode,
  audiencePreset,
  promptSnapshot,
  promptSource,
}: {
  input: LabInput;
  mode: RunMode;
  audiencePreset: AudiencePreset;
  promptSnapshot: string;
  promptSource?: PromptSource;
}) {
  const createdAt = nowIso();
  const run: PersistedLabRun = {
    id: createRunId(),
    createdAt,
    updatedAt: createdAt,
    status: "created",
    mode,
    audiencePreset,
    input,
    promptSnapshot,
    promptSource,
    steps: defaultRunSteps(),
    panel: [],
    contextPacks: [],
    reactions: [],
    rawModelDiagnostics: [],
  };

  return getLabStorage().createRunRecord({ run });
}

export async function readRun(runId: string) {
  return getLabStorage().readRun(runId);
}

export async function writeRun(run: PersistedLabRun) {
  const nextRun = { ...run, updatedAt: nowIso() };
  await getLabStorage().writeRun(nextRun);
}

export async function listRuns() {
  return getLabStorage().listRuns();
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
