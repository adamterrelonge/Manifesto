import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchAllEventbriteEvents,
  normaliseEventbriteEvent,
} from "@/lib/sources/eventbrite";
import { EVENTBRITE_ORGANISERS } from "@/lib/sources/eventbrite-organisers";
import { upsertNormalisedEvent } from "@/lib/ingest";

// Mutating route with external side effects (fetches Eventbrite, writes to
// Supabase) — never let this be prerendered/cached.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (EVENTBRITE_ORGANISERS.length === 0) {
    return NextResponse.json({
      organisersChecked: 0,
      fetched: 0,
      upserted: 0,
      errors: [
        "EVENTBRITE_ORGANISERS is empty — add curated organiser IDs in lib/sources/eventbrite-organisers.ts",
      ],
    });
  }

  const admin = createAdminClient();

  let raw: Awaited<ReturnType<typeof fetchAllEventbriteEvents>>;
  try {
    raw = await fetchAllEventbriteEvents();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Eventbrite: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  let upserted = 0;
  const errors: string[] = [];

  for (const { organiser, event } of raw) {
    try {
      const normalised = normaliseEventbriteEvent(organiser, event);
      await upsertNormalisedEvent(admin, normalised);
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    organisersChecked: EVENTBRITE_ORGANISERS.length,
    fetched: raw.length,
    upserted,
    errors,
  });
}
