import "server-only";

import { buildAggregation } from "./aggregation";
import { buildContextPacks } from "./contextPacks";
import { logLabRun, logLabStage, logLabTokenTotals } from "./logging";
import { createRunRecord, readRun, writeRun } from "./persistence";
import { loadPersonaSample } from "./personaSample";
import { approvedSegmentDesignResult, designPopulationSegments, mapPopulationToPanel } from "./populationMapping";
import { planSegmentResearch } from "./researchPlanner";
import { routeSourcesBySegment } from "./sourceRouting";
import { buildReactionsForSegment } from "./reactions";
import { retrieveSources } from "./retrieval";
import { executeTvAudienceRun } from "./tvPipeline";
import { addTokenUsage, createTokenTotals } from "./tokenAccounting";
import {
  type AudienceGuidance,
  type AudiencePreset,
  labInputSchema,
  type LabInput,
  type PersistedLabRun,
  type PopulationSegmentDesign,
  type PromptSource,
  type RunMode,
  type StageId,
} from "../../lib/labSchemas";

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
  audienceGuidance,
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
  const parsed = labInputSchema.parse(input);
  return createRunRecord({
    input: parsed,
    mode,
    audiencePreset,
    audienceGuidance,
    approvedSegmentDesign,
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

  const taskName = run.mode === "le_figaro_daily" ? "figaro" : "lab custom";
  const tokenTotals = createTokenTotals();
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
    setStageStatus("population_mapping", "running", {
      summary: "Defining audience segments and mapping the persona sample.",
    });
    await persistRun();

    const cache = await loadPersonaSample();
    const designed = currentRun.approvedSegmentDesign
      ? approvedSegmentDesignResult(currentRun.approvedSegmentDesign)
      : await designPopulationSegments(currentRun.input, cache, currentRun.audiencePreset, {
          runId,
          guidance: currentRun.audienceGuidance,
        });
    addTokenUsage(tokenTotals, designed.tokenUsage);
    setStageStatus("retrieval", "running", { summary: "Planning and collecting source signals for the defined segments." });
    await persistRun();
    const researchPlanTask = settleTask(
      planSegmentResearch(currentRun.input, designed.data.segments, { runId, guidance: currentRun.audienceGuidance }),
    );
    const mappingTask = settleTask(
      mapPopulationToPanel(currentRun.input, cache, currentRun.audiencePreset, {
        runId,
        design: designed,
        guidance: currentRun.audienceGuidance,
      }),
    );
    const planned = await researchPlanTask;
    if (!planned.ok) throw planned.error;
    addTokenUsage(tokenTotals, planned.value.tokenUsage);
    const retrievalTask = settleTask(retrieveSources(currentRun.input, planned.value.plan, { runId }));
    const mappingResult = await mappingTask;
    if (!mappingResult.ok) throw mappingResult.error;
    const mapped = mappingResult.value;
    currentRun = {
      ...currentRun,
      panelSampleVersion: cache.sampleVersion,
      panel: mapped.panel,
      populationMap: mapped.assignment,
      rawModelDiagnostics: [
        ...currentRun.rawModelDiagnostics,
        { stage: "population_mapping", ...mapped.diagnostics },
        { stage: "retrieval", ...planned.value.diagnostics },
      ],
    };
    setStageStatus("population_mapping", "completed", {
      summary: `Built 5 prompt-specific segments from ${cache.sampleSize} cached dataset personas.`,
      diagnostics: {
        panelSize: String(mapped.panel.length),
        sampleVersion: cache.sampleVersion,
        audiencePreset: currentRun.audiencePreset,
        guidanceMode: currentRun.audienceGuidance.mode,
        approvedDesign: String(Boolean(currentRun.approvedSegmentDesign)),
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
      summary: "Writing one batched context pack response for all derived segments.",
    });
    await persistRun();

    const personasBySegment = new Map(
      populationMap.segments.map((segment) => [
        segment.id,
        panel.filter((persona) => segment.representativePersonaIds.includes(persona.id)),
      ]),
    );
    const sourcesBySegment = routeSourcesBySegment(populationMap.segments, personasBySegment, retrievalState.sources, retrievalState.plan, { runId });
    const contextPackResults = await buildContextPacks(
      currentRun!.input,
      populationMap.segments,
      personasBySegment,
      sourcesBySegment,
      { runId },
    );
    addTokenUsage(tokenTotals, contextPackResults.tokenUsage);
    currentRun = {
      ...currentRun,
      contextPacks: contextPackResults.packs,
      rawModelDiagnostics: [
        ...currentRun.rawModelDiagnostics,
        { stage: "context_packs", ...contextPackResults.diagnostics },
      ],
    };
    setStageStatus("context_packs", "completed", {
      summary: `Built ${contextPackResults.packs.length} structured context packs in one model call.`,
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
        return buildReactionsForSegment(currentRun!.input, segment, personas, contextPack, sourcesBySegment.get(segment.id) ?? [], { runId });
      }),
    );
    for (const result of reactionResults) {
      addTokenUsage(tokenTotals, result.tokenUsage);
    }
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
    addTokenUsage(tokenTotals, aggregation.tokenUsage);
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
    logLabTokenTotals(runId, "run-token-summary", {
      calls: tokenTotals.calls,
      inputTokens: tokenTotals.inputTokens,
      outputTokens: tokenTotals.outputTokens,
      totalTokens: tokenTotals.totalTokens,
      estimatedCalls: tokenTotals.estimatedCalls,
    }, taskName);
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
      logLabTokenTotals(runId, "run-token-summary", {
        calls: tokenTotals.calls,
        inputTokens: tokenTotals.inputTokens,
        outputTokens: tokenTotals.outputTokens,
        totalTokens: tokenTotals.totalTokens,
        estimatedCalls: tokenTotals.estimatedCalls,
      }, taskName);
    } else {
      throw error;
    }
  }
}
