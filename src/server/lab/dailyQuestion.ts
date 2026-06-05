import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dailyQuestionPreviewSchema, type DailyQuestionPreview, type PromptSource } from "../../lib/labSchemas";
import { getDailyQuestionCachePath } from "./persistence";

const LE_FIGARO_SOURCE = "le_figaro";
const LE_FIGARO_DOSSIER_URL = "https://www.lefigaro.fr/dossier/les-questions-du-jour-du-figaro";

type CachedDailyQuestion = {
  source: typeof LE_FIGARO_SOURCE;
  question: string;
  promptSource: Omit<PromptSource, "cacheStatus">;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripMarkup(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestionText(value: string) {
  return stripMarkup(value)
    .replace(/^la question du jour\s*[:\-]\s*/i, "")
    .replace(/^question du jour\s*[:\-]\s*/i, "")
    .replace(/^le figaro\s*[:\-]\s*/i, "")
    .trim();
}

function extractQuestionSentence(value: string) {
  const normalized = normalizeQuestionText(value);
  const directMatch = normalized.match(/([^?]{6,}\?)/);
  if (directMatch?.[1]) {
    return directMatch[1].trim();
  }

  const afterMarker = normalized.match(/question du jour.{0,40}([^.!]{6,})/i)?.[1];
  if (afterMarker) {
    return afterMarker.trim();
  }

  return normalized.includes("?") ? normalized : null;
}

function extractMetaContent(html: string, attribute: "property" | "name", key: string) {
  return html.match(new RegExp(`<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1];
}

function normalizeHref(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("/")) {
    return `https://www.lefigaro.fr${href}`;
  }
  return `https://www.lefigaro.fr/${href.replace(/^\.?\//, "")}`;
}

function extractJsonLdCandidates(html: string) {
  const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  return matches.flatMap((block) => {
    const json = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (!json) {
      return [];
    }

    try {
      const parsed = JSON.parse(json) as unknown;
      const values = Array.isArray(parsed) ? parsed : [parsed];
      return values.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const candidate = entry as Record<string, unknown>;
        return [candidate.headline, candidate.name, candidate.description].filter((value): value is string => typeof value === "string");
      });
    } catch {
      return [];
    }
  });
}

export function extractLeFigaroQuestionPage(html: string) {
  const ogTitle = extractMetaContent(html, "property", "og:title");
  const twitterTitle = extractMetaContent(html, "name", "twitter:title");
  const jsonLdCandidates = extractJsonLdCandidates(html);
  const text = stripMarkup(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  );

  const excerptMatch = text.match(/question du jour.{0,280}/i) ?? text.match(/la question du jour.{0,280}/i);
  const excerpt = excerptMatch?.[0] ? normalizeQuestionText(excerptMatch[0]) : undefined;
  const candidatePool = [ogTitle, twitterTitle, ...jsonLdCandidates, excerpt, text.slice(0, 500)].filter(Boolean) as string[];

  const question = candidatePool.map(extractQuestionSentence).find((candidate): candidate is string => Boolean(candidate));
  const headline = [ogTitle, twitterTitle, ...jsonLdCandidates]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeQuestionText(value))
    .find(Boolean);

  if (!question) {
    return null;
  }

  return {
    question,
    headline,
    excerpt,
  };
}

export function extractLeFigaroQuestionFromDossier(html: string) {
  const anchorMatches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchorMatches) {
    const href = match[1];
    const anchorText = normalizeQuestionText(match[2] ?? "");
    if (!anchorText.includes("?")) {
      continue;
    }
    if (anchorText.length < 15 || anchorText.length > 180) {
      continue;
    }
    return {
      question: anchorText,
      url: normalizeHref(href),
    };
  }

  return null;
}

function parisDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

async function readCachedQuestion(questionDate: string) {
  try {
    const contents = await readFile(getDailyQuestionCachePath(LE_FIGARO_SOURCE, questionDate), "utf8");
    return JSON.parse(contents) as CachedDailyQuestion;
  } catch {
    return null;
  }
}

async function writeCachedQuestion(questionDate: string, payload: CachedDailyQuestion) {
  const cachePath = getDailyQuestionCachePath(LE_FIGARO_SOURCE, questionDate);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
}

async function fetchLeFigaroHtml() {
  const response = await fetch(LE_FIGARO_DOSSIER_URL, {
    headers: {
      "user-agent": "tweenverse-lab/2.0",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Le Figaro request failed with HTTP ${response.status}.`);
  }

  return response.text();
}

async function fetchFreshLeFigaroQuestion(questionDate: string) {
  const dossierHtml = await fetchLeFigaroHtml();
  const dossierHit = extractLeFigaroQuestionFromDossier(dossierHtml);
  let parsed: { question: string; headline?: string; excerpt?: string; url: string } | null = dossierHit
    ? {
        question: dossierHit.question,
        headline: dossierHit.question,
        excerpt: dossierHit.question,
        url: dossierHit.url,
      }
    : null;

  if (!parsed) {
    const articleParsed = extractLeFigaroQuestionPage(dossierHtml);
    if (articleParsed) {
      parsed = {
        ...articleParsed,
        url: LE_FIGARO_DOSSIER_URL,
      };
    }
  }

  if (!parsed) {
    throw new Error("Unable to parse Le Figaro question du jour.");
  }

  const fetchedAt = new Date().toISOString();
  const promptSourceBase: Omit<PromptSource, "cacheStatus"> = {
    publisher: "Le Figaro",
    label: "Question du jour",
    url: parsed.url,
    questionDate,
    fetchedAt,
    headline: parsed.headline,
    excerpt: parsed.excerpt,
  };
  const payload: CachedDailyQuestion = {
    source: LE_FIGARO_SOURCE,
    question: parsed.question,
    promptSource: promptSourceBase,
  };

  await writeCachedQuestion(questionDate, payload);
  return payload;
}

function toAvailablePreview(payload: CachedDailyQuestion, cacheStatus: "fresh" | "cached"): DailyQuestionPreview {
  return dailyQuestionPreviewSchema.parse({
    status: "available",
    source: LE_FIGARO_SOURCE,
    question: payload.question,
    promptSource: {
      ...payload.promptSource,
      cacheStatus,
    },
  });
}

export async function resolveLeFigaroDailyQuestion(options?: { now?: Date; forceRefresh?: boolean }): Promise<DailyQuestionPreview> {
  const questionDate = parisDateKey(options?.now);

  if (!options?.forceRefresh) {
    const cached = await readCachedQuestion(questionDate);
    if (cached) {
      return toAvailablePreview(cached, "cached");
    }
  }

  try {
    const fresh = await fetchFreshLeFigaroQuestion(questionDate);
    return toAvailablePreview(fresh, "fresh");
  } catch (error) {
    const cached = await readCachedQuestion(questionDate);
    if (cached) {
      return toAvailablePreview(cached, "cached");
    }

    const message = error instanceof Error ? error.message : "Unable to fetch Le Figaro question du jour.";
    return dailyQuestionPreviewSchema.parse({
      status: "unavailable",
      source: LE_FIGARO_SOURCE,
      message,
    });
  }
}
