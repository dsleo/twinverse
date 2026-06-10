import "server-only";

import { z } from "zod";
import {
  personaViewingChoiceSchema,
  type AssignedSegment,
  type NormalizedPersona,
  type TVScheduleItem,
} from "../../lib/labSchemas";
import { callStructuredModel } from "./openaiStructured";

/**
 * Normalize probability scores to sum to exactly 1.0
 * Handles rounding errors and edge cases in LLM responses
 */
function normalizeScores(
  scores: Array<{ programName: string; probability: number }>,
): Array<{ programName: string; probability: number }> {
  const sum = scores.reduce((acc, s) => acc + s.probability, 0);

  if (Math.abs(sum) < 0.001) {
    // Edge case: all zeros, distribute evenly
    const evenProb = 1 / scores.length;
    return scores.map((s) => ({ ...s, probability: evenProb }));
  }

  return scores.map((s) => ({ ...s, probability: s.probability / sum }));
}

/**
 * Fill missing programs with a default low probability (1% each)
 * Allows evaluation to proceed even if persona didn't score all programs
 * Handles LLM context truncation or incomplete responses gracefully
 */
function fillMissingPrograms(
  personaScores: Array<{ programName: string; probability: number }>,
  fullSchedule: TVScheduleItem[],
  personaId: string,
): Array<{ programName: string; probability: number }> {
  const providedPrograms = new Set(personaScores.map((s) => s.programName));
  const missingPrograms = fullSchedule.filter((item) => !providedPrograms.has(item.programName));

  if (missingPrograms.length === 0) {
    return personaScores; // All programs provided, no need to fill
  }

  // Assign minimal probability to missing programs
  const defaultProb = 0.01; // 1% per missing program
  const filledScores = [
    ...personaScores,
    ...missingPrograms.map((prog) => ({
      programName: prog.programName,
      probability: defaultProb,
    })),
  ];

  // Renormalize to sum to 1.0
  const normalized = normalizeScores(filledScores);

  // Log for observability
  console.warn(
    `[tvPreferences] Persona ${personaId} filled ${missingPrograms.length} missing programs: [${missingPrograms.map((p) => p.programName).join(", ")}]`,
  );

  return normalized;
}

const viewingChoiceOutputSchema = personaViewingChoiceSchema.omit({
  personaId: true,
  segmentId: true,
});

const batchedViewingChoiceSchema = z.object({
  choices: z.array(
    z.object({
      personaId: z.string().min(1),
      ...viewingChoiceOutputSchema.shape,
    }),
  ).min(1),
});

export async function buildViewingPreferencesForSegment(
  segment: AssignedSegment,
  personas: NormalizedPersona[],
  schedule: TVScheduleItem[],
) {
  // Build indexed schedule for the prompt
  const scheduleWithIndex = schedule.map((item, idx) => ({
    index: idx,
    item,
  }));

  const system = [
    "You simulate French TV viewers making their evening viewing choice.",
    "Respond only as the persona — do not break character, do not mention being an AI.",
    "Base your choice solely on the persona's age, occupation, household, tastes, and concerns.",
    "Return exactly one set of viewing preferences per provided persona.",
    "Each response must include the matching personaId from the input.",
    "Probabilities must sum to exactly 1.0.",
    "CRITICAL: You must provide a clear 'rationale' for your choices *before* assigning probabilities.",
    "PROBABILITY CALIBRATION: Most viewers have ONE preferred program per time slot (top choice: 20-30%). Secondary choices are significantly lower (second: 8-15%). Remaining programs split minimally (rest: 1-5% each). Avoid uniform distributions. Use 1-2% for programs they would only watch if others aren't available.",
  ].join(" ");

  const scheduleText = scheduleWithIndex
    .map(({ index, item }) => {
      const flags = [];
      if (item.isFootballMatch) flags.push("FOOTBALL_MATCH");
      if (item.isHoliday) flags.push("HOLIDAY");
      const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      return `[${index}] ${item.channel} — ${item.programName} (${item.genre}) — ${item.timeSlot}${flagStr}`;
    })
    .join("\n");

  // Extract just program names for clear reference in response
  const programNamesList = schedule.map((item) => item.programName);

  const user = JSON.stringify(
    {
      schedule: `Tonight's TV schedule (primetime):\n${scheduleText}`,
      programNames: `Use these exact program names in your response: ${JSON.stringify(programNamesList)}`,
      personas: personas.map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        age: persona.age,
        city: persona.city,
        occupation: persona.occupation,
        household: persona.household,
        traits: persona.traits,
        concerns: persona.concerns,
        profileNarrative: persona.profileNarrative,
        ...(persona.tvPreferenceDescription && { tvPreferenceDescription: persona.tvPreferenceDescription }),
      })),
      instruction: `For each program in the schedule, first provide a 'rationale' explaining the persona's thought process for their viewing preferences tonight, considering their traits, concerns, and the program's genre, channel, and any special context (football matches, holiday programming). Then, assign a probability (0.0–1.0) for each program reflecting how likely they are to watch it. All probabilities must sum to exactly 1.0. Use the exact program names from the programNames list above.`,
      responseExample: `{
  "choices": [
    {
      "personaId": "persona-id-123",
      "scores": [
        { "programName": "Program Name 1", "probability": 0.35 },
        { "programName": "Program Name 2", "probability": 0.20 },
        { "programName": "Program Name 3", "probability": 0.15 }
      ],
      "rationale": "This persona would watch Program Name 1 because..."
    }
  ]
}`,
    },
    null,
    2,
  );

  const result = await callStructuredModel({
    schema: batchedViewingChoiceSchema,
    schemaName: `viewing_choices_${segment.id}`,
    stageName: "ViewingPreferenceAgentBatch",
    system,
    user,
  });

  const personaIds = new Set(personas.map((persona) => persona.id));

  // Helper to extract program name from potentially formatted string
  // Handles both "Program Name" and "Channel — Program Name (Genre) — TimeSlot" formats
  function extractProgramName(potentialName: string): string {
    // Check if it looks like a formatted schedule entry (contains " — ")
    if (potentialName.includes(" — ")) {
      // Extract the second part: channel — [THIS PART] (genre) — time
      const parts = potentialName.split(" — ");
      if (parts.length >= 2) {
        // Remove genre suffix in parentheses if present
        const nameWithGenre = parts[1];
        const cleanName = nameWithGenre.replace(/\s*\([^)]+\)\s*/, "").trim();
        return cleanName;
      }
    }
    return potentialName.trim();
  }

  const choices = result.data.choices.map((choice) => {
    const { personaId, ...choiceData } = choice;
    // Ensure all programs in schedule are represented
    const allPrograms = schedule.map((item) => item.programName);

    // Normalize returned program names and create a mapping
    let normalizedScores = choiceData.scores.map((s) => ({
      programName: extractProgramName(s.programName),
      probability: s.probability,
    }));

    // Fix 1: Normalize probabilities to sum to 1.0 (handles rounding errors)
    normalizedScores = normalizeScores(normalizedScores);

    // Fix 2: Fill missing programs with default low probability (handles incomplete responses)
    normalizedScores = fillMissingPrograms(normalizedScores, schedule, personaId);

    return personaViewingChoiceSchema.parse({
      personaId,
      segmentId: segment.id,
      ...choiceData,
      scores: normalizedScores,
    });
  });

  if (choices.length !== personas.length) {
    throw new Error(
      `Viewing choice batch for ${segment.id} returned ${choices.length} choices for ${personas.length} personas.`,
    );
  }

  if (new Set(choices.map((choice) => choice.personaId)).size !== choices.length) {
    throw new Error(`Viewing choice batch for ${segment.id} returned duplicate persona ids.`);
  }

  if (choices.some((choice) => !personaIds.has(choice.personaId))) {
    throw new Error(`Viewing choice batch for ${segment.id} returned an unknown persona id.`);
  }

  return {
    choices,
    diagnostics: result.diagnostics,
  };
}
