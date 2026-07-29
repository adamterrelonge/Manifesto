import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreEventQuality } from "@/lib/quality";

// Mutating route (writes events.quality_score) — never prerender/cache.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: events, error: eventsError } = await admin
    .from("events")
    .select("id, title, description, venue_id, image_url")
    .eq("status", "published")
    .eq("is_duplicate", false);

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  let scored = 0;
  const errors: string[] = [];

  for (const event of events ?? []) {
    const result = scoreEventQuality({
      title: event.title,
      description: event.description,
      venueId: event.venue_id,
      imageUrl: event.image_url,
    });

    const { error } = await admin
      .from("events")
      .update({ quality_score: result.score, quality_flags: result.flags })
      .eq("id", event.id);

    if (error) {
      errors.push(`event ${event.id}: ${error.message}`);
    } else {
      scored += 1;
    }
  }

  return NextResponse.json({
    eventsProcessed: events?.length ?? 0,
    scored,
    errors,
  });
}
