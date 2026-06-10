import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIGARO_AUDIENCES_URL = "https://tvmag.lefigaro.fr/programme-tv/audiences-tv/";

function getLatestCsvDate(): string {
  const csvPath = resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");
  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim().length > 0);
  const dates = lines.slice(1).map(line => line.split(",")[0]);
  const uniqueDates = Array.from(new Set(dates)).sort();
  return uniqueDates[uniqueDates.length - 1] || "2026-06-07";
}

async function fetchFigaroAudiencesHtml() {
  const response = await fetch(FIGARO_AUDIENCES_URL, {
    headers: {
      "user-agent": "tweenverse-lab/2.0",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Le Figaro TV audiences request failed with HTTP ${response.status}.`);
  }

  return response.text();
}

export async function resolveLatestTvAudienceDate(): Promise<{ targetDate: string; reportUrl: string }> {
  const latestCsvDate = getLatestCsvDate();
  
  try {
    const html = await fetchFigaroAudiencesHtml();
    
    // Look for links that look like audience reports with a date at the end
    // Pattern: audiences-...-YYYYMMDD
    const matches = [...html.matchAll(/href=["']([^"']+\-(\d{8}))["']/gi)];
    
    if (matches.length === 0) {
      throw new Error("No TV audience reports found on Le Figaro page.");
    }

    // Take the first match (most recent)
    const [_, url, dateString] = matches[0];
    
    // Parse YYYYMMDD
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    
    // This report published on date N usually covers audience for date N-1
    const publishDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    const targetDateObj = new Date(publishDate.getTime() - 24 * 60 * 60 * 1000);
    
    const scrapedDate = targetDateObj.toISOString().split('T')[0];
    const reportUrl = url.startsWith('http') ? url : `https://tvmag.lefigaro.fr${url}`;

    // Verify if the scraped date exists as a primary record in our dataset
    const csvPath = resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");
    const csvContent = readFileSync(csvPath, "utf-8");
    const hasData = csvContent.split("\n").some(line => line.startsWith(scrapedDate + ","));
    
    const targetDate = hasData ? scrapedDate : latestCsvDate;

    return {
      targetDate,
      reportUrl
    };
  } catch (error) {
    console.error("[tvLatestDate] Failed to resolve latest date:", error);
    return {
      targetDate: latestCsvDate,
      reportUrl: FIGARO_AUDIENCES_URL
    };
  }
}
