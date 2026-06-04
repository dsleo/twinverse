import "server-only";

import type { MemoryInput, Provider, ProviderOutcome, ProviderOutcomeStatus, RetrievedSource, RetrievalResult } from "../../lib/memorySchemas";
import { retrievalResultSchema } from "../../lib/memorySchemas";

type ProviderResult = {
  outcome: ProviderOutcome;
  sources: RetrievedSource[];
};

type QueryPlan = Array<{
  provider: Provider;
  query: string;
  freshness: "today" | "week" | "month" | "background";
}>;

const searchStopwords = new Set(["faut", "pour", "avec", "dans", "contre", "entre", "question", "article", "france"]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 36);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchPhrase(input: string) {
  const keywords = input
    .match(/[a-zà-ÿ]{4,}/gi)
    ?.map((token) => normalizeText(token))
    .filter((token) => !searchStopwords.has(token))
    .slice(0, 5) ?? [];

  return keywords.length > 0 ? keywords.join(" ") : input;
}

function buildQueries(input: MemoryInput): QueryPlan {
  const searchPhrase = buildSearchPhrase(input.rawInput);
  return [
    { provider: "wikipedia", query: input.rawInput, freshness: "background" },
    { provider: "rss", query: searchPhrase, freshness: "week" },
    { provider: "gdelt", query: input.rawInput, freshness: "month" },
    { provider: "reddit", query: searchPhrase, freshness: "month" },
    { provider: "google_trends", query: searchPhrase, freshness: "month" },
  ];
}

function classifyProviderFailure(provider: Provider, status: number): ProviderOutcomeStatus {
  if (status === 403) {
    return "blocked";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "upstream_failure";
  }
  if (provider === "google_trends" && status === 404) {
    return "upstream_failure";
  }
  return "parse_failure";
}

function providerLabel(provider: Provider) {
  switch (provider) {
    case "gdelt":
      return "GDELT";
    case "google_trends":
      return "Google Trends";
    case "rss":
      return "Google News RSS";
    case "reddit":
      return "Reddit";
    case "wikipedia":
      return "Wikipedia";
  }
}

function fallbackTitle(provider: Provider) {
  switch (provider) {
    case "gdelt":
      return "Recent event context";
    case "google_trends":
      return "Public attention signal";
    case "reddit":
      return "Public discourse signal";
    case "rss":
      return "Recent media framing";
    case "wikipedia":
      return "Background reference";
  }
}

function fallbackSource(provider: Provider, query: string, failureReason: string): RetrievedSource {
  return {
    id: `${provider}-fallback-${slugify(query)}`,
    provider,
    provenance: "fallback",
    title: fallbackTitle(provider),
    snippet: failureReason,
    failureReason,
    query,
    relevanceScore: 0.35,
    tags: ["fallback"],
    sourceName: providerLabel(provider),
  };
}

function xmlValue(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.trim();
}

function stripMarkup(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitItems(xml: string) {
  return xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
}

async function fetchJson(url: string, provider: Provider) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "tweenverse-memory-injection/2.0",
      accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const status = response.status;
    const label = providerLabel(provider);
    throw new Error(`${label} rejected the request (HTTP ${status}).`);
  }

  return response.json();
}

async function fetchText(url: string, provider: Provider, accept: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "tweenverse-memory-injection/2.0",
      accept,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const status = response.status;
    const label = providerLabel(provider);
    throw new Error(`${label} rejected the request (HTTP ${status}).`);
  }

  return response.text();
}

async function wikipediaSources(query: string) {
  const searchUrl = new URL("https://fr.wikipedia.org/w/api.php");
  searchUrl.searchParams.set("action", "query");
  searchUrl.searchParams.set("list", "search");
  searchUrl.searchParams.set("srsearch", query);
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("origin", "*");

  const searchData = (await fetchJson(searchUrl.toString(), "wikipedia")) as {
    query?: { search?: Array<{ title?: string }> };
  };
  const title = searchData.query?.search?.[0]?.title;
  if (!title) {
    return [] as RetrievedSource[];
  }

  const summaryUrl = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summary = (await fetchJson(summaryUrl, "wikipedia")) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };

  return [
    {
      id: `wikipedia-${slugify(summary.title ?? title)}`,
      provider: "wikipedia",
      provenance: "live",
      title: summary.title ?? title,
      snippet: summary.extract ?? "Wikipedia summary",
      url: summary.content_urls?.desktop?.page,
      sourceName: "Wikipedia",
      query,
      relevanceScore: 0.92,
      tags: ["background", "encyclopedic"],
    },
  ] satisfies RetrievedSource[];
}

async function rssSources(query: string) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "fr");
  url.searchParams.set("gl", "FR");
  url.searchParams.set("ceid", "FR:fr");

  const xml = await fetchText(url.toString(), "rss", "application/rss+xml,application/xml,text/xml,text/plain,*/*");
  return splitItems(xml).slice(0, 4).map((item, index) => {
    const rawTitle = stripMarkup(xmlValue(item, "title") ?? "Recent media framing");
    const parts = rawTitle.split(" - ");
    const title = parts.length > 1 ? parts.slice(0, -1).join(" - ") : rawTitle;
    const sourceName = parts.length > 1 ? parts.at(-1) ?? "Google News" : "Google News";
    let snippet = stripMarkup(xmlValue(item, "description") ?? "Recent media coverage related to the prompt.");
    if (normalizeText(snippet).startsWith(normalizeText(title))) {
      snippet = snippet.slice(title.length).replace(/^[\s:.\-–—]+/, "").trim();
    }

    return {
      id: `rss-${slugify(xmlValue(item, "link") ?? `${query}-${index}`)}`,
      provider: "rss",
      provenance: "live",
      title,
      snippet,
      url: xmlValue(item, "link"),
      publishedAt: xmlValue(item, "pubDate"),
      sourceName,
      query,
      relevanceScore: clamp(0.9 - index * 0.08, 0.5, 0.9),
      tags: ["news", "france"],
    } satisfies RetrievedSource;
  });
}

async function gdeltSources(query: string) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "5");
  url.searchParams.set("sort", "datedesc");
  url.searchParams.set("timespan", "30d");

  const data = (await fetchJson(url.toString(), "gdelt")) as {
    articles?: Array<{ title?: string; url?: string; seendate?: string; domain?: string; snippet?: string }>;
  };

  return (data.articles ?? []).slice(0, 5).map((article, index) => ({
    id: `gdelt-${slugify(article.url ?? article.title ?? `${query}-${index}`)}`,
    provider: "gdelt",
    provenance: "live",
    title: stripMarkup(article.title ?? query),
    snippet: stripMarkup(article.snippet ?? "Recent French event coverage."),
    url: article.url,
    publishedAt: article.seendate,
    sourceName: article.domain ?? "GDELT",
    query,
    relevanceScore: clamp(0.95 - index * 0.1, 0.45, 0.95),
    tags: ["news", "events"],
  })) satisfies RetrievedSource[];
}

async function redditSources(query: string) {
  const url = new URL("https://www.reddit.com/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("limit", "4");
  url.searchParams.set("t", "month");

  const data = (await fetchJson(url.toString(), "reddit")) as {
    data?: { children?: Array<{ data?: { title?: string; selftext?: string; permalink?: string; subreddit_name_prefixed?: string; created_utc?: number } }> };
  };

  return (data.data?.children ?? []).slice(0, 4).flatMap((entry, index) => {
    const post = entry.data;
    if (!post?.title) {
      return [];
    }
    return [
      {
        id: `reddit-${slugify(post.permalink ?? `${query}-${index}`)}`,
        provider: "reddit",
        provenance: "live",
        title: post.title,
        snippet: (post.selftext ?? "Recent public discussion related to the prompt.").slice(0, 220),
        url: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
        publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
        sourceName: post.subreddit_name_prefixed ?? "Reddit",
        query,
        relevanceScore: clamp(0.82 - index * 0.08, 0.4, 0.82),
        tags: ["public_discourse"],
      } satisfies RetrievedSource,
    ];
  });
}

function scoreOverlap(query: string, text: string) {
  const queryTokens = new Set(normalizeText(query).split(" "));
  const textTokens = new Set(normalizeText(text).split(" "));
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(queryTokens.size, 1);
}

async function googleTrendsSources(query: string) {
  const url = new URL("https://trends.google.com/trends/api/dailytrends");
  url.searchParams.set("hl", "fr");
  url.searchParams.set("geo", "FR");
  url.searchParams.set("ns", "15");

  const body = await fetchText(url.toString(), "google_trends", "application/json,text/plain,*/*");
  const data = JSON.parse(body.replace(/^\)\]\}',?\n/, "")) as {
    default?: { trendingSearchesDays?: Array<{ trendingSearches?: Array<{ title?: { query?: string }; formattedTraffic?: string; articles?: Array<{ title?: string }> }> }> };
  };
  const trends = data.default?.trendingSearchesDays?.flatMap((day) => day.trendingSearches ?? []) ?? [];
  const ranked = trends
    .map((trend, index) => ({
      trend,
      score: scoreOverlap(query, `${trend.title?.query ?? ""} ${trend.articles?.map((article) => article.title ?? "").join(" ")}`),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2);

  return ranked.flatMap(({ trend, score }, index) => {
    const title = trend.title?.query;
    if (!title || score <= 0) {
      return [];
    }
    return [
      {
        id: `google-trends-${slugify(title)}`,
        provider: "google_trends",
        provenance: "live",
        title: stripMarkup(title),
        snippet: stripMarkup(`Trending in France${trend.formattedTraffic ? ` · ${trend.formattedTraffic}` : ""}. ${trend.articles?.[0]?.title ?? "Current public attention signal."}`),
        sourceName: "Google Trends",
        query,
        relevanceScore: clamp(score - index * 0.05, 0.35, 0.78),
        tags: ["attention", "france"],
      } satisfies RetrievedSource,
    ];
  });
}

async function runProvider(provider: Provider, query: string): Promise<ProviderResult> {
  try {
    const sources =
      provider === "wikipedia"
        ? await wikipediaSources(query)
        : provider === "rss"
          ? await rssSources(query)
          : provider === "gdelt"
            ? await gdeltSources(query)
            : provider === "reddit"
              ? await redditSources(query)
              : await googleTrendsSources(query);

    if (sources.length === 0) {
      return {
        outcome: {
          provider,
          status: "no_relevant_results",
          query,
          sourceCount: 0,
          message:
            provider === "google_trends"
              ? "Google Trends returned no close trend overlap for this prompt in France."
              : `${providerLabel(provider)} returned no relevant results for this prompt.`,
          diagnostics: {},
        },
        sources: [fallbackSource(provider, query, provider === "google_trends" ? "Google Trends returned no close trend overlap for this prompt in France." : `${providerLabel(provider)} returned no relevant results for this prompt.`)],
      };
    }

    return {
      outcome: {
        provider,
        status: "success",
        query,
        sourceCount: sources.length,
        message: `${providerLabel(provider)} returned ${sources.length} live source${sources.length > 1 ? "s" : ""}.`,
        diagnostics: {},
      },
      sources,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusMatch = message.match(/HTTP (\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : undefined;
    const outcomeStatus = status ? classifyProviderFailure(provider, status) : "upstream_failure";

    return {
      outcome: {
        provider,
        status: outcomeStatus,
        query,
        sourceCount: 0,
        message,
        diagnostics: status ? { httpStatus: String(status) } : {},
      },
      sources: [fallbackSource(provider, query, message)],
    };
  }
}

export async function retrieveSources(input: MemoryInput) {
  const queries = buildQueries(input);
  const results = await Promise.all(queries.map((query) => runProvider(query.provider, query.query)));
  const sources = results
    .flatMap((result) => result.sources)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.title.localeCompare(b.title));

  return retrievalResultSchema.parse({
    searchPhrase: buildSearchPhrase(input.rawInput),
    outcomes: results.map((result) => result.outcome),
    sources,
  });
}
