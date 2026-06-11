import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TVScheduleItem } from "../../lib/labSchemas";

const FIGARO_AUDIENCES_URL = "https://tvmag.lefigaro.fr/programme-tv/audiences-tv/";

const CHANNEL_HINTS = [
  "TF1", "France 2", "France 3", "France 4", "France 5", "M6", "Canal+", "Canal +",
  "Arte", "TMC", "TFX", "TF1 Séries Films", "W9", "6ter", "Gulli", "C8", "CStar",
  "CSTAR", "RMC Découverte", "RMC Story", "BFM TV", "LCI", "CNews", "Franceinfo",
  "L'Équipe", "L'Equipe", "NRJ 12", "Chérie 25"
];

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "fr-FR,fr;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://tvmag.lefigaro.fr/",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with HTTP ${response.status}.`);
  }

  return response.text();
}

function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\xa0/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean program name from trailing audience data if leaky.
 */
function cleanProgramName(name: string): string {
  let cleaned = cleanText(name);
  // Remove patterns like " 1 234 000 téléspectateurs" or " 12,3 %"
  cleaned = cleaned.replace(/\s\d[\d\s]*téléspectateurs.*$/i, "");
  cleaned = cleaned.replace(/\s\d+([,.]\d+)?\s*%.*$/i, "");
  return cleaned.trim();
}

/**
 * Scrapes the TV schedule and actual results from a Figaro audience report article.
 */
async function scrapeScheduleFromReport(url: string): Promise<TVScheduleItem[]> {
  const html = await fetchHtml(url);
  const schedule: TVScheduleItem[] = [];

  // Pattern 1: Table parsing
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const programMatch = rowHtml.match(/class=["']fig-tv-audience__program-title["'][^>]*>([\s\S]*?)<\/td>/i);
    const pdaMatch = rowHtml.match(/class=["']fig-tv-audience__audience["'][^>]*>([\s\S]*?)<\/td>/i);
    
    if (programMatch) {
      const programName = cleanProgramName(programMatch[1]);
      const shareStr = pdaMatch ? cleanText(pdaMatch[1]).replace('%', '').replace(',', '.').trim() : "";
      const actualShare = parseFloat(shareStr) || undefined;
      
      let channel = "";
      let channelLogoUrl = "";
      const channelTitleMatch = rowHtml.match(/class=["']fig-channel-media["'][^>]*title=["']([^"']+)["']/i);
      const channelImgMatch = rowHtml.match(/<img[^>]*class=["']fig-channel[^"]*["'][^>]*>/i);

      if (channelTitleMatch) {
        channel = cleanText(channelTitleMatch[1]).replace("Programme TV ", "");
      }

      if (channelImgMatch) {
        const imgTag = channelImgMatch[0];
        const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
        const altMatch = imgTag.match(/alt=["']([^"']+)["']/i);

        if (srcMatch) {
          const src = srcMatch[1];
          channelLogoUrl = src.startsWith('http') ? src : `https:${src}`;
        }

        if (!channel && altMatch) {
          channel = cleanText(altMatch[1]).replace("Programme TV ", "");
        }
      }
      
      if (!channel) {
        const rowText = cleanText(rowHtml);
        for (const hint of CHANNEL_HINTS) {
          if (new RegExp(`\\b${hint}\\b`, 'i').test(rowText)) {
            channel = hint;
            break;
          }
        }
      }

      if (programName && channel) {
        schedule.push({
          channel,
          programName,
          genre: "", // Remove "Prime"
          timeSlot: "20:00",
          durationMinutes: 120,
          actualShare,
          channelLogoUrl: channelLogoUrl || undefined,
          isFootballMatch: false,
          isHoliday: false,
        });
      }
    }
  }

  // Pattern 2: Text List Fallback
  if (schedule.length === 0) {
    const listRegex = /(?:<p[^>]*>|<li>)(\d+)\.\s+([^<]+)(?:<\/p>|<\/li>)/gi;
    let listMatch;
    while ((listMatch = listRegex.exec(html)) !== null) {
      const line = cleanText(listMatch[2]);
      const parts = line.match(/^(.+?)\s*\(([^)]+)\)\s*[:]\s*(.+?)\s+téléspectateurs\s*\((.+?)\s*%\)$/i);
      if (parts) {
        const [_, programName, channel, viewers, shareStr] = parts;
        schedule.push({
          channel: cleanText(channel),
          programName: cleanProgramName(programName),
          genre: "",
          timeSlot: "20:00",
          durationMinutes: 120,
          actualShare: parseFloat(shareStr.replace(',', '.')) || undefined,
          isFootballMatch: false,
          isHoliday: false,
        });
      }
    }
  }

  // Pattern 3: Generic channel-program mapping (Last resort)
  if (schedule.length === 0) {
    for (const channel of CHANNEL_HINTS) {
      // Look for "[Channel] - [Program]" or "[Channel] : [Program]"
      const genericRegex = new RegExp(`${channel}\\s+[-:]\\s+([^<.(]+)`, 'i');
      const match = html.match(genericRegex);
      if (match) {
        schedule.push({
          channel,
          programName: cleanText(match[1]),
          genre: "",
          timeSlot: "20:00",
          durationMinutes: 120,
          isFootballMatch: false,
          isHoliday: false,
        });
      }
    }
  }

  return schedule;
}


export async function resolveLatestTvAudienceDate(): Promise<{ targetDate: string; reportUrl: string; schedule: TVScheduleItem[] }> {
  try {
    const indexHtml = await fetchHtml(FIGARO_AUDIENCES_URL);
    
    // Pattern to find audience report links
    const matches = [...indexHtml.matchAll(/href=["']([^"']+\-(\d{8}))["']/gi)];
    
    if (matches.length === 0) {
      throw new Error("No TV audience reports found on Le Figaro page.");
    }

    // Take the first match (most recent)
    const [_, url, dateString] = matches[0];
    const reportUrl = url.startsWith('http') ? url : `https://tvmag.lefigaro.fr${url}`;
    
    // Parse YYYYMMDD
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    
    // Report on date N covers audience for date N-1
    const publishDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    const targetDateObj = new Date(publishDate.getTime() - 24 * 60 * 60 * 1000);
    const targetDate = targetDateObj.toISOString().split('T')[0];

    // Scrape the schedule directly from the article
    const schedule = await scrapeScheduleFromReport(reportUrl);

    return {
      targetDate,
      reportUrl,
      schedule
    };
  } catch (error) {
    console.error("[tvLatestDate] Scraper failed:", error);
    
    // Fallback to latest CSV if scraping fails completely
    const { parseBacktestSchedule } = await import("./tvSchedule");
    const csvPath = resolve(process.cwd(), "data/tv-audience/audiences_figaro_2_weeks.csv");
    const csvContent = readFileSync(csvPath, "utf-8");
    const dates = csvContent.split("\n").slice(1).map(line => line.split(",")[0]).filter(Boolean);
    const latestDate = [...new Set(dates)].sort().pop() || "2026-06-07";
    
    return {
      targetDate: latestDate,
      reportUrl: FIGARO_AUDIENCES_URL,
      schedule: parseBacktestSchedule(latestDate)
    };
  }
}
