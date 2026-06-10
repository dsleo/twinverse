import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FIGARO_AUDIENCES_URL = "https://tvmag.lefigaro.fr/programme-tv/audiences-tv/";

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
    
    const targetDate = targetDateObj.toISOString().split('T')[0];
    const reportUrl = url.startsWith('http') ? url : `https://tvmag.lefigaro.fr${url}`;

    return {
      targetDate,
      reportUrl
    };
  } catch (error) {
    console.error("[tvLatestDate] Failed to resolve latest date:", error);
    // Fallback to a sensible default if scraping fails
    // In a real app, you might want to return the last known good date
    return {
      targetDate: "2026-06-09",
      reportUrl: FIGARO_AUDIENCES_URL
    };
  }
}
