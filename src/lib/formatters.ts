import type { Freshness, SourceKind } from "../types";

export const sourceKindLabel: Record<SourceKind, string> = {
  institution: "Institution",
  pollster: "Pollster",
  media: "Media",
};

export function formatToken(value: string): string {
  return value.replaceAll("_", " ");
}

export function freshnessClassName(freshness: Freshness): string {
  return `freshness freshness-${freshness.replaceAll(" ", "-")}`;
}
