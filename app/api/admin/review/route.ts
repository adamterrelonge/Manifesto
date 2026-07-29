import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NON_QUALIFYING_BUCKETS } from "@/lib/buckets";

// Reads/writes event_buckets directly — never prerender/cache.
export const dynamic = "force-dynamic";

function checkAuth(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(secret) && authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // free-entry/low-income-access are deterministic (read straight off
  // is_free, always confidence 1.0, never inferred) — nothing to review.
  // Only identity/accessibility tags belong in this queue.
  const { data: excludedBuckets, error: excludedError } = await admin
    .from("buckets")
    .select("id")
    .in("slug", NON_QUALIFYING_BUCKETS);

  if (excludedError) {
    return NextResponse.json({ error: excludedError.message }, { status: 500 });
  }

  let query = admin
    .from("event_buckets")
    .select(
      "event_id, bucket_id, confidence, evidence, assigned_by, events(title, start_at), buckets(slug, label)"
    )
    .order("confidence", { ascending: true })
    .limit(500);

  const excludedIds = (excludedBuckets ?? []).map((b) => b.id as string);
  if (excludedIds.length > 0) {
    query = query.not("bucket_id", "in", `(${excludedIds.join(",")})`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { eventId, bucketId, action } = body as {
    eventId?: string;
    bucketId?: string;
    action?: "approve" | "reject";
  };

  if (!eventId || !bucketId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "reject") {
    const { error } = await admin
      .from("event_buckets")
      .delete()
      .eq("event_id", eventId)
      .eq("bucket_id", bucketId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin
    .from("event_buckets")
    .update({ assigned_by: "moderator" })
    .eq("event_id", eventId)
    .eq("bucket_id", bucketId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
