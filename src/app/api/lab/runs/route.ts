import { after, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { inputTypeSchema, runModeSchema } from "../../../../lib/labSchemas";
import { resolveLeFigaroDailyQuestion } from "../../../../server/lab/dailyQuestion";
import { createLabRun, executeLabRun } from "../../../../server/lab/pipeline";
import { listRuns } from "../../../../server/lab/persistence";

export const runtime = "nodejs";

const createRunRequestSchema = z.object({
  rawInput: z.string().optional(),
  inputType: inputTypeSchema.optional(),
  mode: runModeSchema.optional(),
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
    throw error;
  }

  const mode = body.mode ?? "manual";

  let run;
  try {
    run =
      mode === "le_figaro_daily"
        ? await (async () => {
            const preview = await resolveLeFigaroDailyQuestion();
            if (preview.status !== "available") {
              return null;
            }
            return createLabRun({
              input: {
                rawInput: preview.question,
                inputType: "question",
              },
              mode,
              audiencePreset: "le_figaro_reader",
              promptSnapshot: preview.question,
              promptSource: preview.promptSource,
            });
          })()
        : await createLabRun({
            input: {
              rawInput: body.rawInput ?? "",
              inputType: body.inputType ?? "question",
            },
            mode,
            audiencePreset: "france_general",
            promptSnapshot: body.rawInput ?? "",
          });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 422 });
    }
    throw error;
  }

  if (!run) {
    return NextResponse.json({ error: "Today’s Le Figaro question is unavailable." }, { status: 503 });
  }

  after(async () => {
    try {
      await executeLabRun(run.id);
    } catch (error) {
      console.error(`[lab:runs] Background execution failed for ${run.id}`, error);
    }
  });

  return NextResponse.json({ runId: run.id }, { status: 202 });
}
