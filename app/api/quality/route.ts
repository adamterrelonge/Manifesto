import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { runQualityScoring } from "@/lib/pipeline";

// Mutating route (writes events.quality_score) — never prerender/cache.
// Standalone trigger for re-running just this stage (e.g. after tuning
// lib/quality.ts's scoring rules); the normal path is via GET /api/ingest,
// which chains this in.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runQualityScoring(createAdminClient());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
