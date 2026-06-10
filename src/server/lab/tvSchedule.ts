import "server-only";

import { readFileSync } from "fs";
import { resolve } from "path";

import type { TVScheduleItem } from "../../lib/labSchemas";

interface BacktestRow {
  Date: string;
  "Chaîne": string;
  "Programme": string;
  "Genre": string;
  "Heure": string;
  "Durée": string;
  "Jour semaine": string;
  [key: string]: string;
}

/**
 * Simple CSV parser for the backtest data.
 * Handles quoted fields and comma-separated values.
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
 * Parse the backtest CSV and extract safe schedule items for a given date.
 * Strips all leaky columns (Audience, Part d'audience, Position, Feature, Concurrence, Réseaux sociaux, etc.)
 * Only exposes: channel, programName, genre, timeSlot, durationMinutes
 */
export function parseBacktestSchedule(date: string): TVScheduleItem[] {
  const csvPath = resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");
  const csv = readFileSync(csvPath, "utf-8");

  const rows = parseCSV(csv);

  // Filter for the given date
  const dateRows = rows.filter((row) => row.Date === date);

  // Parse into safe TVScheduleItem
  const schedule: TVScheduleItem[] = dateRows.map((row) => {
    const durationStr = row["Durée"]?.trim();
    const durationMinutes = durationStr ? parseInt(durationStr, 10) : null;

    return {
      channel: row["Chaîne"].trim(),
      programName: row["Programme"].trim(),
      genre: row["Genre"].trim(),
      timeSlot: row["Heure"].trim(),
      durationMinutes: isNaN(durationMinutes || NaN) ? null : durationMinutes,
    };
  });

  return schedule;
}

/**
 * Fetch live TV schedule from an external provider.
 * Not implemented yet — placeholder for future integration with telerama.fr or programme-tv.net
 */
export async function fetchLiveSchedule(date: string): Promise<TVScheduleItem[]> {
  throw new Error("fetchLiveSchedule not yet implemented");
}
