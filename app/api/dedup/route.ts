import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mutating route (flags duplicate events in Supabase) — never prerender/cache.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: matched, error } = await admin.rpc("run_event_dedup");
  if (error) {
    return NextResponse.json(
      { error: `Dedup pass failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ matched });
}
