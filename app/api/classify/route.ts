import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEventBuckets } from "@/lib/buckets";

// Mutating route (writes event_buckets in Supabase) — never prerender/cache.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: buckets, error: bucketsError } = await admin
    .from("buckets")
    .select("id, slug");
  if (bucketsError) {
    return NextResponse.json({ error: bucketsError.message }, { status: 500 });
  }
  const bucketIdBySlug = new Map<string, string>(
    (buckets ?? []).map((b) => [b.slug as string, b.id as string])
  );

  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, title, description, is_free")
    .eq("status", "published")
    .eq("is_duplicate", false);
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  let eventsTagged = 0;
  let bucketAssignments = 0;
  const errors: string[] = [];

  for (const event of events ?? []) {
    const matches = classifyEventBuckets({
      title: event.title,
      description: event.description,
      isFree: event.is_free,
    });
    if (matches.length === 0) continue;

    const rows = matches
      .map((match) => {
        const bucketId = bucketIdBySlug.get(match.bucketSlug);
        if (!bucketId) return null;
        return {
          event_id: event.id,
          bucket_id: bucketId,
          confidence: match.confidence,
          evidence: match.evidence,
          assigned_by: "keyword",
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) continue;

    const { error } = await admin
      .from("event_buckets")
      .upsert(rows, { onConflict: "event_id,bucket_id" });

    if (error) {
      errors.push(`event ${event.id}: ${error.message}`);
    } else {
      eventsTagged += 1;
      bucketAssignments += rows.length;
    }
  }

  return NextResponse.json({
    eventsProcessed: events?.length ?? 0,
    eventsTagged,
    bucketAssignments,
    errors,
  });
}
