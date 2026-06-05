import { NextResponse } from "next/server";
import { inputTypeSchema, runModeSchema } from "../../../../lib/labSchemas";
import { resolveLeFigaroDailyQuestion } from "../../../../server/lab/dailyQuestion";
import { createLabRun, executeLabRun } from "../../../../server/lab/pipeline";
import { listRuns } from "../../../../server/lab/persistence";

export const runtime = "nodejs";

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
  const body = (await request.json()) as { rawInput?: string; inputType?: string; mode?: string };
  const mode = runModeSchema.catch("manual").parse(body.mode);

  const run =
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
            inputType: inputTypeSchema.catch("question").parse(body.inputType),
          },
          mode,
          audiencePreset: "france_general",
          promptSnapshot: body.rawInput ?? "",
        });

  if (!run) {
    return NextResponse.json({ error: "Today’s Le Figaro question is unavailable." }, { status: 503 });
  }

  void executeLabRun(run.id);

  return NextResponse.json({ runId: run.id }, { status: 202 });
}
