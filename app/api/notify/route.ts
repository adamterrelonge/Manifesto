import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { runNotificationDelivery } from "@/lib/notifications";

// Mutating route (writes event_notifications, sends email) — never
// prerender/cache. Standalone trigger for re-running just this stage
// without a full re-ingest; the normal path is via GET /api/ingest, which
// chains this in as the last step.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNotificationDelivery(createAdminClient());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
