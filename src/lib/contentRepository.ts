import {
  competitorFacts,
  eventBriefs,
  marketFacts,
  personas,
  questionBank,
  scenarios,
  sourceReferences,
} from "../data/mockData";
import type {
  CompetitorFact,
  DemoKind,
  EventBrief,
  MarketFact,
  Persona,
  QuestionBankEntry,
  Scenario,
  SourceReference,
} from "../types";
import {
  competitorFactSchema,
  eventBriefSchema,
  marketFactSchema,
  personaSchema,
  questionBankEntrySchema,
  scenarioSchema,
  sourceReferenceSchema,
} from "./schemas";

function validateCollection<T>(label: string, values: T[], schema: { parse: (value: unknown) => unknown }) {
  values.forEach((value, index) => {
    try {
      schema.parse(value);
    } catch (error) {
      throw new Error(`Invalid ${label} at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

validateCollection("source reference", sourceReferences, sourceReferenceSchema);
validateCollection("event brief", eventBriefs, eventBriefSchema);
validateCollection("question bank entry", questionBank, questionBankEntrySchema);
validateCollection("market fact", marketFacts, marketFactSchema);
validateCollection("competitor fact", competitorFacts, competitorFactSchema);
validateCollection("persona", personas, personaSchema);
validateCollection("scenario", scenarios, scenarioSchema);

const personaById = new Map(personas.map((persona) => [persona.id, persona]));

export function listSourceReferences(): SourceReference[] {
  return sourceReferences;
}

export function getSourceReferences(sourceIds: string[]): SourceReference[] {
  const ids = new Set(sourceIds);
  return sourceReferences.filter((source) => ids.has(source.id));
}

export function listEventBriefs(demo: DemoKind): EventBrief[] {
  return eventBriefs.filter((entry) => entry.demo === demo);
}

export function listQuestionBankEntries(demo: DemoKind): QuestionBankEntry[] {
  return questionBank.filter((entry) => entry.demo === demo);
}

export function getQuestionBankEntry(questionBankId: string): QuestionBankEntry {
  const question = questionBank.find((entry) => entry.id === questionBankId);

  if (!question) {
    throw new Error(`Missing question bank entry for ${questionBankId}`);
  }

  return question;
}

export function listMarketFacts(demo: DemoKind): MarketFact[] {
  return marketFacts.filter((entry) => entry.demo === demo);
}

export function listCompetitorFacts(demo: DemoKind): CompetitorFact[] {
  if (demo === "opinion") {
    return [];
  }

  const category = demo === "retail" ? "Subscription commerce" : "Back-office automation";
  return competitorFacts.filter((entry) => entry.category === category);
}

export function listPersonas(): Persona[] {
  return personas;
}

export function getPersona(personaId: string): Persona {
  const persona = personaById.get(personaId);

  if (!persona) {
    throw new Error(`Unknown persona ${personaId}`);
  }

  return persona;
}

export function getScenario(demo: DemoKind): Scenario {
  const scenario = scenarios.find((entry) => entry.demo === demo);

  if (!scenario) {
    throw new Error(`Missing scenario for demo ${demo}`);
  }

  return scenario;
}
