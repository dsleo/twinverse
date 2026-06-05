import { NextResponse } from "next/server";
import { resolveLeFigaroDailyQuestion } from "../../../../server/lab/dailyQuestion";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");

  if (source !== "le_figaro") {
    return NextResponse.json({ error: "Unsupported daily question source." }, { status: 400 });
  }

  const preview = await resolveLeFigaroDailyQuestion();
  return NextResponse.json(preview, { status: preview.status === "available" ? 200 : 503 });
}
