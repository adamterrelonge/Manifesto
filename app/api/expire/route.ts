import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { runExpiry } from "@/lib/pipeline";
import { QUALIFYING_EVENTS_CACHE_TAG } from "@/lib/events-query";

// Mutating route (writes events.status). Standalone trigger for re-running
// just this stage; the normal path is via GET /api/ingest, which chains it
// in ahead of dedup/classify/quality.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runExpiry(createAdminClient());
    revalidateTag(QUALIFYING_EVENTS_CACHE_TAG, "max");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
