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

  // Venues first: merging split venue rows (e.g. "11 Water Street" vs
  // "11 Water St") makes event dedup more effective too, since it only
  // matches events sharing the same venue_id.
  const { data: venuesMerged, error: venueError } = await admin.rpc(
    "merge_duplicate_venues"
  );
  if (venueError) {
    return NextResponse.json(
      { error: `Venue merge failed: ${venueError.message}` },
      { status: 500 }
    );
  }

  const { data: eventsMatched, error: eventError } = await admin.rpc(
    "run_event_dedup"
  );
  if (eventError) {
    return NextResponse.json(
      { error: `Event dedup pass failed: ${eventError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ venuesMerged, eventsMatched });
}
