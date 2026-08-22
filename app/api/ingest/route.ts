import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { upsertNormalisedEvent } from "@/lib/ingest";
import {
  runExpiry,
  runDedup,
  runClassification,
  runCategoryInference,
  runQualityScoring,
  runPrune,
} from "@/lib/pipeline";
import { runNotificationDelivery } from "@/lib/notifications";
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
import { fetchWellcomeEvents, normaliseWellcomeEvent } from "@/lib/sources/wellcome";
import { fetchGasworksEvents, normaliseGasworksEvent } from "@/lib/sources/gasworks";
import {
  fetchMuseumOfHomeEvents,
  normaliseMuseumOfHomeEvent,
} from "@/lib/sources/museum-of-home";
import { fetchArnolfiniEvents, normaliseArnolfiniEvent } from "@/lib/sources/arnolfini";
import { fetchDadafestEvents, normaliseDadafestEvent } from "@/lib/sources/dadafest";
import {
  fetchNewArtExchangeEvents,
  normaliseNewArtExchangeEvent,
} from "@/lib/sources/new-art-exchange";
import {
  fetchAttenboroughArtsEvents,
  normaliseAttenboroughArtsEvent,
} from "@/lib/sources/attenborough-arts";
import {
  fetchCartwrightHallEvents,
  normaliseCartwrightHallEvent,
} from "@/lib/sources/cartwright-hall";
import { fetchShapeArtsEvents, normaliseShapeArtsEvent } from "@/lib/sources/shape-arts";
import {
  fetchDesignMuseumEvents,
  normaliseDesignMuseumEvent,
} from "@/lib/sources/design-museum";
import {
  fetchNationalGalleryEvents,
  normaliseNationalGalleryEvent,
} from "@/lib/sources/national-gallery";
import { fetchSoaneEvents, normaliseSoaneEvent } from "@/lib/sources/soane";
import {
  fetchPhotographersGalleryEvents,
  normalisePhotographersGalleryEvent,
} from "@/lib/sources/photographers-gallery";
import {
  fetchFashionTextileMuseumEvents,
  normaliseFashionTextileMuseumEvent,
} from "@/lib/sources/fashion-textile-museum";
import {
  fetchNationalArmyMuseumEvents,
  normaliseNationalArmyMuseumEvent,
} from "@/lib/sources/national-army-museum";
import {
  fetchHomeManchesterEvents,
  normaliseHomeManchesterEvent,
} from "@/lib/sources/home-manchester";
import {
  fetchYorkshireSculptureParkEvents,
  normaliseYorkshireSculptureParkEvent,
} from "@/lib/sources/yorkshire-sculpture-park";
import { fetchPallantHouseEvents, normalisePallantHouseEvent } from "@/lib/sources/pallant-house";
import {
  fetchHepworthWakefieldEvents,
  normaliseHepworthWakefieldEvent,
} from "@/lib/sources/hepworth-wakefield";
import { fetchIbraazEvents, normaliseIbraazEvent } from "@/lib/sources/ibraaz";
import {
  fetchNationalMuseumScotlandEvents,
  normaliseNationalMuseumScotlandEvent,
} from "@/lib/sources/national-museum-scotland";
import {
  fetchBirminghamMuseumEvents,
  normaliseBirminghamMuseumEvent,
} from "@/lib/sources/birmingham-museum";
import {
  fetchHerbertCoventryEvents,
  normaliseHerbertCoventryEvent,
} from "@/lib/sources/herbert-coventry";
import {
  fetchLeedsArtGalleryEvents,
  normaliseLeedsArtGalleryEvent,
} from "@/lib/sources/leeds-art-gallery";
import { fetchKelvingroveEvents, normaliseKelvingroveEvent } from "@/lib/sources/kelvingrove";
import {
  fetchOutsavvyEvents,
  flattenOutsavvyEvents,
  normaliseOutsavvyEvent,
} from "@/lib/sources/outsavvy";
import {
  fetchNewArtGalleryWalsallEvents,
  normaliseNewArtGalleryWalsallEvent,
} from "@/lib/sources/new-art-gallery-walsall";

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
  // Was 3 — the last ingest run returned exactly 3 full pages of 100
  // (300/300), the signature of hitting this cap rather than genuinely
  // running out of results. Barbican already pages up to 20 deep within
  // the same maxDuration=60s budget below, so this has headroom.
  const MAX_PAGES = 6;
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
  // Was 2 — the last ingest run returned exactly 2 full pages of 200
  // (400/400), the same hit-the-cap signature as Skiddle above.
  const MAX_PAGES = 4;
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

async function ingestWellcome(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchWellcomeEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseWellcomeEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.uid}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestGasworks(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchGasworksEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseGasworksEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestMuseumOfHome(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchMuseumOfHomeEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseMuseumOfHomeEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestArnolfini(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchArnolfiniEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseArnolfiniEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestDadafest(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchDadafestEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseDadafestEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNewArtExchange(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNewArtExchangeEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNewArtExchangeEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestAttenboroughArts(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchAttenboroughArtsEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseAttenboroughArtsEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestCartwrightHall(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchCartwrightHallEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseCartwrightHallEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestShapeArts(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchShapeArtsEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseShapeArtsEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestDesignMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchDesignMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseDesignMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNationalGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNationalGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNationalGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSoane(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSoaneEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSoaneEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestPhotographersGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchPhotographersGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normalisePhotographersGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFashionTextileMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFashionTextileMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFashionTextileMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNationalArmyMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNationalArmyMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNationalArmyMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHomeManchester(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHomeManchesterEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHomeManchesterEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestYorkshireSculpturePark(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchYorkshireSculptureParkEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseYorkshireSculptureParkEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestPallantHouse(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchPallantHouseEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normalisePallantHouseEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHepworthWakefield(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHepworthWakefieldEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHepworthWakefieldEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestIbraaz(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchIbraazEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseIbraazEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNationalMuseumScotland(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNationalMuseumScotlandEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNationalMuseumScotlandEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestBirminghamMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBirminghamMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBirminghamMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHerbertCoventry(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHerbertCoventryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHerbertCoventryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestLeedsArtGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchLeedsArtGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseLeedsArtGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestKelvingrove(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchKelvingroveEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseKelvingroveEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestOutsavvy(admin: AdminClient): Promise<SourceResult> {
  // Central-UK point + large radius, same "stand-in for the whole UK"
  // approach as Skiddle above — Outsavvy's `range` unit (miles, per the
  // docs) is more clearly specified than Skiddle's undocumented radius.
  const DEFAULT_LATITUDE = 52.4862; // Birmingham
  const DEFAULT_LONGITUDE = -1.8904;
  const DEFAULT_RANGE = 200;

  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 8);
  const startDate = today.toISOString().slice(0, 10);
  const endDate = horizon.toISOString().slice(0, 10);

  const raw: Awaited<ReturnType<typeof fetchOutsavvyEvents>>["events"] = [];
  const PAGE_SIZE = 50;
  const MAX_PAGES = 10;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchOutsavvyEvents({
      latitude: DEFAULT_LATITUDE,
      longitude: DEFAULT_LONGITUDE,
      range: DEFAULT_RANGE,
      startDate,
      endDate,
      pageNumber: page,
      pageSize: PAGE_SIZE,
    });
    raw.push(...(batch.events ?? []));
    if ((batch.events?.length ?? 0) < PAGE_SIZE) break;
  }

  const flattened = flattenOutsavvyEvents(raw);
  let upserted = 0;
  const errors: string[] = [];
  for (const eventDate of flattened) {
    try {
      await upsertNormalisedEvent(admin, normaliseOutsavvyEvent(eventDate));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${eventDate.event.id}-${eventDate.date.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: flattened.length, upserted, errors };
}

async function ingestNewArtGalleryWalsall(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNewArtGalleryWalsallEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNewArtGalleryWalsallEvent(event));
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
    wellcome,
    gasworks,
    museumOfHome,
    arnolfini,
    dadafest,
    newArtExchange,
    attenboroughArts,
    cartwrightHall,
    shapeArts,
    designMuseum,
    nationalGallery,
    soane,
    photographersGallery,
    fashionTextileMuseum,
    nationalArmyMuseum,
    homeManchester,
    yorkshireSculpturePark,
    pallantHouse,
    hepworthWakefield,
    ibraaz,
    nationalMuseumScotland,
    birminghamMuseum,
    herbertCoventry,
    leedsArtGallery,
    kelvingrove,
    outsavvy,
    newArtGalleryWalsall,
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
    runSource("wellcome", () => ingestWellcome(admin)),
    runSource("gasworks", () => ingestGasworks(admin)),
    runSource("museum-of-home", () => ingestMuseumOfHome(admin)),
    runSource("arnolfini", () => ingestArnolfini(admin)),
    runSource("dadafest", () => ingestDadafest(admin)),
    runSource("new-art-exchange", () => ingestNewArtExchange(admin)),
    runSource("attenborough-arts", () => ingestAttenboroughArts(admin)),
    runSource("cartwright-hall", () => ingestCartwrightHall(admin)),
    runSource("shape-arts", () => ingestShapeArts(admin)),
    runSource("design-museum", () => ingestDesignMuseum(admin)),
    runSource("national-gallery", () => ingestNationalGallery(admin)),
    runSource("soane", () => ingestSoane(admin)),
    runSource("photographers-gallery", () => ingestPhotographersGallery(admin)),
    runSource("fashion-textile-museum", () => ingestFashionTextileMuseum(admin)),
    runSource("national-army-museum", () => ingestNationalArmyMuseum(admin)),
    runSource("home-manchester", () => ingestHomeManchester(admin)),
    runSource("yorkshire-sculpture-park", () => ingestYorkshireSculpturePark(admin)),
    runSource("pallant-house", () => ingestPallantHouse(admin)),
    runSource("hepworth-wakefield", () => ingestHepworthWakefield(admin)),
    runSource("ibraaz", () => ingestIbraaz(admin)),
    runSource("national-museum-scotland", () => ingestNationalMuseumScotland(admin)),
    runSource("birmingham-museum", () => ingestBirminghamMuseum(admin)),
    runSource("herbert-coventry", () => ingestHerbertCoventry(admin)),
    runSource("leeds-art-gallery", () => ingestLeedsArtGallery(admin)),
    runSource("kelvingrove", () => ingestKelvingrove(admin)),
    runSource("outsavvy", () => ingestOutsavvy(admin)),
    runSource("new-art-gallery-walsall", () => ingestNewArtGalleryWalsall(admin)),
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

  let categoryInference: Awaited<ReturnType<typeof runCategoryInference>> | { error: string };
  try {
    categoryInference = await runCategoryInference(admin);
  } catch (err) {
    categoryInference = { error: (err as Error).message };
  }

  let quality: Awaited<ReturnType<typeof runQualityScoring>> | { error: string };
  try {
    quality = await runQualityScoring(admin);
  } catch (err) {
    quality = { error: (err as Error).message };
  }

  // Last: deletes rows quality/dedup/expiry only flagged, using this run's
  // freshly-set is_duplicate/status/quality_score.
  let prune: Awaited<ReturnType<typeof runPrune>> | { error: string };
  try {
    prune = await runPrune(admin);
  } catch (err) {
    prune = { error: (err as Error).message };
  }

  // Last: matches this run's newly-published events against saved
  // bucket/radius preferences and emails digests — must run after
  // classify (buckets need to exist to match against) and after prune
  // (no point notifying about an event this same run just deleted).
  let notify: Awaited<ReturnType<typeof runNotificationDelivery>> | { error: string };
  try {
    notify = await runNotificationDelivery(admin);
  } catch (err) {
    notify = { error: (err as Error).message };
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
      wellcome,
      gasworks,
      museumOfHome,
      arnolfini,
      dadafest,
      newArtExchange,
      attenboroughArts,
      cartwrightHall,
      shapeArts,
      designMuseum,
      nationalGallery,
      soane,
      photographersGallery,
      fashionTextileMuseum,
      nationalArmyMuseum,
      homeManchester,
      yorkshireSculpturePark,
      pallantHouse,
      hepworthWakefield,
      ibraaz,
      nationalMuseumScotland,
      birminghamMuseum,
      herbertCoventry,
      leedsArtGallery,
      kelvingrove,
      outsavvy,
      newArtGalleryWalsall,
    },
    expiry,
    dedup,
    classify,
    categoryInference,
    quality,
    prune,
    notify,
  });
}
