import "server-only";

import { createRunRecord, readRun, writeRun } from "./persistence";
import { loadPersonaSample } from "./personaSample";
import { mapPopulationToPanel } from "./populationMapping";
import { parseBacktestSchedule } from "./tvSchedule";
import { buildViewingPreferencesForSegment } from "./tvPreferences";
import { aggregateViewingChoices, evaluateAgainstActual } from "./tvAggregation";
import type { AudiencePreset, LabInput, NormalizedPersona, PersistedLabRun, RunMode, StageId } from "../../lib/labSchemas";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type SettledTask<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settleTask<T>(task: Promise<T>): Promise<SettledTask<T>> {
  return task.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

export async function createTvAudienceRun({
  input,
  audiencePreset,
  promptSnapshot,
  date,
}: {
  input: LabInput;
  audiencePreset: AudiencePreset;
  promptSnapshot: string;
  date: string;
}) {
  return createRunRecord({
    input: { ...input, date },
    mode: "tv_audience_daily",
    audiencePreset,
    promptSnapshot,
  });
}

/**
 * Execute the TV audience prediction pipeline for a given run ID.
 * Stages: schedule_ingestion → panel_loading → preference_elicitation → vote_aggregation → evaluation
 */
export async function executeTvAudienceRun(runId: string) {
  let currentRun: PersistedLabRun | null = null;

  const persistRun = async () => {
    if (!currentRun) {
      throw new Error("Run state is not initialized.");
    }
    await writeRun(currentRun);
  };

  const setStageStatus = (
    stageId: StageId,
    status: "running" | "completed" | "failed",
    options?: {
      summary?: string;
      error?: string;
      diagnostics?: Record<string, string>;
    },
  ) => {
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
  };

  try {
    currentRun = await readRun(runId);

    if (!currentRun.input.date) {
      throw new Error("TV audience run missing required date field");
    }

    const date = currentRun.input.date;

    // Stage 1: Schedule ingestion
    setStageStatus("tv_schedule_ingestion", "running", {
      summary: "Ingesting TV schedule for date and stripping leaky columns.",
    });
    await persistRun();

    const schedule = parseBacktestSchedule(date);
    if (schedule.length === 0) {
      throw new Error(`No TV schedule found for date ${date}`);
    }

    currentRun = {
      ...currentRun,
      tvSchedule: schedule,
    };

    setStageStatus("tv_schedule_ingestion", "completed", {
      summary: `Ingested ${schedule.length} TV programs for ${date}.`,
      diagnostics: {
        programCount: String(schedule.length),
        date,
      },
    });
    await persistRun();

    // Stage 2: Panel loading
    setStageStatus("tv_panel_loading", "running", {
      summary: "Loading fixed TV viewer panel.",
    });
    await persistRun();

    const panelPath = resolve(process.cwd(), "data/panels/france-tv-viewer.json");
    let panel;
    let panelSource = "cache";

    if (existsSync(panelPath)) {
      // Load cached panel
      const panelData = JSON.parse(readFileSync(panelPath, "utf-8"));
      panel = panelData.panel;
    } else {
      // Build panel once and cache it
      panelSource = "generated";
      const cache = await loadPersonaSample();
      const mapped = await mapPopulationToPanel(
        { rawInput: "French evening TV viewer", inputType: "poll_question" },
        cache,
        "france_tv_viewer",
      );

      panel = mapped.panel;

      // Save panel for reuse
      const panelData = {
        preset: "france_tv_viewer",
        builtAt: new Date().toISOString(),
        sampleVersion: cache.sampleVersion,
        panelSize: panel.length,
        panel,
        assignment: mapped.assignment,
      };
      writeFileSync(panelPath, JSON.stringify(panelData, null, 2));
    }

    if (panel.length !== 50) {
      console.warn(`TV viewer panel has ${panel.length} personas, expected 50. Proceeding anyway.`);
    }

    currentRun = {
      ...currentRun,
      panel,
      panelSampleVersion: "tv-fixed-panel",
    };

    setStageStatus("tv_panel_loading", "completed", {
      summary: `Loaded fixed TV viewer panel (${panel.length} personas).`,
      diagnostics: {
        source: panelSource,
        panelSize: String(panel.length),
      },
    });
    await persistRun();

    // Stage 3: Preference elicitation
    setStageStatus("tv_preference_elicitation", "running", {
      summary: "Eliciting viewing preferences from all personas.",
    });
    await persistRun();

    // Build segments from the assignment (if available) or create ad-hoc segments
    // For simplicity, we'll batch personas into 5 equal segments
    const segmentSize = Math.ceil(panel.length / 5);
    const segments = [];
    for (let i = 0; i < 5; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize, panel.length);
      segments.push(panel.slice(start, end));
    }

    const segmentResults = await Promise.allSettled(
      segments.map((segmentPersonas, i) => {
        const segmentId = `tv_segment_${i}`;
        return buildViewingPreferencesForSegment(
          {
            id: segmentId,
            label: `TV Viewer Group ${i + 1}`,
            summary: `Personas ${i * segmentSize + 1}-${Math.min((i + 1) * segmentSize, panel.length)}`,
            concerns: ["TV viewing behavior"],
            informationNeeds: ["Program schedule and details"],
            inclusionTags: [],
            exclusionTags: [],
            rankingCriteria: ["Personal viewing preferences"],
            preferredDiversityHints: [],
            rankingSignals: [],
            memberPersonaIds: segmentPersonas.map((p: NormalizedPersona) => p.id),
            representativePersonaIds: segmentPersonas.slice(0, 3).map((p: NormalizedPersona) => p.id),
            evaluatedPersonaIds: segmentPersonas.slice(0, 2).map((p: NormalizedPersona) => p.id),
          },
          segmentPersonas,
          schedule,
        );
      })
    );

    const viewingChoices: typeof currentRun.tvViewingChoices = [];
    const failedSegments: number[] = [];

    segmentResults.forEach((result, i) => {
      if (result.status === "fulfilled") {
        viewingChoices.push(...result.value.choices);
      } else {
        failedSegments.push(i);
        console.warn(`[tv-pipeline] Segment ${i} failed: ${result.reason}`);
      }
    });

    if (viewingChoices.length === 0) {
      throw new Error(`All viewing preference segments failed for ${date}`);
    }

    if (failedSegments.length > 0) {
      console.warn(
        `[tv-pipeline] ${date} evaluated with ${viewingChoices.length}/${panel.length} personas ` +
        `(segments [${failedSegments.join(", ")}] failed)`,
      );
    }

    currentRun = {
      ...currentRun,
      tvViewingChoices: viewingChoices,
    };

    setStageStatus("tv_preference_elicitation", "completed", {
      summary: `Elicited viewing preferences from ${viewingChoices.length} personas.`,
      diagnostics: {
        segmentsProcessed: `${segmentResults.length - failedSegments.length}`,
        totalPersonas: `${viewingChoices.length}`,
        failedSegments: failedSegments.length > 0 ? failedSegments.join(",") : "none",
      },
    });
    await persistRun();

    // Stage 4: Vote aggregation
    setStageStatus("tv_vote_aggregation", "running", {
      summary: "Aggregating persona preferences into predicted shares.",
    });
    await persistRun();

    const predictions = aggregateViewingChoices(viewingChoices, schedule);

    currentRun = {
      ...currentRun,
      tvPredictions: predictions,
    };

    setStageStatus("tv_vote_aggregation", "completed", {
      summary: `Aggregated preferences into ${predictions.length} program predictions.`,
      diagnostics: {
        topProgram: predictions[0]?.programName ?? "N/A",
        topShare: predictions[0] ? `${predictions[0].predictedSharePct.toFixed(2)}%` : "N/A",
      },
    });
    await persistRun();

    // Stage 5: Evaluation
    setStageStatus("tv_evaluation", "running", {
      summary: "Evaluating predictions against actual audience data.",
    });
    await persistRun();

    try {
      const evaluation = evaluateAgainstActual(date, predictions);
      currentRun = {
        ...currentRun,
        tvEvaluation: evaluation,
      };

      setStageStatus("tv_evaluation", "completed", {
        summary: `Evaluation complete. MAE: ${evaluation.mae.toFixed(2)}%, Spearman ρ: ${evaluation.spearmanRho.toFixed(4)}, Top-1 hit: ${evaluation.top1Hit ? "✓" : "✗"}`,
        diagnostics: {
          mae: evaluation.mae.toFixed(2),
          spearmanRho: evaluation.spearmanRho.toFixed(4),
          top1Hit: evaluation.top1Hit ? "yes" : "no",
        },
      });
    } catch (error) {
      // Evaluation is optional if actual data is unavailable
      setStageStatus("tv_evaluation", "completed", {
        summary: `Evaluation skipped: ${error instanceof Error ? error.message : "Unknown error"}`,
        diagnostics: {
          evaluationAvailable: "false",
        },
      });
    }

    currentRun = {
      ...currentRun,
      status: "completed",
    };
    await persistRun();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[tv-pipeline] Execution failed for ${runId}:`, error);

    if (currentRun) {
      const failedStage = currentRun.steps.find((step) => step.status === "running");
      if (failedStage) {
        setStageStatus(failedStage.id, "failed", { error: errorMsg });
      }

      currentRun = {
        ...currentRun,
        status: "failed",
        error: errorMsg,
      };
      await persistRun();
    }

    throw error;
  }
}
