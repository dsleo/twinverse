import { NextResponse } from "next/server";
import { readRun, RunNotFoundError, RunStateCorruptError } from "../../../../../server/lab/persistence";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;

  try {
    const run = await readRun(runId);
    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }
    if (error instanceof RunStateCorruptError) {
      return NextResponse.json({ error: "Run state is unreadable." }, { status: 500 });
    }
    throw error;
  }
}
