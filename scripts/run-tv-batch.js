#!/usr/bin/env node

/**
 * Run TV audience batch evaluation on all backtest dates.
 * Usage: node scripts/run-tv-batch.js
 */

const { execSync } = require("child_process");
const { resolve } = require("path");

// Build the project first
console.log("Building TypeScript...");
try {
  execSync("npm run build", { stdio: "inherit" });
} catch (e) {
  console.error("Build failed");
  process.exit(1);
}

// Create a simple Node script to run the batch evaluation
const testScript = `
const { runBatchTvEvaluation, writeBatchResults } = require("./dist/server/lib/batchTvEvaluation.js");

(async () => {
  try {
    console.log("[batch] Starting TV audience batch evaluation...");
    const results = await runBatchTvEvaluation();
    writeBatchResults(results, "batch-evaluation-${new Date().toISOString().split("T")[0]}.json");
    console.log("[batch] ✓ Complete!");
  } catch (error) {
    console.error("[batch] Failed:", error);
    process.exit(1);
  }
})();
`;

// Write and execute
const fs = require("fs");
const scriptPath = resolve(__dirname, "temp-batch-runner.js");
fs.writeFileSync(scriptPath, testScript);

console.log("\nRunning batch evaluation (this will take a while)...\n");

try {
  execSync(`node ${scriptPath}`, { stdio: "inherit", cwd: resolve(__dirname, "..") });
} finally {
  fs.unlinkSync(scriptPath);
}
