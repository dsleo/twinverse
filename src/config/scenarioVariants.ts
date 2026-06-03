import type { DemoKind, ScenarioVariant } from "../types";

export const scenarioVariants: Record<DemoKind, ScenarioVariant[]> = {
  opinion: [
    {
      id: "opinion-protection",
      demo: "opinion",
      label: "Protection frame",
      description: "Lead with commuter relief and fairness.",
      supportDelta: 4,
      opposeDelta: -2,
      narrative: "Commuter protection language lifts support because cost pressure feels immediate and personal.",
      responseShift: "Protection framing makes the proposal feel concrete rather than bureaucratic.",
    },
    {
      id: "opinion-discipline",
      demo: "opinion",
      label: "Budget discipline frame",
      description: "Lead with municipal tradeoffs and fiscal seriousness.",
      supportDelta: -5,
      opposeDelta: 4,
      narrative: "Fiscal-discipline language cools enthusiasm because the tradeoff feels abstract before the benefit feels real.",
      responseShift: "Budget-discipline framing raises anxiety about what gets cut elsewhere.",
    },
  ],
  retail: [
    {
      id: "retail-savings",
      demo: "retail",
      label: "Savings-first pitch",
      description: "Emphasize monthly savings and bill stability.",
      supportDelta: 6,
      opposeDelta: -3,
      narrative: "Savings-first positioning works because households are willing to buy convenience when it reads as budget protection.",
      responseShift: "A savings-first pitch turns convenience into a rational rather than indulgent purchase.",
    },
    {
      id: "retail-premium",
      demo: "retail",
      label: "Premium convenience pitch",
      description: "Emphasize comfort and speed over savings.",
      supportDelta: -7,
      opposeDelta: 5,
      narrative: "Premium-convenience language underperforms because it feels discretionary in a value-sensitive climate.",
      responseShift: "A premium tone triggers subscription fatigue faster than curiosity.",
    },
  ],
  b2b: [
    {
      id: "b2b-phased",
      demo: "b2b",
      label: "Phased rollout",
      description: "Lead with control, low-risk rollout, and measurable ROI.",
      supportDelta: 5,
      opposeDelta: -4,
      narrative: "A phased rollout lowers perceived integration risk and gives finance a credible path to approval.",
      responseShift: "Low-drama rollout language makes the committee picture a contained pilot instead of a disruptive transformation.",
    },
    {
      id: "b2b-transform",
      demo: "b2b",
      label: "Transformation pitch",
      description: "Lead with strategic AI transformation and broad upside.",
      supportDelta: -6,
      opposeDelta: 5,
      narrative: "Transformation rhetoric creates more blockers because it sounds expensive, risky, and hard to govern.",
      responseShift: "Transformation language magnifies vendor and integration anxiety.",
    },
  ],
};

export function getDefaultVariant(demo: DemoKind): ScenarioVariant {
  return scenarioVariants[demo][0];
}

export function getVariant(demo: DemoKind, variantId?: string): ScenarioVariant {
  return scenarioVariants[demo].find((entry) => entry.id === variantId) ?? getDefaultVariant(demo);
}
