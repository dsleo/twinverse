#!/usr/bin/env node

/**
 * Standalone batch evaluation runner
 * Runs TV audience predictions on all dates in the backtest dataset
 * and writes results to data/tv-audience/results/
 */

const fs = require("fs");
const path = require("path");

// Simple CSV parser
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

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }

    rows.push(row);
  }

  return rows;
}

// Extract dates from CSV
function extractDates(csvPath) {
  const csv = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csv);

  const dates = new Set();
  rows.forEach((row) => {
    if (row.Date) dates.add(row.Date);
  });

  return Array.from(dates).sort();
}

// Get schedule for a date
function getScheduleForDate(csvPath, date) {
  const csv = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csv);

  const dateRows = rows.filter((row) => row.Date === date);

  return dateRows.map((row) => ({
    channel: row["Chaîne"],
    programName: row["Programme"],
    genre: row["Genre"],
    timeSlot: row["Heure"],
    durationMinutes: row["Durée"] ? parseInt(row["Durée"], 10) : null,
  }));
}

// Get actual data for a date
function getActualAudienceForDate(csvPath, date) {
  const csv = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csv);

  const dateRows = rows.filter((row) => row.Date === date);
  const actual = new Map();

  dateRows.forEach((row) => {
    const shareStr = row["Part d'audience"]
      .trim()
      .replace("%", "")
      .replace(",", ".");
    const share = parseFloat(shareStr);
    const rank = parseInt(row["Position"], 10);

    if (!isNaN(share)) {
      actual.set(row["Programme"].trim(), { share, rank });
    }
  });

  return actual;
}

// Calculate Spearman correlation
function calculateSpearmanRho(predictedRanks, actualRanks) {
  if (predictedRanks.length !== actualRanks.length || predictedRanks.length < 2) {
    return 0;
  }

  const diffs = predictedRanks.map((r, i) => r - actualRanks[i]);
  const sumSqDiff = diffs.reduce((sum, d) => sum + d * d, 0);

  const n = predictedRanks.length;
  const rho = 1 - (6 * sumSqDiff) / (n * (n * n - 1));

  return Math.round(rho * 10000) / 10000;
}

// Evaluate predictions against actual
function evaluatePredictions(predictions, schedule, csvPath, date) {
  const actual = getActualAudienceForDate(csvPath, date);

  if (actual.size === 0) {
    return null;
  }

  let sumAbsError = 0;
  let matchCount = 0;
  const perProgramDelta = [];

  for (const pred of predictions) {
    const actualData = actual.get(pred.programName);
    if (actualData) {
      const delta = pred.predictedSharePct - actualData.share;
      sumAbsError += Math.abs(delta);

      perProgramDelta.push({
        programName: pred.programName,
        predicted: Math.round(pred.predictedSharePct * 100) / 100,
        actual: Math.round(actualData.share * 100) / 100,
        delta: Math.round(delta * 100) / 100,
      });

      matchCount++;
    }
  }

  const mae = matchCount > 0 ? Math.round((sumAbsError / matchCount) * 100) / 100 : 0;

  // Spearman correlation
  const predByName = new Map(predictions.map((p) => [p.programName, p]));
  const predictedRanks = [];
  const actualRanks = [];

  for (const [programName, actualData] of actual.entries()) {
    const pred = predByName.get(programName);
    if (pred) {
      predictedRanks.push(pred.predictedRank);
      actualRanks.push(actualData.rank);
    }
  }

  const spearmanRho = calculateSpearmanRho(predictedRanks, actualRanks);

  // Top-1 hit
  const topPredicted = predictions[0]?.programName;
  const topActual = Array.from(actual.entries()).find(([_, data]) => data.rank === 1)?.[0];
  const top1Hit = topPredicted === topActual;

  return {
    date,
    mae,
    spearmanRho,
    top1Hit,
    perProgramDelta,
  };
}

// Main execution
async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   TV AUDIENCE PREDICTION — BATCH EVALUATION                ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const csvPath = path.resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("❌ CSV file not found:", csvPath);
    process.exit(1);
  }

  const dates = extractDates(csvPath);
  console.log(`📊 Dataset: ${dates.length} dates (${dates[0]} to ${dates[dates.length - 1]})`);
  console.log(`🎬 Dates: ${dates.join(", ")}\n`);

  console.log("⚠️  NOTE: This demo uses MOCK DATA for persona predictions.");
  console.log("   In a real run, the LLM would generate actual predictions.");
  console.log("   This is a proof-of-concept of the evaluation framework.\n");

  const results = [];
  const startTime = Date.now();

  for (const date of dates) {
    process.stdout.write(`📊 ${date}: `);

    try {
      const schedule = getScheduleForDate(csvPath, date);

      if (schedule.length === 0) {
        console.log("❌ No schedule found");
        continue;
      }

      // MOCK: Generate random predictions for demo
      // In real execution, these would come from LLM persona preferences
      const predictions = schedule.map((item, idx) => {
        const baseShare = Math.random() * 25 + 5; // 5-30%
        return {
          programName: item.programName,
          channel: item.channel,
          predictedSharePct: Math.round(baseShare * 100) / 100,
          predictedRank: idx + 1,
        };
      });

      // Sort by predicted share
      predictions.sort((a, b) => b.predictedSharePct - a.predictedSharePct);
      predictions.forEach((p, idx) => {
        p.predictedRank = idx + 1;
      });

      // Evaluate
      const evaluation = evaluatePredictions(predictions, schedule, csvPath, date);

      if (evaluation) {
        results.push({
          date,
          status: "OK",
          programCount: schedule.length,
          mae: evaluation.mae,
          spearmanRho: evaluation.spearmanRho,
          top1Hit: evaluation.top1Hit,
          predictions: predictions.slice(0, 5).map((p) => ({
            rank: p.predictedRank,
            program: p.programName,
            channel: p.channel,
            predicted: p.predictedSharePct,
          })),
          evaluation,
        });

        console.log(
          `✓ ${schedule.length} programs | MAE=${evaluation.mae}% | ρ=${evaluation.spearmanRho.toFixed(4)} | Top-1=${
            evaluation.top1Hit ? "✓" : "✗"
          }`,
        );
      } else {
        console.log("⚠️  No actual data");
      }
    } catch (error) {
      console.log(`✗ ${error.message}`);
      results.push({
        date,
        status: "ERROR",
        error: error.message,
      });
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Write results
  const outputDir = path.resolve(process.cwd(), "data/tv-audience/results");
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
    type: "batch_eval",
    generatedAt: new Date().toISOString(),
    elapsedSeconds: elapsed,
    note: "MOCK DATA - This demo uses simulated persona predictions. Real run uses LLM structured-output calls.",
    summary: {
      totalDates: dates.length,
      successfulRuns: successfulRuns.length,
      failedRuns: results.length - successfulRuns.length,
      averageMAE: Math.round(avgMae * 100) / 100,
      averageSpearmanRho: Math.round(avgRho * 10000) / 10000,
      top1HitRate: successfulRuns.length > 0 ? Math.round((top1Count / successfulRuns.length) * 10000) / 10000 : 0,
    },
    detailedTable: results.map((r) => ({
      date: r.date,
      status: r.status,
      programCount: r.programCount ?? null,
      mae: r.mae ?? null,
      spearmanRho: r.spearmanRho ?? null,
      top1Hit: r.top1Hit ?? null,
      error: r.error ?? null,
    })),
    results,
  };

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `batch-eval-${timestamp}.json`;
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

  console.log(`📋 TOP RESULTS BY DATE\n`);

  successfulRuns.slice(0, 5).forEach((result) => {
    console.log(`${result.date}:`);
    console.log(`  Top prediction: ${result.predictions[0]?.program} (${result.predictions[0]?.predicted}%)`);
    console.log(`  MAE: ${result.mae}% | ρ: ${result.spearmanRho} | Top-1: ${result.evaluation.top1Hit ? "✓" : "✗"}`);
    console.log();
  });

  console.log(`✅ To run with REAL LLM predictions, use:\n`);
  console.log(`   curl -X POST http://localhost:3000/api/lab/batch-eval\n`);
  console.log(`   or\n`);
  console.log(`   npx tsx scripts/demo-tv-eval.ts\n`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
