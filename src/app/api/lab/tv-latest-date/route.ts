import { NextResponse } from "next/server";
import { resolveLatestTvAudienceDate } from "../../../../server/lab/tvLatestDate";
import { parseBacktestSchedule } from "../../../../server/lab/tvSchedule";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await resolveLatestTvAudienceDate();
    const schedule = parseBacktestSchedule(data.targetDate);
    return NextResponse.json({ ...data, schedule });
  } catch (error) {
    return NextResponse.json({ error: "Failed to resolve latest TV audience date." }, { status: 500 });
  }
}
