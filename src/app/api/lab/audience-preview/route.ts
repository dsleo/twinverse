import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  audienceGuidanceSchema,
  audiencePresetSchema,
  labInputSchema,
} from "../../../../lib/labSchemas";
import {
  audienceEligiblePersonaCount,
  designPopulationSegments,
  segmentEligibilityCounts,
  validateAudienceGuidanceAgainstTaxonomy,
  validateSegmentDesignAgainstTaxonomy,
} from "../../../../server/lab/populationMapping";
import { loadPersonaSample } from "../../../../server/lab/personaSample";

export const runtime = "nodejs";

const previewRequestSchema = z.object({
  input: labInputSchema,
  audiencePreset: audiencePresetSchema,
  guidance: audienceGuidanceSchema,
});

export async function POST(request: Request) {
  let body: z.infer<typeof previewRequestSchema>;
  try {
    body = previewRequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ZodError
            ? "Invalid audience preview request."
            : "Malformed JSON body.",
      },
      { status: 422 },
    );
  }

  try {
    const cache = await loadPersonaSample();
    const guidance = validateAudienceGuidanceAgainstTaxonomy(
      body.guidance,
      cache.personas,
    );
    const designed = await designPopulationSegments(
      body.input,
      cache,
      body.audiencePreset,
      { guidance },
    );
    const proposal = validateSegmentDesignAgainstTaxonomy(
      designed.data,
      cache.personas,
    );
    const eligibility = segmentEligibilityCounts(
      cache.personas,
      proposal.segments,
      body.audiencePreset,
      guidance,
    );
    const warnings = eligibility
      .filter((entry) => entry.eligiblePersonaCount < 2)
      .map(
        (entry) =>
          `“${proposal.segments.find((segment) => segment.id === entry.segmentId)?.label ?? entry.segmentId}” has too few eligible personas.`,
      );
    const totalEligible = audienceEligiblePersonaCount(cache.personas, guidance);
    if (totalEligible < 20) {
      warnings.unshift(
        `Your required attributes leave only ${totalEligible} eligible personas; broaden them before running.`,
      );
    }

    return NextResponse.json({
      proposal,
      eligibility,
      totalEligiblePersonaCount: totalEligible,
      warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to preview this audience.",
      },
      { status: 422 },
    );
  }
}
