import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isValidBearerSecret } from "@/lib/auth";
import { QUALIFYING_EVENTS_CACHE_TAG } from "@/lib/events-query";
import { runIngest } from "@/lib/ingest-run";

// Manual trigger for the full pipeline (lib/ingest-run.ts). The scheduled
// path is scripts/ingest.ts via .github/workflows/ingest.yml: a full run
// takes 5+ minutes (measured 2026-11-24), so on Vercel this route will
// usually hit its time limit before the later pipeline stages finish. It's
// kept for re-running from a machine without that limit (e.g. `next dev`).
export const dynamic = "force-dynamic";
// Vercel's ceiling with Fluid compute on the Hobby plan; capped by the plan
// if lower.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runIngest();

  // Bust the cached fetchQualifyingEvents() result so the home page,
  // /events, and sitemap show this run's newly published events right
  // away instead of waiting out its revalidate window.
  revalidateTag(QUALIFYING_EVENTS_CACHE_TAG, "max");

  return NextResponse.json(result);
}
