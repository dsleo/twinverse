export type DemoKind = "opinion" | "retail" | "b2b";

export type SourceKind = "institution" | "pollster" | "media";

export type Freshness = "updated today" | "updated this week" | "stale";

export interface SourceReference {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  kind: SourceKind;
  geography: string;
  summary: string;
  snippet: string;
  tags: string[];
  affectedSegments: string[];
  confidence: number;
}

export interface EventBrief {
  id: string;
  title: string;
  summary: string;
  demo: DemoKind;
  tags: string[];
  freshness: Freshness;
  sourceIds: string[];
}

export interface QuestionBankEntry {
  id: string;
  demo: DemoKind;
  theme: string;
  canonicalQuestion: string;
  normalizedTemplate: string;
  answerMode:
    | "support_oppose"
    | "priority_ranking"
    | "concern"
    | "personal_impact"
    | "national_impact"
    | "adoption_intent"
    | "willingness_to_pay"
    | "buying_committee";
  sourceIds: string[];
}

export interface MarketFact {
  id: string;
  demo: DemoKind;
  fact: string;
  signal: "tailwind" | "headwind" | "neutral";
  sourceIds: string[];
}

export interface CompetitorFact {
  id: string;
  category: string;
  insight: string;
  sourceIds: string[];
}

export interface Persona {
  id: string;
  name: string;
  age: number;
  city: string;
  region: string;
  occupation: string;
  household: string;
  economicPosture: string;
  traits: string[];
  concerns: string[];
}

export interface Scenario {
  id: string;
  demo: DemoKind;
  title: string;
  description: string;
  tags: string[];
  targetSegments: string[];
  questionBankId: string;
}

export interface ScenarioVariant {
  id: string;
  demo: DemoKind;
  label: string;
  description: string;
  supportDelta: number;
  opposeDelta: number;
  narrative: string;
  responseShift: string;
}

export interface ScenarioPacket {
  scenario: Scenario;
  question: QuestionBankEntry;
  eventBriefs: EventBrief[];
  sources: SourceReference[];
  freshness: Freshness;
}

export interface PersonaResponse {
  personaId: string;
  baselinePreference: string;
  effectOfRecentEvents: string;
  finalAnswer: string;
  confidence: number;
  evidenceReferences: string[];
}

export interface SegmentAggregation {
  label: string;
  support: number;
  oppose: number;
  undecided: number;
}

export interface SimulationResult {
  packet: ScenarioPacket;
  responses: PersonaResponse[];
  segments: SegmentAggregation[];
  narrative: string;
  summary: string;
  activeVariant: ScenarioVariant;
}
