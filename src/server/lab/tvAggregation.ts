import "server-only";

import { readFileSync } from "fs";
import { resolve } from "path";

import type { EvaluationResult, PersonaViewingChoice, PredictedAudienceShare, TVScheduleItem } from "../../lib/labSchemas";

interface BacktestRow {
  Date: string;
  "Chaîne": string;
  "Programme": string;
  "Part d'audience": string;
  "Position": string;
  [key: string]: string;
}

/**
 * Simple CSV parser for the backtest data.
 */
function parseCSV(csv: string): BacktestRow[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) {
    return [];
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Parse data rows
  const rows: BacktestRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: BacktestRow = {} as BacktestRow;

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
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
 * Aggregate viewing choice probabilities across all personas.
 * For each program, sums probabilities and divides by number of personas
 * to get predicted market share percentage.
 */
export function aggregateViewingChoices(
  choices: PersonaViewingChoice[],
  schedule: TVScheduleItem[],
): PredictedAudienceShare[] {
  if (choices.length === 0) {
    throw new Error("No viewing choices to aggregate");
  }

  // Sum probabilities per program
  const programScores = new Map<string, number>();
  for (const choice of choices) {
    for (const score of choice.scores) {
      const current = programScores.get(score.programName) || 0;
      programScores.set(score.programName, current + score.probability);
    }
  }

  // Normalize by number of personas and convert to share percentage
  const numPersonas = choices.length;
  const predictions: PredictedAudienceShare[] = [];

  for (const item of schedule) {
    const totalScore = programScores.get(item.programName) || 0;
    const predictedShare = (totalScore / numPersonas) * 100; // Convert to percentage

    predictions.push({
      programName: item.programName,
      channel: item.channel,
      predictedSharePct: Math.round(predictedShare * 100) / 100, // Round to 2 decimals
      voteCount: Math.round(totalScore * 100) / 100,
      weightedScore: totalScore,
      predictedRank: 0, // Will be set after sorting
    });
  }

  // Sort by predicted share descending and assign ranks
  predictions.sort((a, b) => b.predictedSharePct - a.predictedSharePct);
  for (let i = 0; i < predictions.length; i++) {
    predictions[i].predictedRank = i + 1;
  }

  return predictions;
}

/**
 * Load actual audience data from the CSV for a given date.
 */
function loadActualAudience(date: string): Map<string, { share: number; rank: number }> {
  const csvPath = resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");
  const csv = readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csv);
  const dateRows = rows.filter((row) => row.Date === date);

  const actual = new Map<string, { share: number; rank: number }>();
  for (const row of dateRows) {
    const shareStr = row["Part d'audience"].trim().replace("%", "").replace(",", ".");
    const share = parseFloat(shareStr);
    const rank = parseInt(row["Position"], 10);

    if (!isNaN(share)) {
      actual.set(row["Programme"].trim(), { share, rank });
    }
  }

  return actual;
}

/**
 * Evaluate predictions against actual audience data using MAE and Spearman correlation.
 */
export function evaluateAgainstActual(
  date: string,
  predictions: PredictedAudienceShare[],
): EvaluationResult {
  const actual = loadActualAudience(date);

  if (actual.size === 0) {
    throw new Error(`No actual audience data found for date ${date}`);
  }

  // Build per-program deltas
  const perProgramDelta: Array<{
    programName: string;
    predicted: number;
    actual: number;
    delta: number;
  }> = [];

  let sumAbsError = 0;
  let matchCount = 0;

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

  // Spearman rank correlation (ranks from actual vs predicted)
  const predByName = new Map(predictions.map((p) => [p.programName, p]));
  const predictedRanks: number[] = [];
  const actualRanks: number[] = [];

  for (const [programName, actualData] of actual.entries()) {
    const pred = predByName.get(programName);
    if (pred) {
      predictedRanks.push(pred.predictedRank);
      actualRanks.push(actualData.rank);
    }
  }

  const spearmanRho = computeSpearmanRho(predictedRanks, actualRanks);

  // Top-1 hit: did we predict the top program correctly?
  const topPredicted = predictions[0]?.programName;
  const topActual = Array.from(actual.entries()).find(([_, data]) => data.rank === 1)?.[0];
  const top1Hit = topPredicted === topActual;

  // Top-3 hit: are the top 3 actual programs present in the top 3 predicted (ignoring order)?
  const top3PredictedNames = predictions.slice(0, 3).map(p => p.programName);
  const top3ActualNames = Array.from(actual.entries())
    .filter(([_, data]) => data.rank <= 3)
    .map(([name]) => name);

  const top3Hit = top3ActualNames.every(name => top3PredictedNames.includes(name));

  return {
    date,
    mae,
    spearmanRho,
    top1Hit,
    top3Hit,
    perProgramDelta,
  };
}

/**
 * Compute Spearman rank correlation coefficient between two rank arrays.
 */
function computeSpearmanRho(ranks1: number[], ranks2: number[]): number {
  if (ranks1.length !== ranks2.length || ranks1.length < 2) {
    return 0;
  }

  // Compute differences
  const diffs = ranks1.map((r1, i) => r1 - ranks2[i]);
  const sumSqDiff = diffs.reduce((sum, d) => sum + d * d, 0);

  const n = ranks1.length;
  const rho = 1 - (6 * sumSqDiff) / (n * (n * n - 1));

  return Math.round(rho * 10000) / 10000; // Round to 4 decimals
}
