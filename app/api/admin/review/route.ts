import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { NON_QUALIFYING_BUCKETS } from "@/lib/buckets";
import { isValidBearerSecret } from "@/lib/auth";
import { QUALIFYING_EVENTS_CACHE_TAG } from "@/lib/events-query";

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
  // Pending and decided rows are fetched separately. A single
  // `.limit(1000)` over every row used to let the queue silently truncate
  // once event_buckets outgrew it (5000+ rows, ~3000 of them auto-approved),
  // so pending suggestions could vanish from "Needs review". Every pending
  // row is now loaded (paginated); decided rows are capped to the most
  // recent ones since those tabs are only for undoing recent decisions.
  const SELECT =
    "event_id, bucket_id, confidence, evidence, assigned_by, events(title, start_at), buckets(slug, label)";
  const PAGE_SIZE = 1000;
  const DECIDED_LIMIT = 1000;
  const excludedIds = (excludedBuckets ?? []).map((b) => b.id as string);
  const excludedFilter = `(${excludedIds.join(",")})`;

  const pending: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = admin
      .from("event_buckets")
      .select(SELECT)
      .not("assigned_by", "in", "(moderator,rejected)")
      .order("confidence", { ascending: true })
      .order("event_id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (excludedIds.length > 0) query = query.not("bucket_id", "in", excludedFilter);
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    pending.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  let decidedQuery = admin
    .from("event_buckets")
    .select(SELECT)
    .in("assigned_by", ["moderator", "rejected"])
    .order("created_at", { ascending: false })
    .limit(DECIDED_LIMIT);
  if (excludedIds.length > 0) decidedQuery = decidedQuery.not("bucket_id", "in", excludedFilter);
  const { data: decided, error: decidedError } = await decidedQuery;
  if (decidedError) {
    return NextResponse.json({ error: decidedError.message }, { status: 500 });
  }

  return NextResponse.json({ rows: [...pending, ...(decided ?? [])] });
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
    revalidateTag(QUALIFYING_EVENTS_CACHE_TAG, "max");
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin
    .from("event_buckets")
    .update({ assigned_by: "moderator" })
    .eq("event_id", eventId)
    .eq("bucket_id", bucketId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(QUALIFYING_EVENTS_CACHE_TAG, "max");
  return NextResponse.json({ ok: true });
}
