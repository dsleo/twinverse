

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { parseBacktestSchedule } from "./tvSchedule";
import { buildViewingPreferencesForSegment } from "./tvPreferences";
import { aggregateViewingChoices, evaluateAgainstActual } from "./tvAggregation";
import { loadPersonaSample } from "./personaSample";
import { mapPopulationToPanel } from "./populationMapping";
import type { NormalizedPersona } from "../../lib/labSchemas";

interface BatchResult {
  date: string;
  programCount: number;
  predictions: Array<{
    rank: number;
    channel: string;
    program: string;
    predicted: number;
    actual?: number;
    delta?: number;
  }>;
  evaluation?: {
    mae: number;
    spearmanRho: number;
    top1Hit: boolean;
    top3Hit: boolean;
  };
  error?: string;
}

/**
 * Run TV audience predictions on all dates in the backtest CSV.
 * Builds the panel once and reuses it across all dates.
 */
export async function runBatchTvEvaluation(): Promise<BatchResult[]> {
  console.log("[batch] Starting batch TV audience evaluation...");

  // Extract all unique dates
  const csvPath = resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");
  const csv = readFileSync(csvPath, "utf-8");
  const dates = extractUniqueDates(csv);
  dates.sort();

  console.log(`[batch] Found ${dates.length} unique dates: ${dates.join(", ")}`);

  // Build or load panel
  console.log("[batch] Loading/building panel...");
  const panel = await buildOrLoadPanel();
  console.log(`[batch] Panel ready: ${panel.length} personas`);

  // Run predictions for each date
  const results: BatchResult[] = [];
  for (const date of dates) {
    console.log(`[batch] Processing ${date}...`);
    try {
      const result = await runPredictionForDate(date, panel);
      results.push(result);
      console.log(
        `[batch]   ✓ ${date}: MAE=${result.evaluation?.mae.toFixed(2)}%, Top-1=${result.evaluation?.top1Hit ? "✓" : "✗"}`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({
        date,
        programCount: 0,
        predictions: [],
        error: errorMsg,
      });
      console.error(`[batch]   ✗ ${date}: ${errorMsg}`);
    }
  }

  return results;
}

/**
 * Extract unique dates from the CSV.
 */
function extractUniqueDates(csv: string): string[] {
  const lines = csv.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  const dateIndex = headers.indexOf("Date");

  if (dateIndex < 0) {
    throw new Error("Date column not found in CSV");
  }

  const dates = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values[dateIndex]) {
      dates.add(values[dateIndex]);
    }
  }

  return Array.from(dates);
}

/**
 * Parse a CSV line, handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Build or load the fixed TV viewer panel.
 */
async function buildOrLoadPanel(): Promise<NormalizedPersona[]> {
  const panelPath = resolve(process.cwd(), "data/panels/france-tv-viewer.json");

  if (existsSync(panelPath)) {
    const panelData = JSON.parse(readFileSync(panelPath, "utf-8"));
    return panelData.panel;
  }

  console.log("[batch] Building panel (first run)...");
  const cache = await loadPersonaSample();
  const mapped = await mapPopulationToPanel(
    { rawInput: "French evening TV viewer", inputType: "poll_question" },
    cache,
    "france_tv_viewer",
  );

  const panelDir = resolve(process.cwd(), "data/panels");
  mkdirSync(panelDir, { recursive: true });

  const panelData = {
    preset: "france_tv_viewer",
    builtAt: new Date().toISOString(),
    sampleVersion: cache.sampleVersion,
    panelSize: mapped.panel.length,
    panel: mapped.panel,
    assignment: mapped.assignment,
  };

  writeFileSync(panelPath, JSON.stringify(panelData, null, 2));
  return mapped.panel;
}

/**
 * Run prediction for a single date.
 */
async function runPredictionForDate(date: string, panel: NormalizedPersona[]): Promise<BatchResult> {
  const schedule = parseBacktestSchedule(date);

  if (schedule.length === 0) {
    throw new Error(`No schedule found for ${date}`);
  }

  // Process full panel in a single call
  console.log(`[batch] ${date}: Processing full panel of ${panel.length} personas...`);
  const result = await buildViewingPreferencesForSegment(
    {
      id: "full_panel",
      label: "Full Panel",
      summary: `All ${panel.length} panel personas for TV viewing preferences`,
      concerns: ["TV viewing behavior"],
      informationNeeds: ["Program schedule"],
      inclusionTags: [],
      exclusionTags: [],
      rankingCriteria: ["Viewing preferences"],
      preferredDiversityHints: [],
      rankingSignals: [],
      memberPersonaIds: panel.map((p: NormalizedPersona) => p.id),
      representativePersonaIds: panel.slice(0, 3).map((p: NormalizedPersona) => p.id),
      evaluatedPersonaIds: panel.slice(0, 2).map((p: NormalizedPersona) => p.id),
    },
    panel,
    schedule,
  );

  const viewingChoices = result.choices;

  // Aggregate
  const predictions = aggregateViewingChoices(viewingChoices, schedule);

  // Evaluate
  let evaluation;
  try {
    const evalResult = evaluateAgainstActual(date, predictions);
    evaluation = {
      mae: evalResult.mae,
      spearmanRho: evalResult.spearmanRho,
      top1Hit: evalResult.top1Hit,
      top3Hit: evalResult.top3Hit,
    };
  } catch (error) {
    console.warn(`[batch] Could not evaluate ${date}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    date,
    programCount: schedule.length,
    predictions: predictions.map((pred) => ({
      rank: pred.predictedRank,
      channel: pred.channel,
      program: pred.programName,
      predicted: Math.round(pred.predictedSharePct * 100) / 100,
    })),
    evaluation,
  };
}

/**
 * Write batch results to a file with comprehensive statistics.
 */
export function writeBatchResults(results: BatchResult[], outputPath: string): void {
  const outputDir = resolve(process.cwd(), "data/tv-audience/results");
  mkdirSync(outputDir, { recursive: true });

  const fullPath = resolve(outputDir, outputPath);

  // Build summary statistics
  const completedRuns = results.filter((r) => r.evaluation);
  const avgMae = completedRuns.length > 0 ? completedRuns.reduce((sum, r) => sum + (r.evaluation?.mae ?? 0), 0) / completedRuns.length : 0;
  const avgRho = completedRuns.length > 0 ? completedRuns.reduce((sum, r) => sum + (r.evaluation?.spearmanRho ?? 0), 0) / completedRuns.length : 0;
  const top1HitCount = completedRuns.filter((r) => r.evaluation?.top1Hit).length;

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalDates: results.length,
      successfulRuns: completedRuns.length,
      failedRuns: results.length - completedRuns.length,
      averageMAE: Math.round(avgMae * 100) / 100,
      averageSpearmanRho: Math.round(avgRho * 10000) / 10000,
      top1HitRate: Math.round((top1HitCount / completedRuns.length) * 10000) / 10000,
    },
    dateResults: results,
    detailedTable: results.map((r) => ({
      date: r.date,
      status: r.error ? "FAILED" : "OK",
      programCount: r.programCount,
      mae: r.evaluation?.mae ?? null,
      spearmanRho: r.evaluation?.spearmanRho ?? null,
      top1Hit: r.evaluation?.top1Hit ?? null,
      error: r.error ?? null,
    })),
  };

  writeFileSync(fullPath, JSON.stringify(report, null, 2));
  console.log(`\n✓ Results written to ${fullPath}`);
  console.log(`\n=== BATCH EVALUATION SUMMARY ===`);
  console.log(`Total dates: ${report.summary.totalDates}`);
  console.log(`Successful: ${report.summary.successfulRuns}`);
  console.log(`Failed: ${report.summary.failedRuns}`);
  console.log(`Average MAE: ${report.summary.averageMAE.toFixed(2)}%`);
  console.log(`Average Spearman ρ: ${report.summary.averageSpearmanRho.toFixed(4)}`);
  console.log(`Top-1 hit rate: ${(report.summary.top1HitRate * 100).toFixed(1)}%`);
}
