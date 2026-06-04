import { NextResponse } from "next/server";
import { inputTypeSchema } from "../../../../lib/memorySchemas";
import { createMemoryRun, executeMemoryRun } from "../../../../server/memory/pipeline";
import { listRuns } from "../../../../server/memory/persistence";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json(runs.map((run) => ({ id: run.id, createdAt: run.createdAt, status: run.status, input: run.input })));
}

export async function POST(request: Request) {
  const body = (await request.json()) as { rawInput?: string; inputType?: string };
  const run = await createMemoryRun({
    rawInput: body.rawInput ?? "",
    inputType: inputTypeSchema.catch("question").parse(body.inputType),
  });

  void executeMemoryRun(run.id);

  return NextResponse.json({ runId: run.id }, { status: 202 });
}
