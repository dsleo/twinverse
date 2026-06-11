#!/usr/bin/env tsx

/**
 * Run TV audience batch evaluation on all backtest dates.
 * Usage: npx tsx scripts/batch-tv-eval.ts
 *
 * WARNING: This will make ~700 API calls (14 dates × 50 personas).
 * Estimated time: 30-60 minutes
 * Estimated cost: $20-30 at current GPT-4 prices
 */

import { resolve } from "path";

// Import the batch evaluation function
// Note: We need to set up module resolution for this
async function main() {
  try {
    // Use dynamic import to load the module at runtime
    const mod = await import("../src/server/lab/batchTvEvaluation");
    const { runBatchTvEvaluation, writeBatchResults } = mod;

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║   TV AUDIENCE PREDICTION — BATCH EVALUATION                ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("📊 Dataset: 14 dates (2026-05-25 to 2026-06-07)");
    console.log("👥 Panel: 50 personas (5 segments × 10 evaluated)");
    console.log("🎬 Programs: ~16-17 per date");
    console.log("📞 API calls: ~700 (14 dates × 50 personas)");
    console.log("⏱️  Estimated time: 30-60 minutes");
    console.log("💰 Estimated cost: $20-30\n");

    const startTime = Date.now();

    console.log("Starting batch evaluation...\n");
    const results = await runBatchTvEvaluation();

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n✓ Batch evaluation complete in ${elapsed}s\n`);

    // Write results
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `tv-batch-results-${timestamp}.json`;
    writeBatchResults(results, filename);

    console.log(`\n✓ Results written to: data/tv-audience/results/${filename}`);
  } catch (error) {
    console.error("❌ Batch evaluation failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
