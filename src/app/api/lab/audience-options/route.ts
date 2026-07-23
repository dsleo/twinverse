import { NextResponse } from "next/server";
import {
  metadataTaxonomy,
  loadPersonaSample,
} from "../../../../server/lab/personaSample";

export const runtime = "nodejs";

export async function GET() {
  const cache = await loadPersonaSample();
  return NextResponse.json({ taxonomy: metadataTaxonomy(cache.personas) });
}
