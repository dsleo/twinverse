import "server-only";

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { loadPersonaSample } from "./personaSample";
import { mapPopulationToPanel } from "./populationMapping";

/**
 * Build and cache the fixed TV viewer panel for reuse across all runs.
 * This should be called once during setup, not on every run.
 */
export async function buildAndCacheTvPanel() {
  console.log("[buildTvPanel] Building france_tv_viewer panel...");

  const cache = await loadPersonaSample();
  console.log(`[buildTvPanel] Loaded ${cache.sampleSize} personas from cache`);

  const mapped = await mapPopulationToPanel(
    { rawInput: "French evening TV viewer", inputType: "poll_question" },
    cache,
    "france_tv_viewer",
  );

  console.log(`[buildTvPanel] Mapped into 5 segments, selected ${mapped.panel.length} panel personas`);

  if (mapped.panel.length !== 50) {
    console.warn(`[buildTvPanel] Expected 50 personas, got ${mapped.panel.length}`);
  }

  const panelDir = resolve(process.cwd(), "data/panels");
  mkdirSync(panelDir, { recursive: true });

  const panelPath = resolve(panelDir, "france-tv-viewer.json");
  const panelData = {
    preset: "france_tv_viewer",
    builtAt: new Date().toISOString(),
    sampleVersion: cache.sampleVersion,
    panelSize: mapped.panel.length,
    panel: mapped.panel,
    assignment: mapped.assignment,
  };

  writeFileSync(panelPath, JSON.stringify(panelData, null, 2));
  console.log(`[buildTvPanel] Saved panel to ${panelPath}`);

  return panelData;
}
