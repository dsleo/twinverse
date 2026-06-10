#!/usr/bin/env node

/**
 * Demo: Run TV audience prediction on 2 dates to test the system.
 * This is a lightweight version of the full batch evaluation.
 *
 * Usage: npx tsx scripts/demo-tv-eval.ts
 *
 * Cost: ~$1-2 (100 LLM calls: 2 dates × 50 personas)
 * Time: ~5-10 minutes
 */

import { resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { parseBacktestSchedule } from "../src/server/lab/tvSchedule";
import { buildViewingPreferencesForSegment } from "../src/server/lab/tvPreferences";
import { aggregateViewingChoices, evaluateAgainstActual } from "../src/server/lab/tvAggregation";
import { loadPersonaSample } from "../src/server/lab/personaSample";
import { mapPopulationToPanel } from "../src/server/lab/populationMapping";
import type { NormalizedPersona } from "../src/lib/labSchemas";

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║   TV AUDIENCE PREDICTION — DEMO (2 DATES)                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const demoDates = ["2026-06-06", "2026-06-07"];

  console.log(`🎯 Running demo on ${demoDates.length} dates: ${demoDates.join(", ")}`);
  console.log(`👥 Panel: 50 personas (cached and reused)`);
  console.log(`📞 API calls: ~100 (${demoDates.length} dates × 50 personas)`);
  console.log(`⏱️  Estimated time: 5-10 minutes\n`);

  const startTime = Date.now();

  // Build or load panel
  console.log("📦 Loading/building panel...");
  const panelPath = resolve(process.cwd(), "data/panels/france-tv-viewer.json");
  let panel: NormalizedPersona[];

  if (existsSync(panelPath)) {
    const panelData = JSON.parse(readFileSync(panelPath, "utf-8"));
    panel = panelData.panel;
    console.log(`   ✓ Loaded cached panel (${panel.length} personas)\n`);
  } else {
    console.log("   Building panel (first time)...");
    const cache = await loadPersonaSample();
    const mapped = await mapPopulationToPanel(
      { rawInput: "French evening TV viewer", inputType: "poll_question" },
      cache,
      "france_tv_viewer",
    );

    panel = mapped.panel;
    const panelDir = resolve(process.cwd(), "data/panels");
    mkdirSync(panelDir, { recursive: true });

    const panelData = {
      preset: "france_tv_viewer",
      builtAt: new Date().toISOString(),
      sampleVersion: cache.sampleVersion,
      panelSize: panel.length,
      panel,
      assignment: mapped.assignment,
    };

    writeFileSync(panelPath, JSON.stringify(panelData, null, 2));
    console.log(`   ✓ Built and cached panel (${panel.length} personas)\n`);
  }

  // Run predictions
  const results: any[] = [];

  for (const date of demoDates) {
    console.log(`📊 Processing ${date}...`);

    try {
      const schedule = parseBacktestSchedule(date);
      console.log(`   ✓ Loaded schedule (${schedule.length} programs)`);

      // Batch personas into 5 segments
      const segmentSize = Math.ceil(panel.length / 5);
      const viewingChoices: any[] = [];

      for (let i = 0; i < 5; i++) {
        const start = i * segmentSize;
        const end = Math.min(start + segmentSize, panel.length);
        const segmentPersonas = panel.slice(start, end);

        const { choices } = await buildViewingPreferencesForSegment(
          {
            id: `segment_${i}`,
            label: `Group ${i + 1}`,
            summary: `Personas ${start + 1}-${end}`,
            concerns: ["TV viewing"],
            informationNeeds: ["Schedule"],
            inclusionTags: [],
            exclusionTags: [],
            rankingCriteria: ["Preferences"],
            preferredDiversityHints: [],
            rankingSignals: [],
            memberPersonaIds: segmentPersonas.map((p: NormalizedPersona) => p.id),
            representativePersonaIds: segmentPersonas.slice(0, 3).map((p: NormalizedPersona) => p.id),
            evaluatedPersonaIds: segmentPersonas.slice(0, 2).map((p: NormalizedPersona) => p.id),
          },
          segmentPersonas,
          schedule,
        );

        viewingChoices.push(...choices);
      }

      console.log(`   ✓ Elicited preferences (${viewingChoices.length} personas)`);

      // Aggregate
      const predictions = aggregateViewingChoices(viewingChoices, schedule);
      console.log(`   ✓ Aggregated predictions (${predictions.length} programs)`);

      // Evaluate
      try {
        const evaluation = evaluateAgainstActual(date, predictions);
        results.push({
          date,
          status: "success",
          programCount: schedule.length,
          predictions: predictions.slice(0, 5).map((p) => ({
            rank: p.predictedRank,
            program: p.programName,
            channel: p.channel,
            predicted: Math.round(p.predictedSharePct * 100) / 100,
          })),
          evaluation: {
            mae: Math.round(evaluation.mae * 100) / 100,
            spearmanRho: Math.round(evaluation.spearmanRho * 10000) / 10000,
            top1Hit: evaluation.top1Hit,
          },
        });

        console.log(
          `   ✓ Evaluation: MAE=${evaluation.mae.toFixed(2)}%, ρ=${evaluation.spearmanRho.toFixed(4)}, Top-1=${evaluation.top1Hit ? "✓" : "✗"}\n`,
        );
      } catch (evalError) {
        results.push({
          date,
          status: "success_no_eval",
          error: evalError instanceof Error ? evalError.message : String(evalError),
        });
        console.log(`   ⚠️  Could not evaluate\n`);
      }
    } catch (error) {
      results.push({
        date,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`   ✗ Failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Write results file
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `demo-tv-results-${timestamp}.json`;
  const outputDir = resolve(process.cwd(), "data/tv-audience/results");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, filename);

  const report = {
    type: "demo",
    generatedAt: new Date().toISOString(),
    elapsedSeconds: elapsed,
    dates: demoDates,
    results,
    summary: {
      totalDates: demoDates.length,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
    },
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`╔════════════════════════════════════════════════════════════╗`);
  console.log(`║   DEMO COMPLETE                                            ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);
  console.log(`✓ Completed in ${elapsed}s`);
  console.log(`✓ Results: ${filename}`);
  console.log(`\n📊 Sample Results:\n`);

  results.forEach((result) => {
    if (result.status === "success") {
      console.log(`${result.date}:`);
      console.log(`  Top prediction: ${result.predictions[0]?.program} (${result.predictions[0]?.predicted}%)`);
      console.log(`  MAE: ${result.evaluation.mae}%`);
      console.log(`  Spearman ρ: ${result.evaluation.spearmanRho}`);
      console.log(`  Top-1 hit: ${result.evaluation.top1Hit ? "✓" : "✗"}\n`);
    }
  });

  console.log(`To run on ALL dates, use the full batch evaluation:`);
  console.log(`  curl -X POST http://localhost:3000/api/lab/batch-eval\n`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
