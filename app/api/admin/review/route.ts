import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NON_QUALIFYING_BUCKETS } from "@/lib/buckets";
import { isValidBearerSecret } from "@/lib/auth";

// Reads/writes event_buckets directly — never prerender/cache.
export const dynamic = "force-dynamic";

// Deliberately its own secret (ADMIN_SECRET), not INGEST_SECRET — this one
// gets typed into the browser and kept in sessionStorage by the admin UI,
// so it has a much larger exposure surface than a server-to-server ingest
// trigger. Keeping them separate means a leak here can't also be used to
// trigger ingestion or rescoring, and vice versa.
function checkAuth(request: NextRequest) {
  return isValidBearerSecret(request.headers.get("authorization"), process.env.ADMIN_SECRET);
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

  // Rejected pairs are kept (not deleted) so re-ingestion doesn't resurrect
  // them — see 0012_bucket_rejected_state.sql. They're included here (not
  // filtered out) so the admin UI can show them in their own "Rejected" tab
  // instead of just dropping them from view.
  let query = admin
    .from("event_buckets")
    .select(
      "event_id, bucket_id, confidence, evidence, assigned_by, events(title, start_at), buckets(slug, label)"
    )
    .order("confidence", { ascending: true })
    .limit(1000);

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
    // Kept, not deleted: runClassification (lib/pipeline.ts) checks for
    // assigned_by = 'rejected' before re-inserting a keyword match, so a
    // hard delete here would just let the next ingest resurrect it.
    const { error } = await admin
      .from("event_buckets")
      .update({ assigned_by: "rejected" })
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
