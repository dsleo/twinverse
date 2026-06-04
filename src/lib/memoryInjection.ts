import { nemotronSeedPanel } from "../data/nemotronSeedPanel";
import type { Persona } from "../types";

export type InputType =
  | "question"
  | "article"
  | "proposal"
  | "speech"
  | "poll_question"
  | "other";

export interface MemoryInjectionInput {
  rawInput: string;
  inputType: InputType;
}

export interface PopulationSegment {
  id: string;
  label: string;
  description: string;
  targetPersonaIds: string[];
  likelyConcerns: string[];
  informationNeeds: string[];
}

export interface RetrievalQuery {
  provider: "gdelt" | "rss" | "wikipedia" | "reddit" | "google_trends";
  query: string;
  freshness: "today" | "week" | "month" | "background";
  purpose: string;
}

export interface RetrievedSource {
  id: string;
  provider: RetrievalQuery["provider"];
  provenance: "live" | "fallback";
  title: string;
  snippet: string;
  failureReason?: string;
  url?: string;
  publishedAt?: string;
  sourceName?: string;
  query: string;
  relevanceScore: number;
  tags: string[];
}

export interface ContextPack {
  id: string;
  label: string;
  targetSegmentId: string;
  targetPersonaIds: string[];
  exposureProfile: {
    nationalNews: number;
    regionalNews: number;
    professionalNews: number;
    socialDiscourse: number;
    backgroundKnowledge: number;
  };
  memoryInjection: {
    conciseBriefing: string;
    factsLikelyKnown: string[];
    factsLikelyIgnored: string[];
    emotionalPrimers: string[];
    practicalImplications: string[];
  };
  sourceIds: string[];
  constructionRationale: string;
}

export interface SyntheticReaction {
  personaId: string;
  contextPackId: string;
  stance: "strong_support" | "support" | "mixed" | "oppose" | "strong_oppose" | "uncertain";
  emotionalState: "calm" | "concerned" | "angry" | "hopeful" | "skeptical" | "confused";
  confidence: number;
  keyDrivers: string[];
  reactionSummary: string;
  quote: string;
  perceivedPersonalImpact: string;
  likelyMisunderstanding?: string;
}

export interface AggregateReport {
  executiveSummary: string;
  mainDivergences: Array<{
    title: string;
    description: string;
    affectedSegments: string[];
  }>;
  segmentSummaries: Array<{
    segmentId: string;
    label: string;
    dominantStance: string;
    emotionalTone: string;
    mainDrivers: string[];
    representativeQuotes: string[];
  }>;
  overallPattern: string;
  caveats: string[];
}

export interface MemoryInjectionRun {
  id: string;
  createdAt: string;
  status: "created" | "running" | "completed" | "failed";
  input: MemoryInjectionInput;
  panel: Persona[];
  populationMap?: { segments: PopulationSegment[]; globalRationale: string };
  retrievalPlan?: { intentSummary: string; entities: string[]; themes: string[]; queries: RetrievalQuery[] };
  retrievedSources: RetrievedSource[];
  contextPacks: ContextPack[];
  reactions: SyntheticReaction[];
  aggregateReport?: AggregateReport;
  error?: string;
}

const STORAGE_KEY = "tweenverse.memoryInjectionRuns";

const panel = nemotronSeedPanel;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 24);
}

const searchStopwords = new Set([
  "faut",
  "il",
  "les",
  "des",
  "pour",
  "avec",
  "dans",
  "contre",
  "entre",
  "question",
  "article",
  "speech",
  "proposal",
  "france",
]);

function buildSearchPhrase(input: string) {
  const keywords = input
    .match(/[a-zà-ÿ]{4,}/gi)
    ?.map((token) => normalizeText(token))
    .filter((token) => !searchStopwords.has(token))
    .slice(0, 4) ?? [];

  return keywords.length > 0 ? keywords.join(" ") : input;
}

function buildPopulationMap() {
  const segments: PopulationSegment[] = [
    {
      id: "working-class-households",
      label: "Working-class households",
      description: "Households that watch costs closely and read policy through pay, service quality, and job stability.",
      targetPersonaIds: [],
      likelyConcerns: ["cost of living", "job stability", "family expenses"],
      informationNeeds: ["budget impact", "implementation speed", "who pays"],
    },
    {
      id: "stable-middle-households",
      label: "Stable middle households",
      description: "Middle-income households that want practical proof, not abstract promises.",
      targetPersonaIds: [],
      likelyConcerns: ["skills and training", "public services", "family expenses"],
      informationNeeds: ["practical consequences", "risk", "timeline"],
    },
    {
      id: "retired-fixed-income",
      label: "Retired and fixed-income households",
      description: "Older or fixed-income households that focus on fairness, predictability, and public services.",
      targetPersonaIds: [],
      likelyConcerns: ["public services", "cost of living", "stability"],
      informationNeeds: ["what changes now", "what remains stable", "local impact"],
    },
    {
      id: "self-employed-pros",
      label: "Self-employed and senior professionals",
      description: "Independent and higher-skill households that examine operational detail and risk.",
      targetPersonaIds: [],
      likelyConcerns: ["business risk", "efficiency", "compliance"],
      informationNeeds: ["operational detail", "cost/benefit", "implementation"],
    },
    {
      id: "urban-family-renters",
      label: "Urban and family renters",
      description: "Younger or more mobile households that weigh convenience, trust, and day-to-day practicality.",
      targetPersonaIds: [],
      likelyConcerns: ["monthly cost", "convenience", "trust"],
      informationNeeds: ["plain-language summary", "near-term effects", "direct impact"],
    },
  ];

  for (const persona of panel) {
    const text = `${persona.occupation} ${persona.household} ${persona.economicPosture}`.toLowerCase();
    let targetSegment = segments[1];
    if (text.includes("retrait") || persona.age >= 63) {
      targetSegment = segments[2];
    } else if (text.includes("cadre") || text.includes("entreprise") || text.includes("self-employed") || text.includes("profession")) {
      targetSegment = segments[3];
    } else if (text.includes("living alone") || text.includes("jeune") || persona.age <= 35) {
      targetSegment = segments[4];
    } else if (text.includes("ouvrier") || text.includes("pragmatic")) {
      targetSegment = segments[0];
    }
    targetSegment.targetPersonaIds.push(persona.id);
  }

  return {
    segments: [...segments].sort((a, b) => b.targetPersonaIds.length - a.targetPersonaIds.length || a.label.localeCompare(b.label)),
    globalRationale:
      "The panel is divided into five audience clusters using the dataset personas' occupation, age, and household patterns.",
  };
}

function buildRetrievalPlan(input: MemoryInjectionInput, populationMap: ReturnType<typeof buildPopulationMap>) {
  const text = input.rawInput.toLowerCase();
  const entities = Array.from(new Set(text.match(/[a-zà-ÿ]{4,}/g)?.slice(0, 6) ?? ["france"]));
  const searchPhrase = buildSearchPhrase(input.rawInput);
  const themes = ["public policy", "public debate", "background context"];
  const queries: RetrievalQuery[] = [
    {
      provider: "wikipedia",
      query: input.rawInput,
      freshness: "background",
      purpose: "Background facts and definitions",
    },
    {
      provider: "rss",
      query: searchPhrase,
      freshness: "week",
      purpose: "Recent media framing",
    },
    {
      provider: "gdelt",
      query: input.rawInput,
      freshness: "month",
      purpose: "Recent event context",
    },
    {
      provider: "reddit",
      query: searchPhrase,
      freshness: "month",
      purpose: "Public discourse signal",
    },
  ];
  if (populationMap.segments.length > 3) {
    queries.push({
      provider: "google_trends",
      query: searchPhrase,
      freshness: "week",
      purpose: "Public attention proxy",
    });
  }
  return {
    intentSummary: `Break the input into public-information and audience-framing needs for ${input.inputType}.`,
    entities,
    themes,
    queries,
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenSet(value: string) {
  return new Set(normalizeText(value).split(/[^a-z0-9]+/).filter(Boolean));
}

function scoreOverlap(query: string, haystack: string) {
  const queryTokens = Array.from(tokenSet(query));
  if (queryTokens.length === 0) {
    return 0;
  }
  const haystackTokens = tokenSet(haystack);
  const matches = queryTokens.filter((token) => haystackTokens.has(token)).length;
  return matches / queryTokens.length;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "tweenverse-memory-injection/1.0",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchGdeltSources(query: RetrievalQuery): Promise<RetrievedSource[]> {
  const url = new URL("/proxy/gdelt", window.location.origin);
  url.searchParams.set("query", query.query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "5");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", query.freshness === "today" ? "24h" : query.freshness === "week" ? "7d" : "30d");
  const data = (await fetchJson(url.toString())) as {
    articles?: Array<{
      title?: string;
      url?: string;
      seendate?: string;
      sourceCountry?: string;
      sourceCollection?: string;
      domain?: string;
      snippet?: string;
    }>;
  };
  return (data.articles ?? []).slice(0, 5).map((article, index) => ({
    id: `gdelt-${slugify(article.url ?? article.title ?? `${query.query}-${index}`)}`,
    provider: "gdelt",
    provenance: "live",
    title: article.title ?? query.query,
    snippet: article.snippet ?? article.sourceCollection ?? "GDELT article match",
    url: article.url,
    publishedAt: article.seendate,
    sourceName: article.domain ?? article.sourceCountry ?? "GDELT",
    query: query.query,
    relevanceScore: clamp(0.95 - index * 0.1, 0.2, 0.95),
    tags: ["gdelt", query.freshness, "news"],
  }));
}

async function fetchWikipediaSources(query: RetrievalQuery): Promise<RetrievedSource[]> {
  const searchUrl = new URL("/proxy/wikipedia-search", window.location.origin);
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query.query);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const searchData = (await fetchJson(searchUrl.toString())) as {
    query?: { search?: Array<{ title?: string; snippet?: string }> };
  };
  const title = searchData.query?.search?.[0]?.title;
  if (!title) {
    return [];
  }

  const summaryResponse = await fetch(`/proxy/wikipedia-summary/${encodeURIComponent(title)}`, {
    headers: {
      "user-agent": "tweenverse-memory-injection/1.0",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!summaryResponse.ok) {
    return [];
  }
  const summaryData = (await summaryResponse.json()) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };

  return [
    {
      id: `wikipedia-${slugify(summaryData.title ?? title)}`,
      provider: "wikipedia",
      provenance: "live",
      title: summaryData.title ?? title,
      snippet: summaryData.extract ?? searchData.query?.search?.[0]?.snippet ?? "Wikipedia summary",
      url: summaryData.content_urls?.desktop?.page,
      sourceName: "Wikipedia",
      query: query.query,
      relevanceScore: 0.9,
      tags: ["wikipedia", "background", "live"],
    },
  ];
}

function parseXmlItems(xml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  return Array.from(doc.querySelectorAll("item"));
}

function stripMarkup(value: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(value, "text/html");
  return doc.body.textContent?.replace(/\s+/g, " ").trim() ?? value;
}

async function fetchRssSources(query: RetrievalQuery): Promise<RetrievedSource[]> {
  const url = new URL("/proxy/google-news-rss", window.location.origin);
  url.searchParams.set("q", query.query);
  url.searchParams.set("hl", "fr");
  url.searchParams.set("gl", "FR");
  url.searchParams.set("ceid", "FR:fr");

  const response = await fetch(url.toString(), {
    headers: {
      "user-agent": "tweenverse-memory-injection/1.0",
      accept: "application/rss+xml,application/xml,text/xml,text/plain,*/*",
    },
  });
  if (!response.ok) {
    return [];
  }
  const xml = await response.text();
  return parseXmlItems(xml).slice(0, 4).map((item, index) => {
    const rawTitle = item.querySelector("title")?.textContent?.trim() ?? "Recent media framing";
    const parts = rawTitle.split(" - ");
    const title = parts.length > 1 ? parts.slice(0, -1).join(" - ") : rawTitle;
    const sourceName = parts.length > 1 ? parts.at(-1) ?? "Google News" : "Google News";
    let snippet = stripMarkup(item.querySelector("description")?.textContent?.trim() ?? "Recent media coverage related to the prompt.");
    if (normalizeText(snippet).startsWith(normalizeText(title))) {
      snippet = snippet.slice(title.length).replace(/^[\s:.\-–—]+/, "").trim();
    }
    return {
      id: `rss-${slugify(item.querySelector("link")?.textContent ?? `${query.query}-${index}`)}`,
      provider: "rss",
      provenance: "live",
      title,
      snippet,
      url: item.querySelector("link")?.textContent?.trim(),
      publishedAt: item.querySelector("pubDate")?.textContent?.trim(),
      sourceName,
      query: query.query,
      relevanceScore: clamp(0.9 - index * 0.08, 0.45, 0.9),
      tags: ["rss", "live", query.freshness],
    };
  });
}

async function fetchRedditSources(query: RetrievalQuery): Promise<RetrievedSource[]> {
  const url = new URL("/proxy/reddit-search", window.location.origin);
  url.searchParams.set("q", query.query);
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("limit", "4");
  url.searchParams.set("t", query.freshness === "today" ? "day" : query.freshness === "week" ? "week" : "month");

  const data = (await fetchJson(url.toString())) as {
    data?: {
      children?: Array<{
        data?: {
          title?: string;
          selftext?: string;
          permalink?: string;
          subreddit_name_prefixed?: string;
          created_utc?: number;
        };
      }>;
    };
  };

  return (data.data?.children ?? []).slice(0, 4).flatMap((entry, index) => {
    const post = entry.data;
    if (!post?.title) {
      return [];
    }
    return [
      {
        id: `reddit-${slugify(post.permalink ?? `${query.query}-${index}`)}`,
        provider: "reddit",
        provenance: "live",
        title: post.title,
        snippet: post.selftext?.slice(0, 220) || "Recent public discussion related to the prompt.",
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
        publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
        sourceName: post.subreddit_name_prefixed ?? "Reddit",
        query: query.query,
        relevanceScore: clamp(0.82 - index * 0.08, 0.4, 0.82),
        tags: ["reddit", "live", query.freshness],
      },
    ];
  });
}

async function fetchGoogleTrendsSources(query: RetrievalQuery): Promise<RetrievedSource[]> {
  const url = new URL("/proxy/google-trends-daily", window.location.origin);
  url.searchParams.set("hl", "fr");
  url.searchParams.set("geo", "FR");
  url.searchParams.set("ns", "15");

  const response = await fetch(url.toString(), {
    headers: {
      "user-agent": "tweenverse-memory-injection/1.0",
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const text = await response.text();
  const trimmed = text.replace(/^\)\]\}',?\n/, "");
  const data = JSON.parse(trimmed) as {
    default?: {
      trendingSearchesDays?: Array<{
        trendingSearches?: Array<{
          title?: { query?: string };
          formattedTraffic?: string;
          articles?: Array<{ title?: string }>;
        }>;
      }>;
    };
  };
  const trends = data.default?.trendingSearchesDays?.flatMap((day) => day.trendingSearches ?? []) ?? [];
  const ranked = trends
    .map((trend, index) => ({
      trend,
      score: scoreOverlap(query.query, `${trend.title?.query ?? ""} ${trend.articles?.map((article) => article.title ?? "").join(" ")}`),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2);

  return ranked.flatMap(({ trend, score }, index) => {
    const title = trend.title?.query;
    if (!title) {
      return [];
    }
    return [
      {
        id: `google-trends-${slugify(title)}`,
        provider: "google_trends",
        provenance: "live",
        title,
        snippet: `Trending in France${trend.formattedTraffic ? ` · ${trend.formattedTraffic}` : ""}. ${trend.articles?.[0]?.title ?? "Current public attention signal."}`,
        sourceName: "Google Trends",
        query: query.query,
        relevanceScore: clamp(Math.max(score, 0.45) - index * 0.05, 0.35, 0.78),
        tags: ["google_trends", "live", query.freshness],
      },
    ];
  });
}

function extractFigaroQuestion(html: string) {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const twitterTitle = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const jsonLd = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const headline = ogTitle ?? twitterTitle ?? (jsonLd ? (() => {
    try {
      const parsed = JSON.parse(jsonLd) as { name?: string; headline?: string };
      return parsed.headline ?? parsed.name;
    } catch {
      return undefined;
    }
  })() : undefined);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  const match = text.match(/question du jour.{0,240}/i) ?? text.match(/question.{0,240}/i);
  return { headline, snippet: match?.[0] };
}

async function fetchLeFigaroQuestionDuJour(query: RetrievalQuery): Promise<RetrievedSource[]> {
  const response = await fetch("/proxy/lefigaro", {
    headers: {
      "user-agent": "tweenverse-memory-injection/1.0",
    },
  });
  if (!response.ok) {
    return [];
  }
  const html = await response.text();
  const parsed = extractFigaroQuestion(html);
  if (!parsed.headline && !parsed.snippet) {
    return [];
  }
  return [
    {
      id: `figaro-question-du-jour-${slugify(query.query)}`,
      provider: "rss",
      provenance: "live",
      title: parsed.headline ?? "Le Figaro - La Question du Jour",
      snippet: (parsed.snippet ?? parsed.headline ?? "Le Figaro question du jour").slice(0, 220),
      url: "https://video.lefigaro.fr/figaro/la-question-du-jour",
      publishedAt: undefined,
      sourceName: "Le Figaro",
      query: query.query,
      relevanceScore: 0.88,
      tags: ["figaro", "question_du_jour", "public_debate"],
    },
  ];
}

function buildFallbackSource(query: RetrievalQuery, queryIndex: number, failureReason: string): RetrievedSource[] {
  const fallbackTitles: Record<RetrievalQuery["provider"], string> = {
    wikipedia: "Background reference",
    rss: "Recent media framing",
    gdelt: "Recent event context",
    reddit: "Public discourse signal",
    google_trends: "Public attention signal",
  };

  return [
    {
      id: `${query.provider}-${queryIndex + 1}-a`,
      provider: query.provider,
      provenance: "fallback",
      title: fallbackTitles[query.provider],
      snippet: failureReason,
      failureReason,
      url: `https://example.com/${slugify(query.query)}/${query.provider}`,
      publishedAt: new Date().toISOString(),
      sourceName: query.provider,
      query: query.query,
      relevanceScore: clamp(0.78 - queryIndex * 0.05, 0.4, 0.95),
      tags: [query.freshness, query.provider, "synthetic"],
    },
  ];
}

function describeError(providerLabel: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP 4\d\d/.test(message)) {
    return `${providerLabel} rejected the request (${message}).`;
  }
  if (/HTTP 5\d\d/.test(message)) {
    return `${providerLabel} failed upstream (${message}).`;
  }
  if (/fetch failed|NetworkError|Failed to fetch/i.test(message)) {
    return `${providerLabel} could not be reached from the browser session.`;
  }
  return `${providerLabel} failed while parsing or returning data (${message}).`;
}

async function resolveProviderSources(query: RetrievalQuery, queryIndex: number): Promise<RetrievedSource[]> {
  try {
    if (query.provider === "wikipedia") {
      const wikipedia = await fetchWikipediaSources(query);
      if (wikipedia.length > 0) {
        return wikipedia;
      }
      return buildFallbackSource(query, queryIndex, "Wikipedia returned no matching background page for this prompt.");
    }

    if (query.provider === "gdelt") {
      const gdelt = await fetchGdeltSources(query);
      if (gdelt.length > 0) {
        return gdelt;
      }
      return buildFallbackSource(query, queryIndex, "GDELT returned no recent articles that matched this prompt.");
    }

    if (query.provider === "rss") {
      try {
        const rss = await fetchRssSources(query);
        if (rss.length > 0) {
          return rss;
        }
      } catch (error) {
        const figaro = await fetchLeFigaroQuestionDuJour(query).catch(() => []);
        if (figaro.length > 0) {
          return figaro;
        }
        return buildFallbackSource(query, queryIndex, describeError("Google News RSS", error));
      }

      const figaro = await fetchLeFigaroQuestionDuJour(query).catch(() => []);
      if (figaro.length > 0) {
        return figaro;
      }
      return buildFallbackSource(query, queryIndex, "No recent news coverage matched this prompt.");
    }

    if (query.provider === "reddit") {
      const reddit = await fetchRedditSources(query);
      if (reddit.length > 0) {
        return reddit;
      }
      return buildFallbackSource(query, queryIndex, "Reddit returned no relevant public threads for this prompt.");
    }

    if (query.provider === "google_trends") {
      const trends = await fetchGoogleTrendsSources(query);
      if (trends.length > 0) {
        return trends;
      }
      return buildFallbackSource(query, queryIndex, "Google Trends returned no trend in France that clearly overlaps with this prompt.");
    }
  } catch (error) {
    const label =
      query.provider === "google_trends"
        ? "Google Trends"
        : query.provider === "rss"
          ? "Google News RSS"
          : query.provider === "gdelt"
            ? "GDELT"
            : query.provider === "reddit"
              ? "Reddit"
              : "Wikipedia";
    return buildFallbackSource(query, queryIndex, describeError(label, error));
  }

  return buildFallbackSource(query, queryIndex, `No usable ${query.provider} result was returned.`);
}

async function buildRetrievedSources(plan: ReturnType<typeof buildRetrievalPlan>): Promise<RetrievedSource[]> {
  const allSources = await Promise.all(plan.queries.map((query, queryIndex) => resolveProviderSources(query, queryIndex)));
  const flattened = allSources.flat();
  const deduped = new Map<string, RetrievedSource>();
  for (const source of flattened) {
    const key = `${normalizeText(source.title)}|${source.url ?? ""}`;
    const existing = deduped.get(key);
    if (!existing || existing.relevanceScore < source.relevanceScore) {
      deduped.set(key, source);
    }
  }
  return Array.from(deduped.values()).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function buildContextPacks(
  input: MemoryInjectionInput,
  populationMap: ReturnType<typeof buildPopulationMap>,
  retrievedSources: RetrievedSource[],
) {
  return populationMap.segments.map((segment, index) => ({
      id: `cp_${index + 1}`,
      label: segment.label,
    targetSegmentId: segment.id,
    targetPersonaIds: segment.targetPersonaIds,
    exposureProfile: {
      nationalNews: clamp(0.8 - index * 0.1, 0.2, 1),
      regionalNews: clamp(0.55 + index * 0.05, 0.2, 1),
      professionalNews: clamp(0.45 + index * 0.04, 0.1, 1),
      socialDiscourse: clamp(0.5 + index * 0.07, 0.1, 1),
      backgroundKnowledge: clamp(0.65 - index * 0.08, 0.1, 1),
    },
    memoryInjection: {
      conciseBriefing: `This group is likely to read the input through the lens of ${segment.label.toLowerCase()}.`,
      factsLikelyKnown: retrievedSources.slice(0, 2).map((source) => source.title),
      factsLikelyIgnored: ["Long-term institutional nuance", "Low-salience technical detail"],
      emotionalPrimers: segment.likelyConcerns.slice(0, 2),
      practicalImplications: [
        `Personal cost or benefit is likely to matter for ${input.inputType}.`,
        `Implementation detail will shape trust.`,
      ],
    },
    sourceIds: retrievedSources.slice(0, 3).map((source) => source.id),
    constructionRationale: `Built from the input and the ${segment.label.toLowerCase()} segment. Retrieved sources are thin and therefore framed conservatively.`,
  }));
}

function stanceForIndex(index: number): SyntheticReaction["stance"] {
  return ["strong_support", "support", "mixed", "oppose", "strong_oppose", "uncertain"][index % 6] as SyntheticReaction["stance"];
}

function emotionForStance(stance: SyntheticReaction["stance"]): SyntheticReaction["emotionalState"] {
  switch (stance) {
    case "strong_support":
    case "support":
      return "hopeful";
    case "mixed":
      return "concerned";
    case "oppose":
    case "strong_oppose":
      return "skeptical";
    default:
      return "confused";
  }
}

function simulateReactions(input: MemoryInjectionInput, packByPersona: Map<string, ContextPack>, fallbackPack?: ContextPack) {
  return panel.map((persona, index) => {
    const pack = packByPersona.get(persona.id) ?? fallbackPack;
    if (!pack) {
      throw new Error("No context pack available for persona assignment.");
    }
    const stance = stanceForIndex(index);
    return {
      personaId: persona.id,
      contextPackId: pack.id,
      stance,
      emotionalState: emotionForStance(stance),
      confidence: clamp(2 + (index % 4), 1, 5),
      keyDrivers: [persona.economicPosture, ...persona.concerns.slice(0, 2)],
      reactionSummary: `${persona.name} reacts to "${input.rawInput}" with a ${stance.replace("_", " ")} posture based on the assigned context pack.`,
      quote: `"${input.rawInput.slice(0, 48)}${input.rawInput.length > 48 ? "…" : ""}"`,
      perceivedPersonalImpact: `This would affect ${persona.household.toLowerCase()} through budget, access, and credibility.`,
      likelyMisunderstanding: index % 4 === 0 ? "May overstate the speed of implementation." : undefined,
    };
  });
}

function buildAggregateReport(reactions: SyntheticReaction[], packs: ContextPack[]): AggregateReport {
  const byPack = new Map<string, SyntheticReaction[]>();
  reactions.forEach((reaction) => {
    const list = byPack.get(reaction.contextPackId) ?? [];
    list.push(reaction);
    byPack.set(reaction.contextPackId, list);
  });
  return {
    executiveSummary:
      "The panel splits between pragmatic support, cautious mixed views, and a smaller skeptical bloc. Differences are driven by cost exposure, institutional trust, and perceived implementation risk.",
    mainDivergences: packs.slice(0, 3).map((pack) => ({
      title: pack.label,
      description: `${pack.label} emphasizes different tradeoffs, so the same input lands as either practical, uncertain, or risky.`,
      affectedSegments: [pack.targetSegmentId],
    })),
    segmentSummaries: packs.map((pack) => {
      const reactionsForPack = byPack.get(pack.id) ?? [];
      return {
        segmentId: pack.targetSegmentId,
        label: pack.label,
        dominantStance: reactionsForPack[0]?.stance ?? "uncertain",
        emotionalTone: reactionsForPack[0]?.emotionalState ?? "confused",
        mainDrivers: pack.memoryInjection.factsLikelyKnown.slice(0, 3),
        representativeQuotes: reactionsForPack.slice(0, 2).map((reaction) => reaction.quote),
      };
    }),
    overallPattern: "The split comes from how each group weighs cost, trust, and immediate consequences, not from the wording alone.",
    caveats: [
      "This is a synthetic simulation.",
      "This is not a representative poll.",
      "Results depend on retrieved sources, context-pack design, and model behavior.",
    ],
  };
}

function persistRun(run: MemoryInjectionRun) {
  if (typeof window === "undefined") {
    return;
  }
  const stored = readStoredRuns();
  const next = [run, ...stored.filter((item) => item.id !== run.id)].slice(0, 25);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function readStoredRuns(): MemoryInjectionRun[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MemoryInjectionRun[]) : [];
  } catch {
    return [];
  }
}

export function getStoredRun(runId: string) {
  return readStoredRuns().find((run) => run.id === runId);
}

export async function executeMemoryInjection(input: MemoryInjectionInput): Promise<MemoryInjectionRun> {
  const run: MemoryInjectionRun = {
    id: `run_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "running",
    input,
    panel,
    retrievedSources: [],
    contextPacks: [],
    reactions: [],
  };

  const populationMap = buildPopulationMap();
  run.populationMap = populationMap;
  const retrievalPlan = buildRetrievalPlan(input, populationMap);
  run.retrievalPlan = retrievalPlan;
  run.retrievedSources = await buildRetrievedSources(retrievalPlan);
  run.contextPacks = buildContextPacks(input, populationMap, run.retrievedSources);
  const packByPersona = new Map<string, ContextPack>();
  for (const pack of run.contextPacks) {
    for (const personaId of pack.targetPersonaIds) {
      packByPersona.set(personaId, pack);
    }
  }
  const defaultPack = run.contextPacks[0];
  run.reactions = simulateReactions(input, packByPersona, defaultPack);
  run.aggregateReport = buildAggregateReport(run.reactions, run.contextPacks);
  run.status = "completed";
  persistRun(run);
  return run;
}
