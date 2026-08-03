import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { upsertNormalisedEvent } from "@/lib/ingest";
import { runExpiry, runDedup, runClassification, runQualityScoring } from "@/lib/pipeline";
import { fetchBarbicanEvents, normaliseBarbicanEvent } from "@/lib/sources/barbican";
import {
  fetchAllEventbriteEvents,
  normaliseEventbriteEvent,
} from "@/lib/sources/eventbrite";
import { EVENTBRITE_ORGANISERS } from "@/lib/sources/eventbrite-organisers";
import {
  fetchSerpentineEvents,
  normaliseSerpentineEvent,
} from "@/lib/sources/serpentine";
import { fetchSkiddleEvents, normaliseSkiddleEvent } from "@/lib/sources/skiddle";
import {
  fetchTicketmasterEvents,
  normaliseTicketmasterEvent,
} from "@/lib/sources/ticketmaster";
import { fetchAutographEvents, normaliseAutographEvent } from "@/lib/sources/autograph";
import { fetchQueerBritainEvents, normaliseQueerBritainEvent } from "@/lib/sources/queer-britain";
import { fetchTateEvents, normaliseTateEvent } from "@/lib/sources/tate";
import { fetchHornimanEvents, normaliseHornimanEvent } from "@/lib/sources/horniman";
import { fetchIcaEvents, normaliseIcaEvent } from "@/lib/sources/ica";
import { fetchWhitechapelEvents, normaliseWhitechapelEvent } from "@/lib/sources/whitechapel";
import {
  fetchSouthLondonGalleryEvents,
  normaliseSouthLondonGalleryEvent,
} from "@/lib/sources/south-london-gallery";
import {
  fetchMigrationMuseumEvents,
  normaliseMigrationMuseumEvent,
} from "@/lib/sources/migration-museum";
import { fetchVamEastEvents, normaliseVamEastEvent } from "@/lib/sources/vam-east";
import { fetchBioLinkEvents, normaliseBioLinkEvent } from "@/lib/sources/bio-link";
import {
  fetchFactoryInternationalEvents,
  normaliseFactoryInternationalEvent,
} from "@/lib/sources/factory-international";
import {
  fetchAfricaCentreEvents,
  normaliseAfricaCentreEvent,
} from "@/lib/sources/africa-centre";
import { fetch198Events, normalise198Event } from "@/lib/sources/gallery-198";
import {
  fetchOctoberGalleryEvents,
  normaliseOctoberGalleryEvent,
} from "@/lib/sources/october-gallery";

// Single entry point for the whole pipeline: fetch every source, then
// dedup/classify/score the result. This replaces what used to be four
// separate per-source routes plus three separately-triggered pipeline
// stages that had to be called by hand, in the right order, after every
// ingest — a newly ingested event was invisible on the site until someone
// remembered to run all of them (see docs/PROJECT_PLAN.md Phase 3). The
// individual /api/ingest/*, /api/dedup, /api/classify, /api/quality routes
// were removed in favour of this one, except dedup/classify/quality which
// stay reachable standalone too for re-running just one stage.
export const dynamic = "force-dynamic";
// Default serverless timeout is too short once Serpentine's 6 listing
// fetches plus per-event detail fetches are added to the fan-out below;
// capped harmlessly by the plan's own ceiling if that's lower than 60s.
export const maxDuration = 60;

type AdminClient = ReturnType<typeof createAdminClient>;

interface SourceResult {
  fetched: number;
  upserted: number;
  errors: string[];
}

async function ingestBarbican(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBarbicanEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBarbicanEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSerpentine(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSerpentineEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSerpentineEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestEventbrite(admin: AdminClient): Promise<SourceResult> {
  if (EVENTBRITE_ORGANISERS.length === 0) {
    return {
      fetched: 0,
      upserted: 0,
      errors: [
        "EVENTBRITE_ORGANISERS is empty — add curated organiser IDs in lib/sources/eventbrite-organisers.ts",
      ],
    };
  }

  const raw = await fetchAllEventbriteEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const { organiser, event } of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseEventbriteEvent(organiser, event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSkiddle(admin: AdminClient): Promise<SourceResult> {
  // Skiddle's default `order` isn't date-ascending and a single page only
  // returns ~100 events by whatever that default ranking is — bounding to
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
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchSkiddleEvents({ minDate, maxDate, offset: page * 100 });
    raw.push(...batch);
    if (batch.length < 100) break;
  }

  let upserted = 0;
  const errors: string[] = [];
  for (const rawEvent of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSkiddleEvent(rawEvent));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${rawEvent.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestTicketmaster(admin: AdminClient): Promise<SourceResult> {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 8);
  const startDateTime = `${today.toISOString().split(".")[0]}Z`;
  const endDateTime = `${horizon.toISOString().split(".")[0]}Z`;

  type TicketmasterEventItem = Awaited<ReturnType<typeof fetchTicketmasterEvents>>[number];
  const raw: TicketmasterEventItem[] = [];
  const MAX_PAGES = 2;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchTicketmasterEvents({ startDateTime, endDateTime, page });
    raw.push(...batch);
    if (batch.length < 200) break;
  }

  let upserted = 0;
  const errors: string[] = [];
  for (const rawEvent of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseTicketmasterEvent(rawEvent));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${rawEvent.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestAutograph(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchAutographEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseAutographEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestQueerBritain(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchQueerBritainEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseQueerBritainEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestTate(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchTateEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseTateEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHorniman(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHornimanEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHornimanEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestIca(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchIcaEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseIcaEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestWhitechapel(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchWhitechapelEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseWhitechapelEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSouthLondonGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSouthLondonGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSouthLondonGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestMigrationMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchMigrationMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseMigrationMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestVamEast(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchVamEastEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseVamEastEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFactoryInternational(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFactoryInternationalEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFactoryInternationalEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestAfricaCentre(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchAfricaCentreEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseAfricaCentreEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingest198Gallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetch198Events();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normalise198Event(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.uid}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestBioLinks(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBioLinkEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBioLinkEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestOctoberGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchOctoberGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseOctoberGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

// A whole source failing to fetch (bad API key, site redesign, network
// blip) must not take the other three down with it — each is isolated here
// rather than letting one thrown error abort the whole Promise.all.
async function runSource(name: string, fn: () => Promise<SourceResult>): Promise<SourceResult> {
  try {
    return await fn();
  } catch (err) {
    return { fetched: 0, upserted: 0, errors: [`${name} fetch failed: ${(err as Error).message}`] };
  }
}

export async function GET(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [
    barbican,
    eventbrite,
    serpentine,
    skiddle,
    ticketmaster,
    autograph,
    queerBritain,
    tate,
    horniman,
    ica,
    whitechapel,
    southLondonGallery,
    migrationMuseum,
    vamEast,
    bioLinks,
    factoryInternational,
    africaCentre,
    gallery198,
    octoberGallery,
  ] = await Promise.all([
    runSource("barbican", () => ingestBarbican(admin)),
    runSource("eventbrite", () => ingestEventbrite(admin)),
    runSource("serpentine", () => ingestSerpentine(admin)),
    runSource("skiddle", () => ingestSkiddle(admin)),
    runSource("ticketmaster", () => ingestTicketmaster(admin)),
    runSource("autograph", () => ingestAutograph(admin)),
    runSource("queer-britain", () => ingestQueerBritain(admin)),
    runSource("tate", () => ingestTate(admin)),
    runSource("horniman", () => ingestHorniman(admin)),
    runSource("ica", () => ingestIca(admin)),
    runSource("whitechapel", () => ingestWhitechapel(admin)),
    runSource("south-london-gallery", () => ingestSouthLondonGallery(admin)),
    runSource("migration-museum", () => ingestMigrationMuseum(admin)),
    runSource("vam-east", () => ingestVamEast(admin)),
    runSource("bio-links", () => ingestBioLinks(admin)),
    runSource("factory-international", () => ingestFactoryInternational(admin)),
    runSource("africa-centre", () => ingestAfricaCentre(admin)),
    runSource("198-gallery", () => ingest198Gallery(admin)),
    runSource("october-gallery", () => ingestOctoberGallery(admin)),
  ]);

  // Sequential and isolated from here: expire first so dedup/classify/
  // quality don't waste work on rows that will never be shown again, then
  // dedup before classify/quality so merged venues improve dedup's own
  // event-matching — each stage's failure is reported rather than aborting
  // the ones after it.
  let expiry: Awaited<ReturnType<typeof runExpiry>> | { error: string };
  try {
    expiry = await runExpiry(admin);
  } catch (err) {
    expiry = { error: (err as Error).message };
  }

  let dedup: Awaited<ReturnType<typeof runDedup>> | { error: string };
  try {
    dedup = await runDedup(admin);
  } catch (err) {
    dedup = { error: (err as Error).message };
  }

  let classify: Awaited<ReturnType<typeof runClassification>> | { error: string };
  try {
    classify = await runClassification(admin);
  } catch (err) {
    classify = { error: (err as Error).message };
  }

  let quality: Awaited<ReturnType<typeof runQualityScoring>> | { error: string };
  try {
    quality = await runQualityScoring(admin);
  } catch (err) {
    quality = { error: (err as Error).message };
  }

  return NextResponse.json({
    sources: {
      barbican,
      eventbrite,
      serpentine,
      skiddle,
      ticketmaster,
      autograph,
      queerBritain,
      tate,
      horniman,
      ica,
      whitechapel,
      southLondonGallery,
      migrationMuseum,
      vamEast,
      bioLinks,
      factoryInternational,
      africaCentre,
      gallery198,
      octoberGallery,
    },
    expiry,
    dedup,
    classify,
    quality,
  });
}
