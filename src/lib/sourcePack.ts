import { listEventBriefs, listQuestionBankEntries, listSourceReferences } from "./contentRepository";
import type { DemoKind, EventBrief, Freshness, QuestionBankEntry, SourceReference } from "../types";

const freshnessRank: Record<Freshness, number> = {
  "updated today": 3,
  "updated this week": 2,
  stale: 1,
};

export interface SourcePack {
  demo: DemoKind;
  questionBank: QuestionBankEntry[];
  eventBriefs: EventBrief[];
  sources: SourceReference[];
  freshness: Freshness;
}

function collectSourceIds(questionEntries: QuestionBankEntry[], briefs: EventBrief[]) {
  const sourceIds = new Set<string>();

  questionEntries.forEach((entry) => entry.sourceIds.forEach((id) => sourceIds.add(id)));
  briefs.forEach((entry) => entry.sourceIds.forEach((id) => sourceIds.add(id)));

  return sourceIds;
}

function matchesAnyTag(candidateTags: string[], requestedTags: string[]) {
  return candidateTags.some((tag) => requestedTags.includes(tag.toLowerCase()));
}

export function getSourcePack(demo: DemoKind): SourcePack {
  const demoQuestions = listQuestionBankEntries(demo);
  const demoBriefs = listEventBriefs(demo);
  const sourceIds = collectSourceIds(demoQuestions, demoBriefs);
  const sources = listSourceReferences().filter((source) => sourceIds.has(source.id));
  const freshness = demoBriefs.reduce<Freshness>(
    (current, brief) =>
      freshnessRank[brief.freshness] > freshnessRank[current] ? brief.freshness : current,
    "stale",
  );

  return {
    demo,
    questionBank: demoQuestions,
    eventBriefs: demoBriefs,
    sources,
    freshness,
  };
}

export function searchSourcePack(demo: DemoKind, tags: string[]) {
  const pack = getSourcePack(demo);
  const normalized = tags.map((tag) => tag.toLowerCase());

  const matchedBriefs = pack.eventBriefs.filter((brief) => matchesAnyTag(brief.tags, normalized));
  const matchedSourceIds = new Set(matchedBriefs.flatMap((brief) => brief.sourceIds));

  const matchedSources = pack.sources.filter((source) =>
    matchesAnyTag(source.tags, normalized) || matchedSourceIds.has(source.id),
  );

  return {
    ...pack,
    eventBriefs: matchedBriefs.length > 0 ? matchedBriefs : pack.eventBriefs,
    sources: matchedSources.length > 0 ? matchedSources : pack.sources,
  };
}
