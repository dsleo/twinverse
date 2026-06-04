import "server-only";

import { buildAggregation } from "./aggregation";
import { buildContextPack } from "./contextPacks";
import { completeStage, createRunRecord, failStage, readRun, startStage, updateRun, writeRun } from "./persistence";
import { loadPersonaSample } from "./personaSample";
import { mapPopulationToPanel } from "./populationMapping";
import { buildReaction } from "./reactions";
import { retrieveSources } from "./retrieval";
import { memoryInputSchema, type MemoryInput } from "../../lib/memorySchemas";

export async function createMemoryRun(input: MemoryInput) {
  const parsed = memoryInputSchema.parse(input);
  return createRunRecord(parsed);
}

export async function executeMemoryRun(runId: string) {
  try {
    const initialRun = await readRun(runId);
    const cache = await loadPersonaSample();

    await startStage(runId, "population_mapping", "Assigning the live persona sample to question-specific segments.");
    const mapped = await mapPopulationToPanel(initialRun.input, cache);
    await updateRun(runId, (run) => ({
      ...run,
      panelSampleVersion: cache.sampleVersion,
      panel: mapped.panel,
      populationMap: mapped.assignment,
      rawModelDiagnostics: [...run.rawModelDiagnostics, { stage: "population_mapping", ...mapped.diagnostics }],
    }));
    await completeStage(runId, "population_mapping", `Built 5 prompt-specific segments from ${cache.sampleSize} cached dataset personas.`, {
      panelSize: String(mapped.panel.length),
      sampleVersion: cache.sampleVersion,
    });

    await startStage(runId, "retrieval", "Collecting live source signals from configured providers.");
    const retrieval = await retrieveSources(initialRun.input);
    await updateRun(runId, (run) => ({ ...run, retrieval }));
    await completeStage(
      runId,
      "retrieval",
      `Collected ${retrieval.sources.length} source cards across ${retrieval.outcomes.length} providers.`,
      Object.fromEntries(retrieval.outcomes.map((outcome) => [outcome.provider, outcome.status])),
    );

    const runAfterRetrieval = await readRun(runId);
    if (!runAfterRetrieval.populationMap) {
      throw new Error("Population map missing after population stage.");
    }
    if (!runAfterRetrieval.retrieval) {
      throw new Error("Retrieval payload missing after retrieval stage.");
    }

    await startStage(runId, "context_packs", "Writing one context pack per derived segment.");
    const contextPackResults = await Promise.all(
      runAfterRetrieval.populationMap.segments.map(async (segment) => {
        const personas = runAfterRetrieval.panel.filter((persona) => segment.representativePersonaIds.includes(persona.id));
        const liveSources = runAfterRetrieval.retrieval!.sources.filter((source) => source.provenance === "live").slice(0, 4);
        return buildContextPack(runAfterRetrieval.input, segment, personas, liveSources.length > 0 ? liveSources : runAfterRetrieval.retrieval!.sources.slice(0, 4));
      }),
    );
    await updateRun(runId, (run) => ({
      ...run,
      contextPacks: contextPackResults.map((result) => result.pack),
      rawModelDiagnostics: [
        ...run.rawModelDiagnostics,
        ...contextPackResults.map((result) => ({ stage: "context_packs" as const, ...result.diagnostics })),
      ],
    }));
    await completeStage(runId, "context_packs", `Built ${contextPackResults.length} structured context packs.`);

    const runAfterPacks = await readRun(runId);
    await startStage(runId, "persona_reactions", "Evaluating two personas per segment with structured reactions.");
    const reactionResults = await Promise.all(
      runAfterPacks.populationMap!.segments.flatMap((segment) =>
        segment.evaluatedPersonaIds.map(async (personaId) => {
          const persona = runAfterPacks.panel.find((entry) => entry.id === personaId);
          const contextPack = runAfterPacks.contextPacks.find((pack) => pack.segmentId === segment.id);
          if (!persona || !contextPack) {
            throw new Error(`Reaction prerequisites missing for ${segment.id}/${personaId}.`);
          }
          return buildReaction(runAfterPacks.input, segment, persona, contextPack, runAfterPacks.retrieval!.sources.slice(0, 4));
        }),
      ),
    );
    await updateRun(runId, (run) => ({
      ...run,
      reactions: reactionResults.map((result) => result.reaction),
      rawModelDiagnostics: [
        ...run.rawModelDiagnostics,
        ...reactionResults.map((result) => ({ stage: "persona_reactions" as const, ...result.diagnostics })),
      ],
    }));
    await completeStage(runId, "persona_reactions", `Evaluated ${reactionResults.length} personas across 5 segments.`, {
      evaluatedCount: String(reactionResults.length),
    });

    const runAfterReactions = await readRun(runId);
    await startStage(runId, "divergence_report", "Aggregating the evaluated personas into a final split report.");
    const aggregation = await buildAggregation(
      runAfterReactions.input,
      runAfterReactions.populationMap!.segments,
      runAfterReactions.contextPacks,
      runAfterReactions.reactions,
      runAfterReactions.retrieval!.sources,
    );
    await updateRun(runId, (run) => ({
      ...run,
      status: "completed",
      aggregateReport: aggregation.report,
      rawModelDiagnostics: [...run.rawModelDiagnostics, { stage: "divergence_report", ...aggregation.diagnostics }],
    }));
    await completeStage(runId, "divergence_report", "Final divergence report is ready.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const run = await readRun(runId).catch(() => null);
    const activeStep =
      run?.steps.find((step) => step.status === "running")?.id ??
      run?.steps.find((step) => step.status === "pending")?.id ??
      "population_mapping";

    await failStage(runId, activeStep, message);
  }
}
