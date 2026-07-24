import "server-only";

import type {
  LabInput,
  Provider,
  ProviderDecision,
  ProviderOutcome,
  ProviderOutcomeStatus,
  RetrievedSource,
  RetrievalPlan,
} from "../../lib/labSchemas";
import { retrievalResultSchema } from "../../lib/labSchemas";
import { logLabRun } from "./logging";

type ProviderResult = {
  outcome: ProviderOutcome;
  sources: RetrievedSource[];
};

type QueryPlan = ProviderDecision[];

const searchStopwords = new Set(["faut", "pour", "avec", "dans", "contre", "entre", "question", "article", "france", "craignez", "leurs", "perdent", "devons", "doit"]);
const genericInstitutionalTerms = new Set(["france", "francais", "francaise", "francaises", "politique", "politiques", "public", "publique", "moyen", "moyens", "lutte", "service", "services"]);
const PROVIDER_TIMEOUT_MS = 8_000;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 36);
}

/**
 * Provider URLs, particularly Google News RSS redirects, often share a long
 * prefix. Keep a short readable prefix, but use a hash of the full canonical
 * value as the identity so separate articles cannot collapse into one ID.
 */
function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function sourceId(provider: Provider, identity: string) {
  const readablePart = slugify(identity).slice(0, 24) || "source";
  return `${provider}-${readablePart}-${stableHash(identity)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchPhrase(input: string) {
  const keywords = input
    .match(/[a-zà-ÿ]{4,}/gi)
    ?.map((token) => normalizeText(token))
    .filter((token) => !searchStopwords.has(token))
    .flatMap((token) => (token === "ia" ? ["intelligence", "artificielle"] : [token]))
    .slice(0, 7) ?? [];

  return keywords.length > 0 ? keywords.join(" ") : input;
}

function comparableToken(token: string) {
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function inputTerms(input: string) {
  return normalizeText(input)
    .split(" ")
    .filter((token) => token.length >= 4 && !searchStopwords.has(token))
    .slice(0, 8);
}

function providerDecision(provider: Provider, query: string, reason: string, triggeredBy: string[], confidence: number): ProviderDecision {
  return {
    provider,
    query,
    segmentIds: [],
    reason,
    triggeredBy,
    confidence,
  };
}

export function buildRetrievalPlan(input: LabInput): RetrievalPlan {
  const searchPhrase = buildSearchPhrase(input.rawInput);
  const terms = inputTerms(input.rawInput);
  const triggerTerms = terms.length > 0 ? terms.slice(0, 4) : [searchPhrase];
  const promptKind = input.inputType.replace("_", " ");
  const decisions: ProviderDecision[] = [
    providerDecision(
      "wikipedia",
      searchPhrase,
      "Stable background context.",
      ["search phrase", promptKind],
      0.72,
    ),
    providerDecision(
      "rss",
      searchPhrase,
      "Recent media framing.",
      triggerTerms,
      0.82,
    ),
    providerDecision(
      "reddit",
      searchPhrase,
      "Public discourse framing.",
      triggerTerms,
      0.58,
    ),
    providerDecision(
      "vie_publique",
      searchPhrase,
      "Official policy context.",
      triggerTerms,
      0.76,
    ),
    providerDecision(
      "data_gouv",
      searchPhrase,
      "Official dataset context.",
      triggerTerms,
      0.74,
    ),
  ];

  return {
    inputTerms: terms.length > 0 ? terms : [searchPhrase],
    providerDecisions: decisions,
    skippedProviders: [],
    queryVariants: Array.from(new Set(decisions.map((decision) => decision.query))),
  };
}

export function buildQueries(input: LabInput): QueryPlan {
  return buildRetrievalPlan(input).providerDecisions;
}

class ProviderResponseParseError extends Error {
  constructor(provider: Provider, responseType: "json" | "text", cause?: unknown) {
    super(`${providerLabel(provider)} returned an unreadable ${responseType} payload.`);
    this.name = "ProviderResponseParseError";
    this.cause = cause;
  }
}

function classifyProviderFailure(status: number): ProviderOutcomeStatus {
  if (status === 403) {
    return "blocked";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "upstream_failure";
  }
  return "upstream_failure";
}

function providerLabel(provider: Provider) {
  switch (provider) {
    case "data_gouv":
      return "data.gouv.fr";
    case "rss":
      return "Google News RSS";
    case "reddit":
      return "Reddit";
    case "vie_publique":
      return "Vie publique";
    case "wikipedia":
      return "Wikipedia";
  }
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

function publishedTime(value?: string) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function recencyScore(publishedAt?: string) {
  const timestamp = publishedTime(publishedAt);
  if (!timestamp) {
    return 0;
  }

  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 3) {
    return 0.08;
  }
  if (ageDays <= 14) {
    return 0.05;
  }
  if (ageDays <= 45) {
    return 0.02;
  }
  return 0;
}

function overlapScore(query: string, text: string) {
  const queryTokens = new Set(normalizeText(query).split(" ").filter(Boolean).map(comparableToken));
  const textTokens = new Set(normalizeText(text).split(" ").filter(Boolean).map(comparableToken));
  let overlap = 0;

  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(queryTokens.size, 1);
}

function hasDistinctiveQueryMatch(query: string, text: string) {
  const textTokens = new Set(normalizeText(text).split(" ").filter(Boolean).map(comparableToken));
  return normalizeText(query)
    .split(" ")
    .map(comparableToken)
    .some((term) => term.length >= 7 && !genericInstitutionalTerms.has(term) && textTokens.has(term));
}

function officialScore(query: string, text: string, publishedAt: string | undefined, boost: number) {
  return clamp(boost + overlapScore(query, text) * 0.42 + recencyScore(publishedAt), 0.35, 0.96);
}

class ProviderTimeoutError extends Error {
  constructor(provider: Provider) {
    super(`${providerLabel(provider)} did not respond within ${PROVIDER_TIMEOUT_MS / 1_000} seconds.`);
    this.name = "ProviderTimeoutError";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, provider: Provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderTimeoutError(provider);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, provider: Provider) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "tweenverse-lab/2.0",
      accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  }, provider);

  if (!response.ok) {
    const status = response.status;
    const label = providerLabel(provider);
    throw new Error(`${label} rejected the request (HTTP ${status}).`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new ProviderResponseParseError(provider, "json", error);
  }
}

async function fetchText(url: string, provider: Provider, accept: string) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "user-agent": "tweenverse-lab/2.0",
      accept,
    },
    cache: "no-store",
  }, provider);

  if (!response.ok) {
    const status = response.status;
    const label = providerLabel(provider);
    throw new Error(`${label} rejected the request (HTTP ${status}).`);
  }

  try {
    return await response.text();
  } catch (error) {
    throw new ProviderResponseParseError(provider, "text", error);
  }
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
      id: sourceId("wikipedia", summary.content_urls?.desktop?.page ?? summary.title ?? title),
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
      id: sourceId("rss", xmlValue(item, "link") ?? `${query}:${title}:${xmlValue(item, "pubDate") ?? index}`),
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
        id: sourceId("reddit", post.permalink ?? `${query}:${post.title}:${post.created_utc ?? index}`),
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

async function viePubliqueSources(query: string) {
  const xml = await fetchText(
    "https://www.vie-publique.fr/actualites-feeds.xml",
    "vie_publique",
    "application/rss+xml,application/xml,text/xml,text/plain,*/*",
  );

  return splitItems(xml)
    .map((item, index) => {
      const title = stripMarkup(xmlValue(item, "title") ?? "Official policy context");
      const snippet = stripMarkup(xmlValue(item, "description") ?? "Recent official public-policy publication.");
      const url = xmlValue(item, "link");
      const publishedAt = xmlValue(item, "pubDate");
      const relevanceScore = officialScore(query, `${title} ${snippet}`, publishedAt, 0.52) - index * 0.03;

      return {
        id: sourceId("vie_publique", url ?? `${query}:${title}:${publishedAt ?? index}`),
        provider: "vie_publique",
        provenance: "live",
        title,
        snippet,
        url,
        publishedAt,
        sourceName: "Vie publique",
        query,
        relevanceScore: clamp(relevanceScore, 0.35, 0.94),
        tags: ["official", "policy", "france"],
      } satisfies RetrievedSource;
    })
    .filter((source) => hasDistinctiveQueryMatch(query, `${source.title} ${source.snippet}`))
    .sort((a, b) => b.relevanceScore - a.relevanceScore || publishedTime(b.publishedAt) - publishedTime(a.publishedAt))
    .slice(0, 3);
}

async function dataGouvSources(query: string) {
  const url = new URL("https://www.data.gouv.fr/api/1/datasets/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "6");

  const data = (await fetchJson(url.toString(), "data_gouv")) as {
    data?: Array<{
      title?: string;
      page?: string;
      description?: string;
      last_update?: string;
      organization?: { name?: string };
      tags?: string[];
    }>;
  };

  return (data.data ?? [])
    .map((dataset, index) => {
      const title = stripMarkup(dataset.title ?? "Official dataset context");
      const snippet = stripMarkup(dataset.description ?? "Relevant open dataset published on data.gouv.fr.");
      const publishedAt = dataset.last_update;
      const relevanceScore = officialScore(query, `${title} ${snippet} ${(dataset.tags ?? []).join(" ")}`, publishedAt, 0.48) - index * 0.03;

      return {
        id: sourceId("data_gouv", dataset.page ?? `${query}:${title}:${publishedAt ?? index}`),
        provider: "data_gouv",
        provenance: "live",
        title,
        snippet,
        url: dataset.page,
        publishedAt,
        sourceName: dataset.organization?.name ?? "data.gouv.fr",
        query,
        relevanceScore: clamp(relevanceScore, 0.35, 0.93),
        tags: ["official", "data", "france", ...(dataset.tags ?? []).slice(0, 3)],
      } satisfies RetrievedSource;
    })
    .filter((source) => overlapScore(query, `${source.title} ${source.snippet} ${source.tags.join(" ")}`) >= 0.16)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || publishedTime(b.publishedAt) - publishedTime(a.publishedAt))
    .slice(0, 3);
}

async function runProvider(provider: Provider, query: string, options?: { runId?: string; segmentCount?: number }): Promise<ProviderResult> {
  if (options?.runId) {
    logLabRun(options.runId, "source-provider-start", {
      provider,
      queryCharacters: query.length,
      plannedSegments: options.segmentCount,
    });
  }
  try {
    const sources =
      provider === "wikipedia"
        ? await wikipediaSources(query)
        : provider === "rss"
          ? await rssSources(query)
          : provider === "reddit"
            ? await redditSources(query)
            : provider === "vie_publique"
              ? await viePubliqueSources(query)
              : await dataGouvSources(query);

    if (sources.length === 0) {
      const noResultsMessage =
        provider === "vie_publique"
          ? "Vie publique returned no recent official policy result that clearly matched this prompt."
          : provider === "data_gouv"
            ? "data.gouv.fr returned no relevant official dataset result for this prompt."
            : `${providerLabel(provider)} returned no results for this query.`;

      const result: ProviderResult = {
        outcome: {
          provider,
          status: "no_relevant_results",
          query,
          sourceCount: 0,
          message: noResultsMessage,
          diagnostics: {},
        },
        sources: [],
      };
      if (options?.runId) logLabRun(options.runId, "source-provider-complete", { provider, status: result.outcome.status, sources: 0 });
      return result;
    }

    const result: ProviderResult = {
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
    if (options?.runId) logLabRun(options.runId, "source-provider-complete", { provider, status: result.outcome.status, sources: sources.length });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusMatch = message.match(/HTTP (\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : undefined;
    const outcomeStatus =
      error instanceof ProviderResponseParseError ? "parse_failure" : status ? classifyProviderFailure(status) : "upstream_failure";

    const result: ProviderResult = {
      outcome: {
        provider,
        status: outcomeStatus,
        query,
        sourceCount: 0,
        message,
        diagnostics: status ? { httpStatus: String(status) } : {},
      },
      sources: [],
    };
    if (options?.runId) logLabRun(options.runId, "source-provider-complete", { provider, status: outcomeStatus, sources: 0, httpStatus: status });
    return result;
  }
}

export async function retrieveSources(input: LabInput, suppliedPlan?: RetrievalPlan, options?: { runId?: string }) {
  const plan = suppliedPlan ?? buildRetrievalPlan(input);
  const queries = plan.providerDecisions;
  if (options?.runId) {
    logLabRun(options.runId, "source-retrieval-start", {
      tasks: queries.length,
      providers: Array.from(new Set(queries.map((query) => query.provider))).join(","),
    });
  }
  const results = await Promise.all(queries.map((query) => runProvider(query.provider, query.query, { runId: options?.runId, segmentCount: query.segmentIds.length })));
  const decisionByProviderAndQuery = new Map(
    queries.map((decision) => [`${decision.provider}:${decision.query}`, decision]),
  );
  const sourcesById = new Map<string, RetrievedSource>();
  for (const source of results.flatMap((result) => result.sources)) {
    const plannedSegmentIds = decisionByProviderAndQuery.get(`${source.provider}:${source.query}`)?.segmentIds ?? [];
    const existing = sourcesById.get(source.id);
    if (!existing) {
      sourcesById.set(source.id, { ...source, intendedSegmentIds: plannedSegmentIds });
      continue;
    }

    // A provider can repeat the same article, or two planned searches can find
    // it. Present one item and retain the union of its intended audiences.
    const intendedSegmentIds = Array.from(new Set([
      ...(existing.intendedSegmentIds ?? []),
      ...plannedSegmentIds,
    ]));
    sourcesById.set(source.id, {
      ...(source.relevanceScore > existing.relevanceScore ? source : existing),
      intendedSegmentIds,
    });
  }
  const sources = Array.from(sourcesById.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.title.localeCompare(b.title));

  const retrieval = retrievalResultSchema.parse({
    searchPhrase: buildSearchPhrase(input.rawInput),
    plan,
    outcomes: results.map((result) => result.outcome),
    sources,
  });
  if (options?.runId) {
    logLabRun(options.runId, "source-retrieval-complete", {
      sources: retrieval.sources.length,
      successfulProviders: retrieval.outcomes.filter((outcome) => outcome.status === "success").length,
      unsuccessfulProviders: retrieval.outcomes.filter((outcome) => outcome.status !== "success").length,
    });
  }
  return retrieval;
}
