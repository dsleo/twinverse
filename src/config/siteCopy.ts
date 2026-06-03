import type { DemoKind } from "../types";

export const siteCopy = {
  home: {
    eyebrow: "Prediction Lab / French Synthetic Personas",
    title: "Build conviction before you field the study.",
    lede:
      "Tweenverse turns current signals and synthetic personas into focused decision tests for opinion, launch, and buying scenarios.",
    primaryCta: "Open the lab",
    secondaryCta: "Inspect personas",
    explainerLabel: "How it works",
    explainerTitle: "Choose a question, test the framing, inspect the why.",
    explainerBody:
      "Start with one decision, run the simulation, then open only the evidence or voices you need to trust the readout.",
    explainerPoints: [
      {
        title: "Pick the decision",
        body: "Choose public opinion, retail launch, or buying committee pressure.",
      },
      {
        title: "Test the frame",
        body: "Compare a sharper framing choice without losing the previous result.",
      },
      {
        title: "Inspect the signal",
        body: "Open the aggregate, voices, and sources when the readout needs proof.",
      },
    ],
  },
  labIndex: {
    eyebrow: "Prediction Lab",
    titlePrefix: "Choose one",
    titleAccent: "decision surface.",
    lede:
      "Each lab route keeps one problem in focus, so the next action is always obvious: choose the frame, run it, inspect the result.",
  },
  lab: {
    loadingQuestion:
      "The question stays visible while the readout resolves, so you can keep the decision in view.",
    rerunLabel: "Run",
  },
  compute: {
    label: "Run",
    title: "Resolve the readout",
    description: "Visible progress for the current decision test.",
    progressLabel: "Progress",
    readyStage: "Ready",
    stages: [
      "Gather current signals",
      "Prepare the scenario",
      "Select the persona panel",
      "Compare likely reactions",
      "Prepare the readout",
    ] as const,
    status: {
      idle: "Ready",
      running: "Running",
      complete: "Ready",
      error: "Needs attention",
    },
  },
  result: {
    questionLabel: "Decision question",
    resultTitle: "What changes?",
    segmentTitle: "Who moves?",
    supportLabel: "support",
    opposeLabel: "oppose",
  },
  personas: {
    pageLabel: "Personas",
    pageTitle: "Inspect the panel",
    searchLabel: "Search personas",
    searchPlaceholder: "Search name, job, city, concern, or trait",
    regionLabel: "Filter by region",
    allRegions: "All regions",
    sectionLabel: "Voices",
    sectionTitle: "One voice at a time",
    yearsOldLabel: "years old",
    locationLabel: "Location",
    ageLabel: "Age",
    householdLabel: "Household",
    economicPostureLabel: "Economic posture",
    traitsLabel: "Traits",
    concernsLabel: "Live concerns",
    coreConcernsLabel: "Core concerns",
    baselineLabel: "Starting point",
    eventsLabel: "Current pressure",
    answerLabel: "Scenario answer",
  },
  evidence: {
    sectionLabel: "Evidence",
    sectionTitle: "Check the sources",
    openSource: "Open source",
    competitorRead: "Competitive read",
  },
  method: {
    label: "Method",
    title: "How the readout stays grounded",
    body:
      "The public lab stays focused on decisions. This deep-link page summarizes the shared method behind opinion, retail, and B2B routes.",
    nextLabel: "Next",
    nextTitle: "Return to the lab",
    nextCta: "Open opinion lab",
  },
  sources: {
    label: "Sources",
    title: "Source signals stay visible",
    body:
      "The product keeps recognizable provenance close to the readout while leaving deeper sourcing notes outside the main journey.",
  },
  notFound: {
    label: "404",
    title: "That page is not available.",
    body: "Open the lab or return home to continue.",
    cta: "Go home",
  },
};

export const labActionOrder: DemoKind[] = ["opinion", "retail", "b2b"];
