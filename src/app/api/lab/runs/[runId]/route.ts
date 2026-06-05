import { NextResponse } from "next/server";
import { readRun } from "../../../../../server/lab/persistence";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;

  try {
    const run = await readRun(runId);
    return NextResponse.json(run);
  } catch {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
}
