import type { DemoKind } from "../types";

const demoRouteMap: Record<DemoKind, string> = {
  opinion: "opinion",
  retail: "retail",
  b2b: "b2b",
};

export function demoToRoute(demo: DemoKind) {
  return `/lab/${demoRouteMap[demo]}`;
}

export function routeToDemo(slug: string | undefined): DemoKind | null {
  if (!slug) {
    return null;
  }

  const entry = (Object.entries(demoRouteMap) as [DemoKind, string][]).find(([, value]) => value === slug);
  return entry?.[0] ?? null;
}
