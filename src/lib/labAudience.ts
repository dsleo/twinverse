import type { AudiencePreset, RunMode } from "./labSchemas";

export const audiencePresetLabels: Record<AudiencePreset, string> = {
  france_general: "France-wide panel",
  le_figaro_reader: "Le Figaro readership lens",
};

export const audiencePresetDescriptions: Record<AudiencePreset, string> = {
  france_general: "Segments and panel selection reflect a general France-wide audience mix.",
  le_figaro_reader: "Segments and panel selection are weighted toward an inferred Le Figaro readership profile while preserving internal diversity.",
};

export const runModeLabels: Record<RunMode, string> = {
  manual: "Manual question",
  le_figaro_daily: "Le Figaro du jour",
};
