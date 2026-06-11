import { NextResponse } from "next/server";
import { runBatchTvEvaluation, writeBatchResults } from "../../../../server/lab/batchTvEvaluation";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 minute timeout

/**
 * POST /api/lab/batch-eval
 *
 * Trigger batch TV audience evaluation on all backtest dates.
 * This will make ~700 LLM API calls and take 30-60 minutes.
 *
 * Response includes summary stats and per-date results.
 */
export async function POST(request: Request) {
  try {
    console.log("[batch-eval] Starting batch evaluation...");

    const results = await runBatchTvEvaluation();

    // Write to file
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `tv-batch-results-${timestamp}.json`;
    writeBatchResults(results, filename);

    // Build summary
    const completedRuns = results.filter((r) => !r.error);
    const avgMae =
      completedRuns.length > 0 ? completedRuns.reduce((sum, r) => sum + (r.evaluation?.mae ?? 0), 0) / completedRuns.length : 0;
    const avgRho =
      completedRuns.length > 0 ? completedRuns.reduce((sum, r) => sum + (r.evaluation?.spearmanRho ?? 0), 0) / completedRuns.length : 0;
    const top1HitCount = completedRuns.filter((r) => r.evaluation?.top1Hit).length;

    return NextResponse.json(
      {
        status: "complete",
        resultsFile: filename,
        summary: {
          totalDates: results.length,
          successfulRuns: completedRuns.length,
          failedRuns: results.length - completedRuns.length,
          averageMAE: Math.round(avgMae * 100) / 100,
          averageSpearmanRho: Math.round(avgRho * 10000) / 10000,
          top1HitRate: Math.round((top1HitCount / completedRuns.length) * 10000) / 10000,
        },
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[batch-eval] Error:", error);

    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
