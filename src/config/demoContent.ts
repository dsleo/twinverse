import type { DemoKind } from "../types";

export const demoMeta: Record<
  DemoKind,
  {
    kicker: string;
    title: string;
    strap: string;
  }
> = {
  opinion: {
    kicker: "Public Opinion",
    title: "French Opinion Simulator",
    strap: "Model how public sentiment shifts under pressure.",
  },
  retail: {
    kicker: "Consumer Launch",
    title: "Retail Launch Forecaster",
    strap: "Test how demand moves when price, trust, and pressure change.",
  },
  b2b: {
    kicker: "Buying Committee",
    title: "B2B Buying Committee Simulator",
    strap: "Stress-test enterprise approval before the buying committee stalls.",
  },
};

export const pipelineSteps = [
  {
    number: "01",
    title: "Current signals",
    text: "Start from official and media sources that make the decision feel timely.",
  },
  {
    number: "02",
    title: "Decision frame",
    text: "Keep the question precise enough to compare framing choices cleanly.",
  },
  {
    number: "03",
    title: "Persona panel",
    text: "Run the same question through a small panel with visible motives and constraints.",
  },
  {
    number: "04",
    title: "Traceable readout",
    text: "Show the aggregate result with the voices and dated sources needed to inspect it.",
  },
] as const;
