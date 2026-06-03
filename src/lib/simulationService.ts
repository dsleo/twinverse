import { compileScenario } from "./scenarioCompiler";
import type { DemoKind, SimulationResult } from "../types";

export type SimulationProvider = "local-demo" | "openai-ready";

export interface SimulationRequest {
  demo: DemoKind;
  variantId: string;
  provider?: SimulationProvider;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const providerDelayMs = import.meta.env.MODE === "test" ? 10 : 220;

export async function simulateScenario({
  demo,
  variantId,
  provider = "local-demo",
}: SimulationRequest): Promise<SimulationResult> {
  if (provider === "openai-ready") {
    throw new Error("OpenAI-backed inference is not wired yet. Provide a server-side API endpoint before enabling it.");
  }

  await delay(providerDelayMs);
  return compileScenario(demo, variantId);
}
