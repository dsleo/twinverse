import "server-only";

import { buildAggregation } from "./aggregation";
import { buildContextPack } from "./contextPacks";
import { logLabRun, logLabStage } from "./logging";
import { createRunRecord, readRun, writeRun } from "./persistence";
import { loadPersonaSample } from "./personaSample";
import { mapPopulationToPanel } from "./populationMapping";
import { buildReactionsForSegment } from "./reactions";
import { retrieveSources } from "./retrieval";
import { executeTvAudienceRun } from "./tvPipeline";
import { type AudiencePreset, labInputSchema, type LabInput, type PersistedLabRun, type PromptSource, type RunMode, type StageId } from "../../lib/labSchemas";

type SettledTask<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

function settleTask<T>(task: Promise<T>): Promise<SettledTask<T>> {
  return task.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

export async function createLabRun({
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
  const parsed = labInputSchema.parse(input);
  return createRunRecord({
    input: parsed,
    mode,
    audiencePreset,
    promptSnapshot,
    promptSource,
  });
}

export async function executeLabRun(runId: string) {
  // Delegate to TV pipeline for TV audience prediction runs
  const run = await readRun(runId);
  if (run.mode === "tv_audience_daily") {
    return executeTvAudienceRun(runId);
  }

  logLabRun(runId, "run-start", {
    mode: run.mode,
    audiencePreset: run.audiencePreset,
  });

  let currentRun: PersistedLabRun | null = null;

  const persistRun = async () => {
    if (!currentRun) {
      throw new Error("Run state is not initialized.");
    }
    await writeRun(currentRun);
  };

  const setStageStatus = (stageId: StageId, status: "running" | "completed" | "failed", options?: {
    summary?: string;
    error?: string;
    diagnostics?: Record<string, string>;
  }) => {
    if (!currentRun) {
      throw new Error("Run state is not initialized.");
    }

    const now = new Date().toISOString();
    currentRun = {
      ...currentRun,
      status: status === "running" ? "running" : status === "failed" ? "failed" : currentRun.status,
      error: status === "failed" ? options?.error : undefined,
      steps: currentRun.steps.map((step) =>
        step.id === stageId
          ? {
              ...step,
              status,
              startedAt: status === "running" ? now : step.startedAt,
              completedAt: status === "completed" || status === "failed" ? now : undefined,
              error: status === "failed" ? options?.error : undefined,
              summary: options?.summary ?? step.summary,
              diagnostics: options?.diagnostics ? { ...step.diagnostics, ...options.diagnostics } : step.diagnostics,
            }
          : step,
      ),
    };

    logLabStage(runId, stageId, status, {
      summary: options?.summary,
      error: options?.error,
      ...options?.diagnostics,
    });
  };

  try {
    currentRun = await readRun(runId);
    setStageStatus("retrieval", "running", {
      summary: "Collecting live source signals from configured providers.",
    });
    await persistRun();

    const retrievalTask = settleTask(retrieveSources(currentRun.input));

    setStageStatus("population_mapping", "running", {
      summary: "Assigning the live persona sample to question-specific segments.",
    });
    await persistRun();

    const cache = await loadPersonaSample();
    const mapped = await mapPopulationToPanel(currentRun.input, cache, currentRun.audiencePreset, { runId });
    currentRun = {
      ...currentRun,
      panelSampleVersion: cache.sampleVersion,
      panel: mapped.panel,
      populationMap: mapped.assignment,
      rawModelDiagnostics: [...currentRun.rawModelDiagnostics, { stage: "population_mapping", ...mapped.diagnostics }],
    };
    setStageStatus("population_mapping", "completed", {
      summary: `Built 5 prompt-specific segments from ${cache.sampleSize} cached dataset personas.`,
      diagnostics: {
        panelSize: String(mapped.panel.length),
        sampleVersion: cache.sampleVersion,
        audiencePreset: currentRun.audiencePreset,
      },
    });
    await persistRun();

    const retrievalResult = await retrievalTask;
    if (!retrievalResult.ok) {
      throw retrievalResult.error;
    }
    const retrieval = retrievalResult.value;
    currentRun = { ...currentRun, retrieval };
    setStageStatus("retrieval", "completed", {
      summary: `Collected ${retrieval.sources.length} source cards across ${retrieval.outcomes.length} providers.`,
      diagnostics: Object.fromEntries(retrieval.outcomes.map((outcome) => [outcome.provider, outcome.status])),
    });
    await persistRun();

    if (!currentRun.populationMap) {
      throw new Error("Population map missing after population stage.");
    }
    if (!currentRun.retrieval) {
      throw new Error("Retrieval payload missing after retrieval stage.");
    }

    const populationMap = currentRun.populationMap;
    const retrievalState = currentRun.retrieval;
    const panel = currentRun.panel;

    setStageStatus("context_packs", "running", {
      summary: "Writing one context pack per derived segment.",
    });
    await persistRun();

    const preferredSources = retrievalState.sources.filter((source) => source.provenance === "live").slice(0, 4);
    const sourcesForPrompts = preferredSources.length > 0 ? preferredSources : retrievalState.sources.slice(0, 4);
    const contextPackResults = await Promise.all(
      populationMap.segments.map(async (segment) => {
        const personas = panel.filter((persona) => segment.representativePersonaIds.includes(persona.id));
        return buildContextPack(currentRun!.input, segment, personas, sourcesForPrompts, { runId });
      }),
    );
    currentRun = {
      ...currentRun,
      contextPacks: contextPackResults.map((result) => result.pack),
      rawModelDiagnostics: [
        ...currentRun.rawModelDiagnostics,
        ...contextPackResults.map((result) => ({ stage: "context_packs" as const, ...result.diagnostics })),
      ],
    };
    setStageStatus("context_packs", "completed", {
      summary: `Built ${contextPackResults.length} structured context packs.`,
    });
    await persistRun();

    setStageStatus("persona_reactions", "running", {
      summary: "Evaluating two personas per segment with structured reactions.",
    });
    await persistRun();

    const reactionResults = await Promise.all(
      populationMap.segments.map(async (segment) => {
        const personas = segment.evaluatedPersonaIds.map((personaId) => {
          const persona = panel.find((entry) => entry.id === personaId);
          if (!persona) {
            throw new Error(`Reaction persona missing for ${segment.id}/${personaId}.`);
          }
          return persona;
        });
        const contextPack = currentRun!.contextPacks.find((pack) => pack.segmentId === segment.id);
        if (!contextPack) {
          throw new Error(`Reaction context pack missing for ${segment.id}.`);
        }
        return buildReactionsForSegment(currentRun!.input, segment, personas, contextPack, sourcesForPrompts, { runId });
      }),
    );
    currentRun = {
      ...currentRun,
      reactions: reactionResults.flatMap((result) => result.reactions),
      rawModelDiagnostics: [
        ...currentRun.rawModelDiagnostics,
        ...reactionResults.map((result) => ({ stage: "persona_reactions" as const, ...result.diagnostics })),
      ],
    };
    setStageStatus("persona_reactions", "completed", {
      summary: `Evaluated ${currentRun.reactions.length} personas across 5 segments.`,
      diagnostics: {
        evaluatedCount: String(currentRun.reactions.length),
      },
    });
    await persistRun();

    setStageStatus("divergence_report", "running", {
      summary: "Aggregating the evaluated personas into a final split report.",
    });
    await persistRun();

    const aggregation = await buildAggregation(
      currentRun.input,
      populationMap.segments,
      currentRun.contextPacks,
      currentRun.reactions,
      retrievalState.sources,
      { runId },
    );
    currentRun = {
      ...currentRun,
      status: "completed",
      aggregateReport: aggregation.report,
      rawModelDiagnostics: [...currentRun.rawModelDiagnostics, { stage: "divergence_report", ...aggregation.diagnostics }],
      error: undefined,
    };
    setStageStatus("divergence_report", "completed", {
      summary: "Final divergence report is ready.",
    });
    await persistRun();
    logLabRun(runId, "run-complete", {
      status: "completed",
      reactions: currentRun.reactions.length,
      contextPacks: currentRun.contextPacks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!currentRun) {
      currentRun = await readRun(runId).catch(() => null);
    }

    if (currentRun) {
      const now = new Date().toISOString();
      currentRun = {
        ...currentRun,
        status: "failed",
        error: message,
        steps: currentRun.steps.map((step) =>
          step.status === "running"
            ? {
                ...step,
                status: "failed",
                completedAt: now,
                error: message,
              }
            : step,
        ),
      };
      await persistRun();
      logLabRun(runId, "run-failed", {
        error: message,
      });
    } else {
      throw error;
    }
  }
}
