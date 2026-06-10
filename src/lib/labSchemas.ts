import { z } from "zod";

export const inputTypeSchema = z.enum(["question", "article", "proposal", "speech", "poll_question", "other"]);
export type InputType = z.infer<typeof inputTypeSchema>;

export const runModeSchema = z.enum(["manual", "le_figaro_daily", "tv_audience_daily"]);
export type RunMode = z.infer<typeof runModeSchema>;

export const audiencePresetSchema = z.enum(["france_general", "le_figaro_reader", "france_tv_viewer"]);
export type AudiencePreset = z.infer<typeof audiencePresetSchema>;

export const providerSchema = z.enum(["wikipedia", "rss", "reddit", "vie_publique", "data_gouv"]);
export type Provider = z.infer<typeof providerSchema>;

export const stageIdSchema = z.enum([
  "population_mapping",
  "retrieval",
  "context_packs",
  "persona_reactions",
  "divergence_report",
  "tv_schedule_ingestion",
  "tv_panel_loading",
  "tv_preference_elicitation",
  "tv_vote_aggregation",
  "tv_evaluation",
]);
export type StageId = z.infer<typeof stageIdSchema>;

export const stageStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type StageStatus = z.infer<typeof stageStatusSchema>;

export const providerOutcomeStatusSchema = z.enum([
  "success",
  "no_relevant_results",
  "rate_limited",
  "blocked",
  "upstream_failure",
  "parse_failure",
]);
export type ProviderOutcomeStatus = z.infer<typeof providerOutcomeStatusSchema>;

export const provenanceSchema = z.enum(["live", "fallback"]);
export type Provenance = z.infer<typeof provenanceSchema>;

export const scalarMetadataFamilySchema = z.enum([
  "life_stage",
  "household_type",
  "employment_class",
  "income_posture",
  "housing_status",
  "mobility_profile",
  "urbanicity",
  "region_family",
  "public_service_dependency",
]);
export type ScalarMetadataFamily = z.infer<typeof scalarMetadataFamilySchema>;

export const vectorMetadataFamilySchema = z.enum([
  "policy_exposure_tags",
  "economic_vulnerability_tags",
  "trust_orientation_tags",
  "issue_salience_tags",
]);
export type VectorMetadataFamily = z.infer<typeof vectorMetadataFamilySchema>;

export const metadataTagFilterSchema = z.object({
  family: z.union([scalarMetadataFamilySchema, vectorMetadataFamilySchema]),
  values: z.array(z.string().min(1)).min(1),
});
export type MetadataTagFilter = z.infer<typeof metadataTagFilterSchema>;

export const rankingSignalSchema = z.object({
  family: z.union([scalarMetadataFamilySchema, vectorMetadataFamilySchema]),
  values: z.array(z.string().min(1)).min(1),
  weight: z.number().positive().max(3).nullable(),
});
export type RankingSignal = z.infer<typeof rankingSignalSchema>;

export const personaAssignmentMetadataSchema = z.object({
  life_stage: z.string().min(1),
  household_type: z.string().min(1),
  employment_class: z.string().min(1),
  income_posture: z.string().min(1),
  housing_status: z.string().min(1),
  mobility_profile: z.string().min(1),
  urbanicity: z.string().min(1),
  region_family: z.string().min(1),
  public_service_dependency: z.string().min(1),
  policy_exposure_tags: z.array(z.string().min(1)).min(1),
  economic_vulnerability_tags: z.array(z.string().min(1)).min(1),
  trust_orientation_tags: z.array(z.string().min(1)).min(1),
  issue_salience_tags: z.array(z.string().min(1)).min(1),
});
export type PersonaAssignmentMetadata = z.infer<typeof personaAssignmentMetadataSchema>;

export const normalizedPersonaSchema = z.object({
  id: z.string().min(1),
  sourceRowId: z.string().min(1),
  sourceDataset: z.string().min(1),
  sourceSampleVersion: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().min(18).max(100),
  city: z.string().min(1),
  region: z.string().min(1),
  occupation: z.string().min(1),
  household: z.string().min(1),
  economicPosture: z.string().min(1),
  housingStatus: z.string().min(1),
  mobilityProfile: z.string().min(1),
  urbanicity: z.string().min(1),
  traits: z.array(z.string()),
  concerns: z.array(z.string()),
  profileNarrative: z.string().min(1),
  assignmentMetadata: personaAssignmentMetadataSchema,
  tvPreferenceDescription: z.string().default(""),
});
export type NormalizedPersona = z.infer<typeof normalizedPersonaSchema>;

export const personaCacheSchema = z.object({
  dataset: z.literal("nvidia/Nemotron-Personas-France"),
  fetchedAt: z.string().datetime(),
  sampleVersion: z.string().min(1),
  sampleSize: z.number().int().positive(),
  personas: z.array(normalizedPersonaSchema).min(1),
});
export type PersonaCache = z.infer<typeof personaCacheSchema>;

export const tvScheduleItemSchema = z.object({
  channel: z.string().min(1),
  programName: z.string().min(1),
  genre: z.string().min(1),
  timeSlot: z.string().min(1),
  durationMinutes: z.number().int().positive().nullable(),
  actualShare: z.number().min(0).max(100).optional(),
  channelLogoUrl: z.string().url().optional(),
  isFootballMatch: z.boolean().default(false),
  isHoliday: z.boolean().default(false),
});
export type TVScheduleItem = z.infer<typeof tvScheduleItemSchema>;

export const personaViewingChoiceSchema = z.object({
  personaId: z.string().min(1),
  segmentId: z.string().min(1),
  scores: z.array(
    z.object({
      programName: z.string().min(1),
      probability: z.number().min(0).max(1),
    }),
  ).min(1).refine(
    (arr) => Math.abs(arr.reduce((sum, x) => sum + x.probability, 0) - 1.0) < 0.01,
    { message: "Probabilities must sum to 1.0 (±0.01 tolerance)" },
  ),
  rationale: z.string().min(1),
});
export type PersonaViewingChoice = z.infer<typeof personaViewingChoiceSchema>;

export const predictedAudienceShareSchema = z.object({
  programName: z.string().min(1),
  channel: z.string().min(1),
  predictedSharePct: z.number().min(0).max(100),
  voteCount: z.number().int().nonnegative(),
  weightedScore: z.number().nonnegative(),
  predictedRank: z.number().int().positive(),
});
export type PredictedAudienceShare = z.infer<typeof predictedAudienceShareSchema>;

export const evaluationResultSchema = z.object({
  date: z.string().min(1),
  mae: z.number().nonnegative(),
  spearmanRho: z.number().min(-1).max(1),
  top1Hit: z.boolean(),
  top3Hit: z.boolean(),
  perProgramDelta: z.array(
    z.object({
      programName: z.string().min(1),
      predicted: z.number().min(0).max(100),
      actual: z.number().min(0).max(100),
      delta: z.number(),
    }),
  ).min(1),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export const labInputSchema = z.object({
  rawInput: z.string().min(10),
  inputType: inputTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type LabInput = z.infer<typeof labInputSchema>;

export const promptSourceSchema = z.object({
  publisher: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url(),
  questionDate: z.string().min(1),
  fetchedAt: z.string().datetime(),
  cacheStatus: z.enum(["fresh", "cached"]),
  headline: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
});
export type PromptSource = z.infer<typeof promptSourceSchema>;

export const populationSegmentSpecSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
  concerns: z.array(z.string().min(1)).min(1),
  informationNeeds: z.array(z.string().min(1)).min(1),
  inclusionTags: z.array(metadataTagFilterSchema).min(1),
  exclusionTags: z.array(metadataTagFilterSchema).default([]),
  preferredDiversityHints: z.array(z.string().min(1)).default([]),
  rankingSignals: z.array(rankingSignalSchema).default([]),
  rankingCriteria: z.array(z.string().min(1)).min(1),
});
export type PopulationSegmentSpec = z.infer<typeof populationSegmentSpecSchema>;

export const assignedSegmentSchema = populationSegmentSpecSchema.extend({
  memberPersonaIds: z.array(z.string().min(1)).min(1),
  representativePersonaIds: z.array(z.string().min(1)).min(1),
  evaluatedPersonaIds: z.array(z.string().min(1)).length(2),
});
export type AssignedSegment = z.infer<typeof assignedSegmentSchema>;

export const populationAssignmentResultSchema = z.object({
  promptSummary: z.string().min(1),
  topicDimensions: z.array(z.string().min(1)).min(1),
  panelSampleVersion: z.string().min(1),
  panelPersonaIds: z.array(z.string().min(1)).length(20),
  segments: z.array(assignedSegmentSchema).length(5),
  globalRationale: z.string().min(1),
});
export type PopulationAssignmentResult = z.infer<typeof populationAssignmentResultSchema>;

export const providerOutcomeSchema = z.object({
  provider: providerSchema,
  status: providerOutcomeStatusSchema,
  query: z.string().min(1),
  sourceCount: z.number().int().nonnegative(),
  message: z.string().min(1),
  diagnostics: z.record(z.string(), z.string()).default({}),
});
export type ProviderOutcome = z.infer<typeof providerOutcomeSchema>;

export const retrievedSourceSchema = z.object({
  id: z.string().min(1),
  provider: providerSchema,
  provenance: provenanceSchema,
  title: z.string().min(1),
  snippet: z.string().min(1),
  url: z.string().url().optional(),
  publishedAt: z.string().optional(),
  sourceName: z.string().min(1).optional(),
  query: z.string().min(1),
  relevanceScore: z.number().min(0).max(1),
  tags: z.array(z.string().min(1)).default([]),
  failureReason: z.string().optional(),
});
export type RetrievedSource = z.infer<typeof retrievedSourceSchema>;

export const retrievalResultSchema = z.object({
  searchPhrase: z.string().min(1),
  outcomes: z.array(providerOutcomeSchema).min(1),
  sources: z.array(retrievedSourceSchema).min(1),
});
export type RetrievalResult = z.infer<typeof retrievalResultSchema>;

export const contextPackSchema = z.object({
  id: z.string().min(1),
  segmentId: z.string().min(1),
  label: z.string().min(1),
  conciseBriefing: z.string().min(1),
  likelyKnownFacts: z.array(z.string().min(1)).min(1),
  likelyIgnoredFacts: z.array(z.string().min(1)).min(1),
  emotionalPrimers: z.array(z.string().min(1)).min(1),
  practicalImplications: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1),
  supportingSourceIds: z.array(z.string().min(1)).min(1),
});
export type ContextPack = z.infer<typeof contextPackSchema>;

export const reactionResultSchema = z.object({
  personaId: z.string().min(1),
  segmentId: z.string().min(1),
  contextPackId: z.string().min(1),
  stance: z.enum(["strong_support", "support", "mixed", "oppose", "strong_oppose", "uncertain"]),
  emotionalState: z.enum(["calm", "concerned", "angry", "hopeful", "skeptical", "confused"]),
  confidence: z.number().int().min(1).max(5),
  keyDrivers: z.array(z.string().min(1)).min(1),
  reactionSummary: z.string().min(1),
  quote: z.string().min(1),
  perceivedImpact: z.string().min(1),
  misunderstanding: z.string().nullable(),
});
export type ReactionResult = z.infer<typeof reactionResultSchema>;

export const aggregationResultSchema = z.object({
  executiveSummary: z.string().min(1),
  perSegmentSummary: z.array(
    z.object({
      segmentId: z.string().min(1),
      label: z.string().min(1),
      dominantStance: z.string().min(1),
      emotionalTone: z.string().min(1),
      keyDrivers: z.array(z.string().min(1)).min(1),
      representativeQuotes: z.array(z.string().min(1)).min(1),
    }),
  ).length(5),
  mainDivergences: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      affectedSegmentIds: z.array(z.string().min(1)).min(1),
    }),
  ).min(1),
  overallPattern: z.string().min(1),
  caveats: z.array(z.string().min(1)).min(1),
});
export type AggregationResult = z.infer<typeof aggregationResultSchema>;

export const runStageSchema = z.object({
  id: stageIdSchema,
  label: z.string().min(1),
  status: stageStatusSchema,
  summary: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  diagnostics: z.record(z.string(), z.string()).default({}),
});
export type RunStage = z.infer<typeof runStageSchema>;

export const persistedLabRunSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(["created", "running", "completed", "failed"]),
  mode: runModeSchema,
  audiencePreset: audiencePresetSchema,
  input: labInputSchema,
  promptSnapshot: z.string().min(10),
  promptSource: promptSourceSchema.optional(),
  steps: z.array(runStageSchema),
  panelSampleVersion: z.string().optional(),
  panel: z.array(normalizedPersonaSchema).default([]),
  populationMap: populationAssignmentResultSchema.optional(),
  retrieval: retrievalResultSchema.optional(),
  contextPacks: z.array(contextPackSchema).default([]),
  reactions: z.array(reactionResultSchema).default([]),
  aggregateReport: aggregationResultSchema.optional(),
  tvSchedule: z.array(tvScheduleItemSchema).default([]),
  tvViewingChoices: z.array(personaViewingChoiceSchema).default([]),
  tvPredictions: z.array(predictedAudienceShareSchema).default([]),
  tvEvaluation: evaluationResultSchema.optional(),
  rawModelDiagnostics: z.array(
    z.object({
      stage: stageIdSchema,
      name: z.string().min(1),
      responseId: z.string().optional(),
      model: z.string().min(1),
      outputText: z.string().min(1),
    }),
  ).default([]),
  error: z.string().optional(),
});
export type PersistedLabRun = z.infer<typeof persistedLabRunSchema>;

export const dailyQuestionPreviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("available"),
    source: z.literal("le_figaro"),
    question: z.string().min(10),
    promptSource: promptSourceSchema,
  }),
  z.object({
    status: z.literal("unavailable"),
    source: z.literal("le_figaro"),
    message: z.string().min(1),
  }),
]);
export type DailyQuestionPreview = z.infer<typeof dailyQuestionPreviewSchema>;

export const defaultRunSteps = (mode: RunMode = "manual"): RunStage[] => {
  if (mode === "tv_audience_daily") {
    return [
      { id: "tv_schedule_ingestion", label: "Schedule ingestion", status: "pending", diagnostics: {} },
      { id: "tv_panel_loading", label: "Panel loading", status: "pending", diagnostics: {} },
      { id: "tv_preference_elicitation", label: "Preference elicitation", status: "pending", diagnostics: {} },
      { id: "tv_vote_aggregation", label: "Vote aggregation", status: "pending", diagnostics: {} },
      { id: "tv_evaluation", label: "Evaluation", status: "pending", diagnostics: {} },
    ];
  }
  return [
    { id: "population_mapping", label: "Population mapping", status: "pending", diagnostics: {} },
    { id: "retrieval", label: "Retrieval", status: "pending", diagnostics: {} },
    { id: "context_packs", label: "Context packs", status: "pending", diagnostics: {} },
    { id: "persona_reactions", label: "Persona reactions", status: "pending", diagnostics: {} },
    { id: "divergence_report", label: "Divergence report", status: "pending", diagnostics: {} },
  ];
};
