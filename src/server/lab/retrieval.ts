import "server-only";

import type {
  EvidenceClaim,
  LabInput,
  Provider,
  ProviderDecision,
  ProviderOutcome,
  ProviderOutcomeStatus,
  RetrievedSource,
  RetrievalPlan,
  RetrievalResult,
  SourceSelectionExplanation,
} from "../../lib/labSchemas";
import { retrievalResultSchema } from "../../lib/labSchemas";

type ProviderResult = {
  outcome: ProviderOutcome;
  sources: RetrievedSource[];
};

type QueryPlan = ProviderDecision[];

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
    .slice(0, 5) ?? [];

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
      input.rawInput,
      "Adds stable background context so the model does not reason from a bare prompt.",
      ["prompt", promptKind],
      0.72,
    ),
    providerDecision(
      "rss",
      searchPhrase,
      "Checks recent media framing around the prompt and captures how the topic is being narrated now.",
      triggerTerms,
      0.82,
    ),
    providerDecision(
      "reddit",
      searchPhrase,
      "Samples public-discourse language and objections; it is useful for framing, not representativeness.",
      triggerTerms,
      0.58,
    ),
    providerDecision(
      "vie_publique",
      searchPhrase,
      "Looks for official French public-policy context when the prompt may involve institutions, regulation, or public services.",
      triggerTerms,
      0.76,
    ),
    providerDecision(
      "data_gouv",
      searchPhrase,
      "Looks for official datasets that can ground the topic in public data rather than commentary alone.",
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

function fallbackTitle(provider: Provider) {
  switch (provider) {
    case "data_gouv":
      return "Official dataset context";
    case "reddit":
      return "Public discourse signal";
    case "rss":
      return "Recent media framing";
    case "vie_publique":
      return "Official policy context";
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

function officialScore(query: string, text: string, publishedAt: string | undefined, boost: number) {
  return clamp(boost + overlapScore(query, text) * 0.42 + recencyScore(publishedAt), 0.35, 0.96);
}

function authorityScore(source: RetrievedSource) {
  if (source.provider === "vie_publique" || source.provider === "data_gouv") {
    return 0.95;
  }
  if (source.provider === "wikipedia") {
    return 0.72;
  }
  if (source.provider === "rss") {
    return 0.64;
  }
  return 0.38;
}

function supportLabel(source: RetrievedSource) {
  if (source.provenance === "fallback") {
    return "Retrieval limitation and caveat";
  }
  if (source.provider === "vie_publique" || source.provider === "data_gouv") {
    return "Observed official context";
  }
  if (source.provider === "rss") {
    return "Observed media framing";
  }
  if (source.provider === "reddit") {
    return "Observed public-discourse language";
  }
  return "Observed background context";
}

function sourceLimitations(source: RetrievedSource) {
  const limitations: string[] = [];
  if (source.provenance === "fallback") {
    limitations.push(source.failureReason ?? "Fallback context was used because the provider did not return a live usable source.");
  }
  if (source.provider === "reddit") {
    limitations.push("Public-discourse signal, not representative evidence.");
  }
  if (source.provider === "rss") {
    limitations.push("Media framing signal; freshness and editorial angle may affect salience.");
  }
  if (source.provider === "wikipedia") {
    limitations.push("Background reference, not a current measurement.");
  }
  if (!source.publishedAt && source.provenance === "live") {
    limitations.push("No publication date was available from the provider.");
  }
  return limitations;
}

function explainSourceSelection(source: RetrievedSource): SourceSelectionExplanation {
  const relevance = source.relevanceScore;
  const recency = recencyScore(source.publishedAt);
  const authority = authorityScore(source);
  const fallbackPenalty = source.provenance === "fallback" ? 0.65 : 0;
  const selectedBecause = [
    source.provenance === "live"
      ? `Matched the query "${source.query}" with a relevance score of ${Math.round(source.relevanceScore * 100)}%.`
      : "Included as a fallback so the run keeps an explicit record of missing or failed retrieval.",
  ];

  if (authority >= 0.9) {
    selectedBecause.push("Official source with high provenance value.");
  } else if (source.provider === "reddit") {
    selectedBecause.push("Useful for public language, objections, and framing signals.");
  } else if (source.provider === "rss") {
    selectedBecause.push("Useful for current media salience.");
  }

  return {
    sourceId: source.id,
    scoreBreakdown: {
      relevance,
      recency,
      authority,
      fallbackPenalty,
    },
    selectedBecause,
    limitations: sourceLimitations(source),
    supports: [supportLabel(source)],
  };
}

function buildEvidenceClaims(sources: RetrievedSource[]): EvidenceClaim[] {
  return sources.slice(0, 8).map((source) => ({
    id: `claim-${source.id}`,
    claimType: "observed",
    text:
      source.provenance === "live"
        ? `${source.title} was retrieved as ${supportLabel(source).toLowerCase()}.`
        : `${source.sourceName ?? source.provider} did not provide a live source and contributed a retrieval caveat.`,
    sourceIds: [source.id],
    runArtifactIds: [],
    confidence: source.provenance === "live" ? clamp(source.relevanceScore * authorityScore(source), 0.2, 0.95) : 0.25,
  }));
}

async function fetchJson(url: string, provider: Provider) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "tweenverse-lab/2.0",
      accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });

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
  const response = await fetch(url, {
    headers: {
      "user-agent": "tweenverse-lab/2.0",
      accept,
    },
    cache: "no-store",
  });

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
        id: `vie-publique-${slugify(url ?? title)}`,
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
    .filter((source) => overlapScore(query, `${source.title} ${source.snippet}`) >= 0.2)
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
        id: `data-gouv-${slugify(dataset.page ?? title)}`,
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

async function runProvider(provider: Provider, query: string): Promise<ProviderResult> {
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
            : `${providerLabel(provider)} returned no relevant results for this prompt.`;

      return {
        outcome: {
          provider,
          status: "no_relevant_results",
          query,
          sourceCount: 0,
          message: noResultsMessage,
          diagnostics: {},
        },
        sources: [fallbackSource(provider, query, noResultsMessage)],
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
    const outcomeStatus =
      error instanceof ProviderResponseParseError ? "parse_failure" : status ? classifyProviderFailure(status) : "upstream_failure";

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

export async function retrieveSources(input: LabInput) {
  const plan = buildRetrievalPlan(input);
  const queries = plan.providerDecisions;
  const results = await Promise.all(queries.map((query) => runProvider(query.provider, query.query)));
  const sources = results
    .flatMap((result) => result.sources)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.title.localeCompare(b.title));

  return retrievalResultSchema.parse({
    searchPhrase: buildSearchPhrase(input.rawInput),
    plan,
    outcomes: results.map((result) => result.outcome),
    sources,
    sourceExplanations: sources.map(explainSourceSelection),
    evidenceClaims: buildEvidenceClaims(sources),
  });
}
