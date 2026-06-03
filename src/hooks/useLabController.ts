import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { siteCopy } from "../config/siteCopy";
import { getDefaultVariant } from "../config/scenarioVariants";
import { routeToDemo } from "../lib/demoRoutes";
import { getScenario } from "../lib/contentRepository";
import { useSimulation } from "./useSimulation";
import type { DemoKind } from "../types";

export function useLabController() {
  const { demoSlug } = useParams();
  const activeDemo = routeToDemo(demoSlug);
  const resolvedDemo: DemoKind = activeDemo ?? "opinion";
  const defaultVariantId = useMemo(() => getDefaultVariant(resolvedDemo).id, [resolvedDemo]);

  const simulation = useSimulation({
    demo: resolvedDemo,
    variantId: defaultVariantId,
  });
  const result = simulation.result;
  const scenario = result?.packet.scenario ?? getScenario(resolvedDemo);

  function runSelectedScenario() {
    void simulation.rerun();
  }

  return {
    activeDemo,
    scenario,
    simulation,
    result,
    runLabel: siteCopy.lab.rerunLabel,
    runSelectedScenario,
  };
}
