import type {
  DemoKind,
  Persona,
  PersonaResponse,
  ScenarioVariant,
  ScenarioPacket,
  SegmentAggregation,
  SimulationResult,
} from "../types";
import { getScenario, listPersonas } from "./contentRepository";
import { getDefaultVariant, getVariant } from "../config/scenarioVariants";
import { searchSourcePack } from "./sourcePack";

const personas = listPersonas();
const personaSelection: Record<DemoKind, number[]> = {
  opinion: [0, 1, 2, 3],
  retail: [0, 1, 3, 4],
  b2b: [2, 4, 0],
};

const segmentMap: Record<DemoKind, SegmentAggregation[]> = {
  opinion: [
    { label: "18-34", support: 61, oppose: 21, undecided: 18 },
    { label: "35-54", support: 58, oppose: 24, undecided: 18 },
    { label: "55+", support: 47, oppose: 34, undecided: 19 },
  ],
  retail: [
    { label: "Urban renters", support: 55, oppose: 19, undecided: 26 },
    { label: "Families", support: 48, oppose: 25, undecided: 27 },
    { label: "Budget-stressed", support: 34, oppose: 39, undecided: 27 },
  ],
  b2b: [
    { label: "Finance leads", support: 42, oppose: 31, undecided: 27 },
    { label: "Operations", support: 57, oppose: 18, undecided: 25 },
    { label: "Owners", support: 46, oppose: 23, undecided: 31 },
  ],
};

const narrativeMap: Record<DemoKind, string> = {
  opinion: "Daily-life pressure dominates abstract ideology; a protection frame outperforms a technocratic one.",
  retail: "Value-sensitive households can still convert, but only when convenience is legible as cash relief.",
  b2b: "Approval exists, but only through staged adoption and low-drama operational proof.",
};

function selectPersonas(demo: DemoKind): Persona[] {
  return personaSelection[demo].map((index) => personas[index]);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function applyVariantToSegments(segments: SegmentAggregation[], variant: ScenarioVariant) {
  return segments.map((segment) => {
    const support = clampPercent(segment.support + variant.supportDelta);
    const oppose = clampPercent(segment.oppose + variant.opposeDelta);
    const undecided = clampPercent(100 - support - oppose);

    return {
      ...segment,
      support,
      oppose,
      undecided,
    };
  });
}

function synthesizeResponse(persona: Persona, packet: ScenarioPacket, variant: ScenarioVariant): PersonaResponse {
  const tagText = packet.eventBriefs.map((brief) => brief.title).join("; ");
  const isB2B = packet.scenario.demo === "b2b";
  const isRetail = packet.scenario.demo === "retail";

  const baselinePreference = isB2B
    ? `${persona.name} starts from a cautious committee posture shaped by ${persona.concerns[0]} and ${persona.concerns[1]}.`
    : isRetail
      ? `${persona.name} likes convenience but filters new spend through ${persona.concerns[0]} and ${persona.economicPosture.toLowerCase()}.`
      : `${persona.name} evaluates the proposal through local fairness, daily friction, and whether public services feel tangible.`;

  const effectOfRecentEvents = `Current signals (${tagText}) make ${packet.sources[0]?.tags[0] ?? "today's context"} more salient for this persona. ${variant.responseShift}`;

  const finalAnswer = isB2B
    ? "Conditional approval if rollout is phased, compliance-safe, and tied to short-term ROI."
    : isRetail
      ? "Interested, but adoption depends on clear monthly savings and strong trust signals."
      : "Supportive when framed as protection against daily cost pressure, but nervous about opaque budget tradeoffs.";

  return {
    personaId: persona.id,
    baselinePreference,
    effectOfRecentEvents,
    finalAnswer,
    confidence: Math.round((0.68 + persona.age / 500) * 100) / 100,
    evidenceReferences: packet.sources.slice(0, 2).map((source) => source.id),
  };
}

function aggregateSegments(demo: DemoKind): SegmentAggregation[] {
  return segmentMap[demo];
}

function buildSummary(demo: DemoKind, variant: ScenarioVariant) {
  if (demo === "opinion") {
    return variant.id === "opinion-protection"
      ? "Net support is positive because the policy reads as immediate cost protection for commuters."
      : "Support softens because the policy is being evaluated as a fiscal tradeoff before the daily benefit feels real.";
  }

  if (demo === "retail") {
    return variant.id === "retail-savings"
      ? "Adoption improves when the offer is legible as monthly savings rather than another premium subscription."
      : "Adoption softens when the offer feels premium and discretionary instead of budget-protective.";
  }

  return variant.id === "b2b-phased"
    ? "Committee approval improves when the rollout feels contained, measurable, and easy to govern."
    : "Committee support weakens when the pitch sounds broad, disruptive, and expensive to control.";
}

export function compileScenario(demo: DemoKind, variantId?: string): SimulationResult {
  const scenario = getScenario(demo);
  const sourcePack = searchSourcePack(demo, scenario.tags);
  const question = sourcePack.questionBank.find((entry) => entry.id === scenario.questionBankId);
  const activeVariant = variantId ? getVariant(demo, variantId) : getDefaultVariant(demo);

  if (!question) {
    throw new Error(`Missing question ${scenario.questionBankId}`);
  }

  const packet: ScenarioPacket = {
    scenario,
    question,
    eventBriefs: sourcePack.eventBriefs,
    sources: sourcePack.sources,
    freshness: sourcePack.freshness,
  };

  const selectedPersonas = selectPersonas(demo);
  const responses = selectedPersonas.map((persona) => synthesizeResponse(persona, packet, activeVariant));

  return {
    packet,
    responses,
    segments: applyVariantToSegments(aggregateSegments(demo), activeVariant),
    narrative: activeVariant.narrative || narrativeMap[demo],
    summary: buildSummary(demo, activeVariant),
    activeVariant,
  };
}
