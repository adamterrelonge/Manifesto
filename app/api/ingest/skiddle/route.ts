import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSkiddleEvents, normaliseSkiddleEvent } from "@/lib/sources/skiddle";
import { upsertNormalisedEvent } from "@/lib/ingest";

// Mutating route with external side effects (fetches Skiddle, writes to
// Supabase) — never let this be prerendered/cached.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Skiddle's default `order` isn't date-ascending (docs only offer
  // trending/goingto/distance) and a single page only returns ~100 events
  // by whatever that default ranking is — which skews heavily toward
  // "trending today" and leaves later days in the week sparse. Bounding to
  // the app's actual date window (matches app/page.tsx) and paginating a
  // few pages gets much fuller coverage of the week.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 8);
  const minDate = today.toISOString().slice(0, 10);
  const maxDate = horizon.toISOString().slice(0, 10);

  type SkiddleEvent = Awaited<ReturnType<typeof fetchSkiddleEvents>>[number];
  const raw: SkiddleEvent[] = [];
  const MAX_PAGES = 3;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await fetchSkiddleEvents({
        minDate,
        maxDate,
        offset: page * 100,
      });
      raw.push(...batch);
      if (batch.length < 100) break; // last page
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Skiddle: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  let upserted = 0;
  const errors: string[] = [];

  for (const rawEvent of raw) {
    try {
      const normalised = normaliseSkiddleEvent(rawEvent);
      await upsertNormalisedEvent(admin, normalised);
      upserted += 1;
    } catch (err) {
      errors.push(`event ${rawEvent.id}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    fetched: raw.length,
    upserted,
    errors,
  });
}
