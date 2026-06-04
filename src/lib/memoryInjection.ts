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
    segments,
    globalRationale:
      "The panel is divided into five audience clusters using the dataset personas' occupation, age, and household patterns.",
  };
}

function buildRetrievalPlan(input: MemoryInjectionInput, populationMap: ReturnType<typeof buildPopulationMap>) {
  const text = input.rawInput.toLowerCase();
  const entities = Array.from(new Set(text.match(/[a-zà-ÿ]{4,}/g)?.slice(0, 6) ?? ["france"]));
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
      query: entities[0] ?? "france",
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
      query: entities[0] ?? "france",
      freshness: "month",
      purpose: "Public discourse signal",
    },
  ];
  if (populationMap.segments.length > 3) {
    queries.push({
      provider: "google_trends",
      query: entities[0] ?? "france",
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

async function fetchSyntheticSource(query: RetrievalQuery, queryIndex: number): Promise<RetrievedSource[]> {
  return [
    {
      id: `${query.provider}-${queryIndex + 1}-a`,
      provider: query.provider,
      provenance: "fallback",
      title: `${query.provider.toUpperCase()} result for ${query.query}`,
      snippet: `Synthetic ${query.provider} signal related to ${query.purpose.toLowerCase()}.`,
      url: `https://example.com/${slugify(query.query)}/${query.provider}`,
      publishedAt: new Date().toISOString(),
      sourceName: query.provider,
      query: query.query,
      relevanceScore: clamp(0.78 - queryIndex * 0.05, 0.4, 0.95),
      tags: [query.freshness, query.provider, "synthetic"],
    },
  ];
}

async function buildRetrievedSources(plan: ReturnType<typeof buildRetrievalPlan>): Promise<RetrievedSource[]> {
  const allSources = await Promise.all(
    plan.queries.map(async (query, queryIndex) => {
      try {
        if (query.provider === "gdelt") {
          return await fetchGdeltSources(query);
        }
        if (query.provider === "rss") {
          const figaro = await fetchLeFigaroQuestionDuJour(query);
          if (figaro.length > 0) {
            return figaro;
          }
        }
      } catch {
        // fall back below
      }
      return fetchSyntheticSource(query, queryIndex);
    }),
  );
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
    overallPattern: "Audience context changes interpretation more than the raw input itself.",
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
