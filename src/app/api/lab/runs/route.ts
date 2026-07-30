import { after, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { audienceGuidanceSchema, audiencePresetSchema, inputTypeSchema, populationSegmentDesignSchema, runModeSchema } from "../../../../lib/labSchemas";
import { resolveLeFigaroDailyQuestion } from "../../../../server/lab/dailyQuestion";
import { logLabRun } from "../../../../server/lab/logging";
import { createLabRun, executeLabRun } from "../../../../server/lab/pipeline";
import { validateAudienceGuidanceAgainstTaxonomy, validateSegmentDesignAgainstTaxonomy } from "../../../../server/lab/populationMapping";
import { loadPersonaSample } from "../../../../server/lab/personaSample";
import { createTvAudienceRun } from "../../../../server/lab/tvPipeline";
import { listRuns } from "../../../../server/lab/persistence";

export const runtime = "nodejs";

const createRunRequestSchema = z.object({
  rawInput: z.string().optional(),
  inputType: inputTypeSchema.optional(),
  mode: runModeSchema.optional(),
  audiencePreset: audiencePresetSchema.optional(),
  audienceGuidance: audienceGuidanceSchema.optional(),
  approvedSegmentDesign: populationSegmentDesignSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json(
    runs.map((run) => ({
      id: run.id,
      createdAt: run.createdAt,
      status: run.status,
      mode: run.mode,
      audiencePreset: run.audiencePreset,
      input: run.input,
    })),
  );
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  let body: z.infer<typeof createRunRequestSchema>;
  try {
    body = createRunRequestSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create this run." },
      { status: 422 },
    );
  }

  const mode = body.mode ?? "manual";

  let run;
  try {
    if (mode === "le_figaro_daily") {
      const preview = await resolveLeFigaroDailyQuestion();
      if (preview.status !== "available") {
        return NextResponse.json({ error: "Today’s Le Figaro question is unavailable." }, { status: 503 });
      }
      run = await createLabRun({
        input: {
          rawInput: preview.question,
          inputType: "question",
        },
        mode,
        audiencePreset: "le_figaro_reader",
        promptSnapshot: preview.question,
        promptSource: preview.promptSource,
      });
    } else if (mode === "tv_audience_daily") {
      if (!body.date) {
        return NextResponse.json({ error: "tv_audience_daily mode requires a date parameter (YYYY-MM-DD)." }, { status: 422 });
      }
      run = await createTvAudienceRun({
        input: {
          rawInput: `TV schedule for ${body.date}`,
          inputType: "other",
          date: body.date,
        },
        audiencePreset: "france_tv_viewer",
        promptSnapshot: `TV Audience Prediction for ${body.date}`,
        date: body.date,
      });
    } else {
      const cache = await loadPersonaSample();
      const guidance = validateAudienceGuidanceAgainstTaxonomy(
        body.audienceGuidance ?? { mode: "automatic", include: [], avoid: [], priorityConcerns: [] },
        cache.personas,
      );
      const approvedSegmentDesign = body.approvedSegmentDesign
        ? validateSegmentDesignAgainstTaxonomy(body.approvedSegmentDesign, cache.personas)
        : undefined;
      run = await createLabRun({
        input: {
          rawInput: body.rawInput ?? "",
          inputType: body.inputType ?? "question",
        },
        mode,
        audiencePreset: body.audiencePreset ?? "france_general",
        audienceGuidance: guidance,
        approvedSegmentDesign,
        promptSnapshot: body.rawInput ?? "",
      });
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create this run." },
      { status: 422 },
    );
  }

  if (!run) {
    return NextResponse.json({ error: "Failed to create run." }, { status: 500 });
  }

  logLabRun(run.id, "run-created", {
    mode,
    audiencePreset: run.audiencePreset,
  });

  after(async () => {
    try {
      logLabRun(run.id, "background-execution-start");
      await executeLabRun(run.id);
      logLabRun(run.id, "background-execution-finished");
    } catch (error) {
      console.error(`[lab:runs] Background execution failed for ${run.id}`, error);
    }
  });

  return NextResponse.json({ runId: run.id }, { status: 202 });
}
