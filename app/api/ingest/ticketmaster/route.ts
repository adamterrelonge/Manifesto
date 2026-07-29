import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchTicketmasterEvents,
  normaliseTicketmasterEvent,
} from "@/lib/sources/ticketmaster";
import { upsertNormalisedEvent } from "@/lib/ingest";

// Mutating route with external side effects (fetches Ticketmaster, writes to
// Supabase) — never let this be prerendered/cached.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Without an explicit date range, Ticketmaster's default ranking isn't
  // guaranteed to be "soonest first" either — bound to the app's actual
  // date window (matches app/page.tsx) and paginate a couple of pages for
  // fuller coverage of the week.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 8);
  const startDateTime = `${today.toISOString().split(".")[0]}Z`;
  const endDateTime = `${horizon.toISOString().split(".")[0]}Z`;

  type TicketmasterEventItem = Awaited<
    ReturnType<typeof fetchTicketmasterEvents>
  >[number];
  const raw: TicketmasterEventItem[] = [];
  const MAX_PAGES = 2;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await fetchTicketmasterEvents({
        startDateTime,
        endDateTime,
        page,
      });
      raw.push(...batch);
      if (batch.length < 200) break; // last page
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch from Ticketmaster: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  let upserted = 0;
  const errors: string[] = [];

  for (const rawEvent of raw) {
    try {
      const normalised = normaliseTicketmasterEvent(rawEvent);
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
