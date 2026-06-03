import { z } from "zod";

export const demoKindSchema = z.enum(["opinion", "retail", "b2b"]);
export const sourceKindSchema = z.enum(["institution", "pollster", "media"]);
export const freshnessSchema = z.enum(["updated today", "updated this week", "stale"]);

export const sourceReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string().url(),
  publishedAt: z.string(),
  kind: sourceKindSchema,
  geography: z.string(),
  summary: z.string(),
  snippet: z.string(),
  tags: z.array(z.string()),
  affectedSegments: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const eventBriefSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  demo: demoKindSchema,
  tags: z.array(z.string()),
  freshness: freshnessSchema,
  sourceIds: z.array(z.string()),
});

export const questionBankEntrySchema = z.object({
  id: z.string(),
  demo: demoKindSchema,
  theme: z.string(),
  canonicalQuestion: z.string(),
  normalizedTemplate: z.string(),
  answerMode: z.enum([
    "support_oppose",
    "priority_ranking",
    "concern",
    "personal_impact",
    "national_impact",
    "adoption_intent",
    "willingness_to_pay",
    "buying_committee",
  ]),
  sourceIds: z.array(z.string()),
});

export const marketFactSchema = z.object({
  id: z.string(),
  demo: demoKindSchema,
  fact: z.string(),
  signal: z.enum(["tailwind", "headwind", "neutral"]),
  sourceIds: z.array(z.string()),
});

export const competitorFactSchema = z.object({
  id: z.string(),
  category: z.string(),
  insight: z.string(),
  sourceIds: z.array(z.string()),
});

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int().positive(),
  city: z.string(),
  region: z.string(),
  occupation: z.string(),
  household: z.string(),
  economicPosture: z.string(),
  traits: z.array(z.string()),
  concerns: z.array(z.string()).min(2),
});

export const scenarioSchema = z.object({
  id: z.string(),
  demo: demoKindSchema,
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).min(1),
  targetSegments: z.array(z.string()),
  questionBankId: z.string(),
});
