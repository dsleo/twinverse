#!/usr/bin/env node

/**
 * Real TV Audience Batch Evaluation
 * Uses actual LLM persona predictions (not mock data)
 *
 * This will:
 * - Parse TV schedules from CSV for all 14 dates
 * - Load or build the 50-persona panel
 * - Call LLM 50 times per date (5 segments × 10 personas)
 * - Generate probability distributions for each persona
 * - Aggregate into predicted market share %
 * - Compare against actual audience data
 * - Write comprehensive results to JSON
 *
 * WARNING: ~700 API calls, ~30-60 minutes, ~$20-30 cost
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// We'll use dynamic imports to load the compiled modules
let parseBacktestSchedule, buildViewingPreferencesForSegment, aggregateViewingChoices, evaluateAgainstActual,
    loadPersonaSample, mapPopulationToPanel;

async function initializeModules() {
  console.log("Loading modules...\n");

  try {
    const tvSchedule = await import("./dist/server/lab/tvSchedule.js");
    parseBacktestSchedule = tvSchedule.parseBacktestSchedule;

    const tvPreferences = await import("./dist/server/lab/tvPreferences.js");
    buildViewingPreferencesForSegment = tvPreferences.buildViewingPreferencesForSegment;

    const tvAgg = await import("./dist/server/lab/tvAggregation.js");
    aggregateViewingChoices = tvAgg.aggregateViewingChoices;
    evaluateAgainstActual = tvAgg.evaluateAgainstActual;

    const personaSample = await import("./dist/server/lab/personaSample.js");
    loadPersonaSample = personaSample.loadPersonaSample;

    const popMapping = await import("./dist/server/lab/populationMapping.js");
    mapPopulationToPanel = popMapping.mapPopulationToPanel;

    console.log("✓ All modules loaded\n");
  } catch (error) {
    console.error("❌ Failed to load modules:", error.message);
    process.exit(1);
  }
}

function parseCSVLine(line) {
  const result = [];
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

function extractDates(csvPath) {
  const csv = fs.readFileSync(csvPath, "utf-8");
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const dates = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }

    if (row.Date) dates.add(row.Date);
  }

  return Array.from(dates).sort();
}

async function buildOrLoadPanel() {
  const panelPath = path.resolve(__dirname, "data/panels/france-tv-viewer.json");

  if (fs.existsSync(panelPath)) {
    const panelData = JSON.parse(fs.readFileSync(panelPath, "utf-8"));
    console.log(`✓ Loaded cached panel (${panelData.panel.length} personas)\n`);
    return panelData.panel;
  }

  console.log("Building panel (first time)...");
  try {
    const cache = await loadPersonaSample();
    console.log(`✓ Loaded ${cache.sampleSize} personas from cache`);

    const mapped = await mapPopulationToPanel(
      { rawInput: "French evening TV viewer", inputType: "poll_question" },
      cache,
      "france_tv_viewer",
    );

    console.log(`✓ Built 5 segments, selected ${mapped.panel.length} panel personas`);

    const panelDir = path.resolve(__dirname, "data/panels");
    if (!fs.existsSync(panelDir)) {
      fs.mkdirSync(panelDir, { recursive: true });
    }

    const panelData = {
      preset: "france_tv_viewer",
      builtAt: new Date().toISOString(),
      sampleVersion: cache.sampleVersion,
      panelSize: mapped.panel.length,
      panel: mapped.panel,
      assignment: mapped.assignment,
    };

    fs.writeFileSync(panelPath, JSON.stringify(panelData, null, 2));
    console.log(`✓ Cached panel to ${panelPath}\n`);

    return mapped.panel;
  } catch (error) {
    console.error("❌ Failed to build panel:", error.message);
    throw error;
  }
}

async function runPredictionForDate(date, schedule, panel) {
  const segmentSize = Math.ceil(panel.length / 5);
  const viewingChoices = [];

  for (let i = 0; i < 5; i++) {
    const start = i * segmentSize;
    const end = Math.min(start + segmentSize, panel.length);
    const segmentPersonas = panel.slice(start, end);
    const segmentId = `batch_segment_${i}`;

    try {
      const { choices } = await buildViewingPreferencesForSegment(
        {
          id: segmentId,
          label: `Segment ${i + 1}`,
          summary: `Personas ${start + 1}-${end}`,
          concerns: ["TV viewing behavior"],
          informationNeeds: ["Program schedule and details"],
          inclusionTags: [],
          exclusionTags: [],
          rankingCriteria: ["Viewing preferences"],
          preferredDiversityHints: [],
          rankingSignals: [],
          memberPersonaIds: segmentPersonas.map(p => p.id),
          representativePersonaIds: segmentPersonas.slice(0, 3).map(p => p.id),
          evaluatedPersonaIds: segmentPersonas.slice(0, 2).map(p => p.id),
        },
        segmentPersonas,
        schedule,
      );

      viewingChoices.push(...choices);
      process.stdout.write(".");
    } catch (error) {
      throw new Error(`Segment ${i} failed: ${error.message}`);
    }
  }

  // Aggregate
  const predictions = aggregateViewingChoices(viewingChoices, schedule);

  // Evaluate
  try {
    const evaluation = evaluateAgainstActual(date, predictions);
    return {
      status: "OK",
      predictions,
      evaluation,
    };
  } catch (error) {
    return {
      status: "NO_EVAL",
      predictions,
      error: error.message,
    };
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   TV AUDIENCE PREDICTION — REAL BATCH EVALUATION           ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  await initializeModules();

  const csvPath = path.resolve(__dirname, "data/tv-audience/audiences_figaro_2_weeks.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("❌ CSV file not found:", csvPath);
    process.exit(1);
  }

  const dates = extractDates(csvPath);
  console.log(`📊 Dataset: ${dates.length} dates`);
  console.log(`📞 API calls: ~${dates.length * 50} (${dates.length} dates × 50 personas/date)`);
  console.log(`⏱️  Estimated time: 30-60 minutes`);
  console.log(`💰 Estimated cost: $20-30\n`);

  // Build or load panel
  console.log("📦 Panel Setup");
  console.log("─".repeat(60));
  const panel = await buildOrLoadPanel();

  const results = [];
  const startTime = Date.now();

  console.log("📊 Running Predictions");
  console.log("─".repeat(60));

  for (const date of dates) {
    process.stdout.write(`${date}: `);

    try {
      const schedule = parseBacktestSchedule(date);

      if (schedule.length === 0) {
        console.log("❌ No schedule");
        continue;
      }

      const result = await runPredictionForDate(date, schedule, panel);

      if (result.status === "OK" && result.evaluation) {
        console.log(
          ` ✓ MAE=${result.evaluation.mae.toFixed(2)}% | ρ=${result.evaluation.spearmanRho.toFixed(4)} | Top-1=${
            result.evaluation.top1Hit ? "✓" : "✗"
          }`,
        );

        results.push({
          date,
          status: "OK",
          programCount: schedule.length,
          mae: result.evaluation.mae,
          spearmanRho: result.evaluation.spearmanRho,
          top1Hit: result.evaluation.top1Hit,
          predictions: result.predictions.slice(0, 5).map((p) => ({
            rank: p.predictedRank,
            program: p.programName,
            channel: p.channel,
            predicted: p.predictedSharePct,
          })),
          evaluation: result.evaluation,
        });
      } else {
        console.log(` ⚠️  No evaluation available`);
        results.push({
          date,
          status: "OK_NO_EVAL",
          programCount: schedule.length,
          predictions: result.predictions.slice(0, 5),
        });
      }
    } catch (error) {
      console.log(` ❌ ${error.message}`);
      results.push({
        date,
        status: "ERROR",
        error: error.message,
      });
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Write results
  const outputDir = path.resolve(__dirname, "data/tv-audience/results");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const successfulRuns = results.filter((r) => r.status === "OK");
  const avgMae =
    successfulRuns.length > 0 ? successfulRuns.reduce((sum, r) => sum + r.mae, 0) / successfulRuns.length : 0;
  const avgRho =
    successfulRuns.length > 0 ? successfulRuns.reduce((sum, r) => sum + r.spearmanRho, 0) / successfulRuns.length : 0;
  const top1Count = successfulRuns.filter((r) => r.top1Hit).length;

  const report = {
    type: "batch_eval_real",
    generatedAt: new Date().toISOString(),
    elapsedSeconds: elapsed,
    panelSize: panel.length,
    totalAPICallsEstimated: dates.length * 50,
    summary: {
      totalDates: dates.length,
      successfulRuns: successfulRuns.length,
      failedRuns: results.length - successfulRuns.length,
      averageMAE: Math.round(avgMae * 100) / 100,
      averageSpearmanRho: Math.round(avgRho * 10000) / 10000,
      top1HitRate: successfulRuns.length > 0 ? Math.round((top1Count / successfulRuns.length) * 10000) / 10000 : 0,
    },
    results,
  };

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `batch-eval-real-${timestamp}.json`;
  const outputPath = path.resolve(outputDir, filename);

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║   BATCH EVALUATION COMPLETE                                 ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  console.log(`⏱️  Elapsed: ${elapsed}s`);
  console.log(`✓ Results: data/tv-audience/results/${filename}\n`);

  console.log(`📊 SUMMARY`);
  console.log(`├─ Total dates: ${report.summary.totalDates}`);
  console.log(`├─ Successful runs: ${report.summary.successfulRuns}`);
  console.log(`├─ Failed runs: ${report.summary.failedRuns}`);
  console.log(`├─ Average MAE: ${report.summary.averageMAE}%`);
  console.log(`├─ Average Spearman ρ: ${report.summary.averageSpearmanRho}`);
  console.log(`└─ Top-1 hit rate: ${(report.summary.top1HitRate * 100).toFixed(1)}%\n`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
