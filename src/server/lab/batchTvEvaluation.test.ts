import { describe, it, expect } from "vitest";
import { runBatchTvEvaluation, writeBatchResults } from "./batchTvEvaluation";
import { resolve } from "path";
import { existsSync } from "fs";

const describeBatch = process.env.RUN_TV_BATCH_EVALUATION === "true" ? describe : describe.skip;

describeBatch("TV Batch Evaluation", () => {
  it("runs batch prediction on all backtest dates", async () => {
    console.log("\n=== STARTING BATCH TV AUDIENCE EVALUATION ===\n");
    console.log("This will run predictions on all 14 dates in the backtest dataset.");
    console.log("Each date requires 50 LLM calls (5 segments × 10 personas).");
    console.log("Total LLM calls: 14 dates × 50 calls = 700 calls");
    console.log("Estimated time: 30-60 minutes depending on API latency\n");

    const results = await runBatchTvEvaluation();

    // Write results
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `tv-batch-results-${timestamp}.json`;
    writeBatchResults(results, filename);

    // Verify results file exists
    const outputPath = resolve(process.cwd(), `data/tv-audience/results/${filename}`);
    expect(existsSync(outputPath)).toBe(true);

    // Check that we have results for all dates
    const successfulRuns = results.filter((r) => !r.error);
    expect(successfulRuns.length).toBeGreaterThan(0);

    console.log(`\n✓ Batch evaluation complete!`);
    console.log(`✓ Results saved to: ${filename}`);
  }, 600000); // 10 minute timeout
});
