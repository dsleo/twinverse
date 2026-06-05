import { NextResponse } from "next/server";
import { z } from "zod";
import { executeLabRun } from "../../../../server/lab/pipeline";
import { readRun } from "../../../../server/lab/persistence";
import { verifyWorkerRequest } from "../../../../server/lab/qstash";

const workerPayloadSchema = z.object({
  runId: z.string().min(1),
});

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.text();
  const verified = await verifyWorkerRequest(request, body);

  if (!verified) {
    return NextResponse.json({ error: "Invalid worker signature." }, { status: 401 });
  }

  const payload = workerPayloadSchema.parse(JSON.parse(body));

  let run;
  try {
    run = await readRun(payload.runId);
  } catch {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  if (run.status === "running" || run.status === "completed") {
    return NextResponse.json({ ok: true, skipped: run.status });
  }

  await executeLabRun(payload.runId);
  return NextResponse.json({ ok: true });
}
