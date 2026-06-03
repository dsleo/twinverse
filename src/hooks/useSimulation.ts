import { startTransition, useEffect, useRef, useState } from "react";
import type { DemoKind, SimulationResult } from "../types";
import { simulateScenario, type SimulationProvider } from "../lib/simulationService";
import { siteCopy } from "../config/siteCopy";

const computeStages = siteCopy.compute.stages;

const stageDelayMs = import.meta.env.MODE === "test" ? 10 : 520;
const revealDelayMs = import.meta.env.MODE === "test" ? 10 : 650;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSimulation({
  demo,
  variantId,
  provider = "local-demo",
}: {
  demo: DemoKind;
  variantId: string;
  provider?: SimulationProvider;
}) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [activeStage, setActiveStage] = useState<string>(computeStages[0]);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function runSimulation() {
    const requestId = ++requestIdRef.current;
    setStatus("running");
    setProgress(0);
    setError(null);

    for (let index = 0; index < computeStages.length; index += 1) {
      setActiveStage(computeStages[index]);
      setProgress(Math.round((index / computeStages.length) * 100));
      await wait(stageDelayMs);
      if (requestIdRef.current !== requestId) {
        return;
      }
    }

    try {
      const nextResult = await simulateScenario({ demo, variantId, provider });
      if (requestIdRef.current !== requestId) {
        return;
      }

      setActiveStage(computeStages[4]);
      setProgress(92);
      await wait(revealDelayMs);
      if (requestIdRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        setActiveStage(siteCopy.compute.readyStage);
        setResult(nextResult);
        setProgress(100);
        setStatus("complete");
      });
    } catch (caught) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setStatus("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    void runSimulation();
  }, [demo, provider, variantId]);

  return {
    result,
    status,
    progress,
    activeStage,
    error,
    computeStages,
    rerun: runSimulation,
  };
}
