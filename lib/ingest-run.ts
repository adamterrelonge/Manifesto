import { createAdminClient } from "@/lib/supabase/admin";
import { upsertNormalisedEvent } from "@/lib/ingest";
import {
  runExpiry,
  runDedup,
  runClassification,
  runCategoryInference,
  runQualityScoring,
  runPrune,
  runYield,
} from "@/lib/pipeline";
import { runNotificationDelivery } from "@/lib/notifications";
import { mapWithConcurrency } from "@/lib/sources/scrape-utils";
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
  fetchNewArtGalleryWalsallEvents,
  normaliseNewArtGalleryWalsallEvent,
} from "@/lib/sources/new-art-gallery-walsall";
import { fetchBluecoatEvents, normaliseBluecoatEvent } from "@/lib/sources/bluecoat";
import {
  fetchGoldenThreadGalleryEvents,
  normaliseGoldenThreadGalleryEvent,
} from "@/lib/sources/golden-thread-gallery";
import {
  fetchStreetLevelPhotoworksEvents,
  normaliseStreetLevelPhotoworksEvent,
} from "@/lib/sources/street-level-photoworks";
import {
  fetchFruitmarketGalleryEvents,
  normaliseFruitmarketGalleryEvent,
} from "@/lib/sources/fruitmarket-gallery";
import { fetchSpikeIslandEvents, normaliseSpikeIslandEvent } from "@/lib/sources/spike-island";
import { fetchGomaEvents, normaliseGomaEvent } from "@/lib/sources/goma";
import {
  fetchBurrellCollectionEvents,
  normaliseBurrellCollectionEvent,
} from "@/lib/sources/burrell-collection";
import {
  fetchRiversideMuseumEvents,
  normaliseRiversideMuseumEvent,
} from "@/lib/sources/riverside-museum";
import {
  fetchTalbotRiceGalleryEvents,
  normaliseTalbotRiceGalleryEvent,
} from "@/lib/sources/talbot-rice-gallery";
import { fetchDcaEvents, normaliseDcaEvent } from "@/lib/sources/dca";
import { fetchVamDundeeEvents, normaliseVamDundeeEvent } from "@/lib/sources/vam-dundee";
import {
  fetchMacBirminghamEvents,
  normaliseMacBirminghamEvent,
} from "@/lib/sources/mac-birmingham";
import { fetchFirstsiteEvents, normaliseFirstsiteEvent } from "@/lib/sources/firstsite";
import {
  fetchSainsburyCentreEvents,
  normaliseSainsburyCentreEvent,
} from "@/lib/sources/sainsbury-centre";
import {
  fetchNationalMuseumCardiffEvents,
  normaliseNationalMuseumCardiffEvent,
} from "@/lib/sources/national-museum-cardiff";
import { fetchFabricaEvents, normaliseFabricaEvent } from "@/lib/sources/fabrica";
import { fetchHunterianEvents, normaliseHunterianEvent } from "@/lib/sources/hunterian";
import { fetchKettlesYardEvents, normaliseKettlesYardEvent } from "@/lib/sources/kettles-yard";
import {
  fetchHenryMooreInstituteEvents,
  normaliseHenryMooreInstituteEvent,
} from "@/lib/sources/henry-moore-institute";
import { fetchFactLiverpoolEvents, normaliseFactLiverpoolEvent } from "@/lib/sources/fact-liverpool";
import {
  fetchLaingArtGalleryEvents,
  normaliseLaingArtGalleryEvent,
} from "@/lib/sources/laing-art-gallery";
import { fetchHattonGalleryEvents, normaliseHattonGalleryEvent } from "@/lib/sources/hatton-gallery";
import {
  fetchGreatNorthMuseumEvents,
  normaliseGreatNorthMuseumEvent,
} from "@/lib/sources/great-north-museum";
import {
  fetchDiscoveryMuseumEvents,
  normaliseDiscoveryMuseumEvent,
} from "@/lib/sources/discovery-museum-newcastle";
import { fetchBowesMuseumEvents, normaliseBowesMuseumEvent } from "@/lib/sources/bowes-museum";
import {
  fetchManchesterMuseumEvents,
  normaliseManchesterMuseumEvent,
} from "@/lib/sources/manchester-museum";
import {
  fetchRoyalPavilionMuseumsEvents,
  normaliseRoyalPavilionMuseumsEvent,
} from "@/lib/sources/royal-pavilion-museums";
import {
  fetchDeLaWarrPavilionEvents,
  normaliseDeLaWarrPavilionEvent,
} from "@/lib/sources/de-la-warr-pavilion";
import {
  fetchHastingsContemporaryEvents,
  normaliseHastingsContemporaryEvent,
} from "@/lib/sources/hastings-contemporary";
import {
  fetchVamSouthKensingtonEvents,
  normaliseVamSouthKensingtonEvent,
} from "@/lib/sources/vam-south-kensington";
import {
  fetchAmgueddfaCymruEvents,
  normaliseAmgueddfaCymruEvent,
} from "@/lib/sources/amgueddfa-cymru";
import {
  fetchAberdeenArtGalleryEvents,
  normaliseAberdeenArtGalleryEvent,
} from "@/lib/sources/aberdeen-art-gallery";
import {
  fetchLeicesterMuseumsEvents,
  normaliseLeicesterMuseumsEvent,
} from "@/lib/sources/leicester-museums";
import {
  fetchVictoriaArtGalleryEvents,
  normaliseVictoriaArtGalleryEvent,
} from "@/lib/sources/victoria-art-gallery";
import {
  fetchFitzwilliamMuseumEvents,
  normaliseFitzwilliamMuseumEvent,
} from "@/lib/sources/fitzwilliam-museum";
import {
  fetchHolburneMuseumEvents,
  normaliseHolburneMuseumEvent,
} from "@/lib/sources/holburne-museum";
import {
  fetchWolverhamptonArtGalleryEvents,
  normaliseWolverhamptonArtGalleryEvent,
} from "@/lib/sources/wolverhampton-art-gallery";
import {
  fetchNottinghamContemporaryEvents,
  normaliseNottinghamContemporaryEvent,
} from "@/lib/sources/nottingham-contemporary";
import { fetchJoshLilleyEvents, normaliseJoshLilleyEvent } from "@/lib/sources/josh-lilley";
import { fetchHope93Events, normaliseHope93Event } from "@/lib/sources/hope93";
import { fetchVardaxoglouEvents, normaliseVardaxoglouEvent } from "@/lib/sources/vardaxoglou";
import { fetchSetarehEvents, normaliseSetarehEvent } from "@/lib/sources/setareh";
import {
  fetchNicolettiContemporaryEvents,
  normaliseNicolettiContemporaryEvent,
} from "@/lib/sources/nicoletti-contemporary";
import { fetchCopelandParkEvents, normaliseCopelandParkEvent } from "@/lib/sources/copeland-park";
import { fetchCubittEvents, normaliseCubittEvent } from "@/lib/sources/cubitt";
import { fetchYardTheatreEvents, normaliseYardTheatreEvent } from "@/lib/sources/yard-theatre";
import { fetchSadlersWellsEvents, normaliseSadlersWellsEvent } from "@/lib/sources/sadlers-wells";
import { fetchLadbrokeHallEvents, normaliseLadbrokeHallEvent } from "@/lib/sources/ladbroke-hall";
import { fetchBrixtonHouseEvents, normaliseBrixtonHouseEvent } from "@/lib/sources/brixton-house";

// Single entry point for the whole pipeline: fetch every source, then
// dedup/classify/score the result. This replaces what used to be four
// separate per-source routes plus three separately-triggered pipeline
// stages that had to be called by hand, in the right order, after every
// ingest — a newly ingested event was invisible on the site until someone
// remembered to run all of them (see docs/PROJECT_PLAN.md Phase 3). The
// individual /api/ingest/*, /api/dedup, /api/classify, /api/quality routes
// were removed in favour of this one, except dedup/classify/quality which
// stay reachable standalone too for re-running just one stage.

type AdminClient = ReturnType<typeof createAdminClient>;

export interface SourceResult {
  fetched: number;
  upserted: number;
  errors: string[];
  // Deliberately not run (missing optional credential, venue blocks bots) —
  // reported as such by the health check instead of as a breakage.
  skipped?: string;
  // The whole source threw before returning (network failure, listing
  // 4xx/5xx, site redesign) — as opposed to individual events failing.
  fatal?: string;
  // events.source_provider this source writes — lets the health report join
  // fetched/upserted with runYield's per-provider shown counts. Set by
  // runSource, not by each ingestX().
  provider?: string;
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

  const { events: raw, errors: organiserErrors } = await fetchAllEventbriteEvents();
  let upserted = 0;
  const errors: string[] = [...organiserErrors];
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

const HOME_MANCHESTER_BLOCKED = true;

async function ingestHomeManchester(admin: AdminClient): Promise<SourceResult> {
  // Since Nov 2026 homemcr.org answers every non-browser request with a
  // Bunny Shield bot challenge (403 + challenge cookies; the old apex URL
  // redirect-loops). robots.txt still allows /whats-on, but an active
  // challenge is a clear "no bots" signal — same call as NPG/NHM in
  // docs/PROJECT_PLAN.md: skip rather than work around it. Set the flag
  // above to false to re-test if they lift it.
  if (HOME_MANCHESTER_BLOCKED) {
    return { fetched: 0, upserted: 0, errors: [], skipped: "site serves a bot challenge (Bunny Shield) since Nov 2026" };
  }
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

async function ingestBluecoat(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBluecoatEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBluecoatEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestGoldenThreadGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchGoldenThreadGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseGoldenThreadGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestStreetLevelPhotoworks(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchStreetLevelPhotoworksEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseStreetLevelPhotoworksEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFruitmarketGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFruitmarketGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFruitmarketGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSpikeIsland(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSpikeIslandEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSpikeIslandEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestGoma(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchGomaEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseGomaEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestBurrellCollection(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBurrellCollectionEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBurrellCollectionEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestRiversideMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchRiversideMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseRiversideMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestTalbotRiceGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchTalbotRiceGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseTalbotRiceGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestDca(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchDcaEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseDcaEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestVamDundee(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchVamDundeeEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseVamDundeeEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestMacBirmingham(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchMacBirminghamEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseMacBirminghamEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFirstsite(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFirstsiteEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFirstsiteEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSainsburyCentre(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSainsburyCentreEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSainsburyCentreEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNationalMuseumCardiff(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNationalMuseumCardiffEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNationalMuseumCardiffEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFabrica(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFabricaEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFabricaEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHunterian(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHunterianEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHunterianEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestKettlesYard(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchKettlesYardEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseKettlesYardEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHenryMooreInstitute(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHenryMooreInstituteEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHenryMooreInstituteEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFactLiverpool(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFactLiverpoolEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFactLiverpoolEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestLaingArtGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchLaingArtGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseLaingArtGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHattonGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHattonGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHattonGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestGreatNorthMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchGreatNorthMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseGreatNorthMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestDiscoveryMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchDiscoveryMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseDiscoveryMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestBowesMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBowesMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBowesMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestManchesterMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchManchesterMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseManchesterMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestRoyalPavilionMuseums(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchRoyalPavilionMuseumsEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseRoyalPavilionMuseumsEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestDeLaWarrPavilion(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchDeLaWarrPavilionEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseDeLaWarrPavilionEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHastingsContemporary(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHastingsContemporaryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHastingsContemporaryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestVamSouthKensington(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchVamSouthKensingtonEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseVamSouthKensingtonEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestAmgueddfaCymru(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchAmgueddfaCymruEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseAmgueddfaCymruEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestAberdeenArtGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchAberdeenArtGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseAberdeenArtGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestLeicesterMuseums(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchLeicesterMuseumsEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseLeicesterMuseumsEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestVictoriaArtGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchVictoriaArtGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseVictoriaArtGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestFitzwilliamMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchFitzwilliamMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseFitzwilliamMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHolburneMuseum(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHolburneMuseumEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHolburneMuseumEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestWolverhamptonArtGallery(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchWolverhamptonArtGalleryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseWolverhamptonArtGalleryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNottinghamContemporary(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNottinghamContemporaryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNottinghamContemporaryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestJoshLilley(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchJoshLilleyEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseJoshLilleyEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestHope93(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchHope93Events();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseHope93Event(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestVardaxoglou(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchVardaxoglouEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseVardaxoglouEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSetareh(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSetarehEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSetarehEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestNicolettiContemporary(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchNicolettiContemporaryEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseNicolettiContemporaryEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestCopelandPark(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchCopelandParkEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseCopelandParkEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestCubitt(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchCubittEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseCubittEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestYardTheatre(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchYardTheatreEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseYardTheatreEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSadlersWells(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchSadlersWellsEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSadlersWellsEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestLadbrokeHall(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchLadbrokeHallEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseLadbrokeHallEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.slug}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestBrixtonHouse(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBrixtonHouseEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBrixtonHouseEvent(event));
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
// `name` is the source key used in logs and normally equals the
// events.source_provider it writes; pass `provider` when it doesn't.
async function runSource(
  name: string,
  fn: () => Promise<SourceResult>,
  provider: string = name
): Promise<SourceResult> {
  try {
    return { ...(await fn()), provider };
  } catch (err) {
    const err_ = err as Error & { cause?: { message?: string } };
    // undici's "fetch failed" hides the real reason (DNS, TLS, redirect
    // loop) in .cause — surface it so the health report is actionable.
    const message = err_.cause?.message ? `${err_.message} (${err_.cause.message})` : err_.message;
    if (process.env.GITHUB_ACTIONS && CI_IP_BLOCKED_SOURCES.has(name) && /\b(403|405)\b/.test(message)) {
      return {
        fetched: 0,
        upserted: 0,
        errors: [],
        skipped: `blocks GitHub Actions runner IPs (${message.slice(0, 80)}) — works from a home connection`,
        provider,
      };
    }
    return {
      fetched: 0,
      upserted: 0,
      errors: [`${name} fetch failed: ${message}`],
      fatal: message,
      provider,
    };
  }
}

// Sources whose listing answers 403/405 to GitHub's datacenter runner IPs
// but 200 to the same request from a residential connection (verified
// 2026-11-25 — robots.txt allows them; they filter by IP range, not by
// bot identity). We don't work around an IP block. They're still tried on
// every run, so they come back on their own if the block lifts; while it
// holds, a 403/405 in CI is reported as `skipped`, not `broken` (which would
// fail the job daily). Any other error still counts as broken.
const CI_IP_BLOCKED_SOURCES = new Set(["serpentine", "fact-liverpool", "ladbroke-hall", "sainsbury-centre"]);

// Running all ~90 sources fully in parallel (plain Promise.all) meant every
// source's sequential per-event upsertVenue/upsertOrganiser/events.upsert
// chain was hammering Supabase's connection pool at the same time — a real
// ingest run on 2026-09-11 came back with "canceling statement due to
// statement timeout" / "Timed out acquiring connection from connection
// pool" scattered across nearly every source (most landed at 80-95% of
// events upserted, not 100%). Capping how many sources run at once bounds
// how many concurrent per-event upsert chains hit the DB simultaneously.
// Picked conservatively; raise it if ingest runs feel too slow and the
// error rate stays low, lower it if timeouts persist.
const INGEST_SOURCE_CONCURRENCY = 8;

export type IngestRunResult = Awaited<ReturnType<typeof runIngest>>;

// The whole pipeline: every source, then expiry/dedup/classify/category/
// quality/prune/notify. Called by app/api/ingest/route.ts (manual trigger)
// and scripts/ingest.ts (scheduled GitHub Actions run — a full run takes
// 5+ minutes, far past a serverless function's time limit).
export async function runIngest(admin: AdminClient = createAdminClient()) {

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
    newArtGalleryWalsall,
    bluecoat,
    goldenThreadGallery,
    streetLevelPhotoworks,
    fruitmarketGallery,
    spikeIsland,
    goma,
    burrellCollection,
    riversideMuseum,
    talbotRiceGallery,
    dca,
    vamDundee,
    macBirmingham,
    firstsite,
    sainsburyCentre,
    nationalMuseumCardiff,
    fabrica,
    hunterian,
    kettlesYard,
    henryMooreInstitute,
    factLiverpool,
    laingArtGallery,
    hattonGallery,
    greatNorthMuseum,
    discoveryMuseum,
    bowesMuseum,
    manchesterMuseum,
    royalPavilionMuseums,
    deLaWarrPavilion,
    hastingsContemporary,
    joshLilley,
    hope93,
    vardaxoglou,
    setareh,
    nicolettiContemporary,
    copelandPark,
    cubitt,
    yardTheatre,
    sadlersWells,
    ladbrokeHall,
    brixtonHouse,
    // These 9 had thunks in the array below but no matching destructured
    // name here — a pre-existing gap (not introduced by this concurrency
    // refactor) meaning their fetch/upsert results were silently missing
    // from the API response, even though the sources themselves were
    // ingesting fine the whole time (upserts are a side effect inside
    // ingestX(), independent of whether the caller captures the return
    // value). Found while auditing this block for the mapWithConcurrency
    // change, fixed alongside it.
    vamSouthKensington,
    amgueddfaCymru,
    aberdeenArtGallery,
    leicesterMuseums,
    victoriaArtGallery,
    fitzwilliamMuseum,
    holburneMuseum,
    wolverhamptonArtGallery,
    nottinghamContemporary,
  ] = await mapWithConcurrency(
    [
    () => runSource("barbican", () => ingestBarbican(admin)),
    () => runSource("eventbrite", () => ingestEventbrite(admin)),
    () => runSource("serpentine", () => ingestSerpentine(admin)),
    () => runSource("skiddle", () => ingestSkiddle(admin)),
    () => runSource("ticketmaster", () => ingestTicketmaster(admin)),
    () => runSource("autograph", () => ingestAutograph(admin)),
    () => runSource("queer-britain", () => ingestQueerBritain(admin)),
    () => runSource("tate", () => ingestTate(admin)),
    () => runSource("horniman", () => ingestHorniman(admin)),
    () => runSource("ica", () => ingestIca(admin)),
    () => runSource("whitechapel", () => ingestWhitechapel(admin)),
    () => runSource("south-london-gallery", () => ingestSouthLondonGallery(admin)),
    () => runSource("migration-museum", () => ingestMigrationMuseum(admin)),
    () => runSource("vam-east", () => ingestVamEast(admin)),
    () => runSource("bio-links", () => ingestBioLinks(admin), "bio-link"),
    () => runSource("factory-international", () => ingestFactoryInternational(admin)),
    () => runSource("africa-centre", () => ingestAfricaCentre(admin)),
    () => runSource("198-gallery", () => ingest198Gallery(admin)),
    () => runSource("october-gallery", () => ingestOctoberGallery(admin)),
    () => runSource("wellcome", () => ingestWellcome(admin)),
    () => runSource("gasworks", () => ingestGasworks(admin)),
    () => runSource("museum-of-home", () => ingestMuseumOfHome(admin)),
    () => runSource("arnolfini", () => ingestArnolfini(admin)),
    () => runSource("dadafest", () => ingestDadafest(admin)),
    () => runSource("new-art-exchange", () => ingestNewArtExchange(admin)),
    () => runSource("attenborough-arts", () => ingestAttenboroughArts(admin)),
    () => runSource("cartwright-hall", () => ingestCartwrightHall(admin)),
    () => runSource("shape-arts", () => ingestShapeArts(admin)),
    () => runSource("design-museum", () => ingestDesignMuseum(admin)),
    () => runSource("national-gallery", () => ingestNationalGallery(admin)),
    () => runSource("soane", () => ingestSoane(admin)),
    () => runSource("photographers-gallery", () => ingestPhotographersGallery(admin)),
    () => runSource("fashion-textile-museum", () => ingestFashionTextileMuseum(admin)),
    () => runSource("national-army-museum", () => ingestNationalArmyMuseum(admin)),
    () => runSource("home-manchester", () => ingestHomeManchester(admin)),
    () => runSource("yorkshire-sculpture-park", () => ingestYorkshireSculpturePark(admin)),
    () => runSource("pallant-house", () => ingestPallantHouse(admin)),
    () => runSource("hepworth-wakefield", () => ingestHepworthWakefield(admin)),
    () => runSource("ibraaz", () => ingestIbraaz(admin)),
    () => runSource("national-museum-scotland", () => ingestNationalMuseumScotland(admin)),
    () => runSource("birmingham-museum", () => ingestBirminghamMuseum(admin)),
    () => runSource("herbert-coventry", () => ingestHerbertCoventry(admin)),
    () => runSource("leeds-art-gallery", () => ingestLeedsArtGallery(admin)),
    () => runSource("kelvingrove", () => ingestKelvingrove(admin)),
    () => runSource("new-art-gallery-walsall", () => ingestNewArtGalleryWalsall(admin)),
    () => runSource("bluecoat", () => ingestBluecoat(admin)),
    () => runSource("golden-thread-gallery", () => ingestGoldenThreadGallery(admin)),
    () => runSource("street-level-photoworks", () => ingestStreetLevelPhotoworks(admin)),
    () => runSource("fruitmarket-gallery", () => ingestFruitmarketGallery(admin)),
    () => runSource("spike-island", () => ingestSpikeIsland(admin)),
    () => runSource("goma", () => ingestGoma(admin)),
    () => runSource("burrell-collection", () => ingestBurrellCollection(admin)),
    () => runSource("riverside-museum", () => ingestRiversideMuseum(admin)),
    () => runSource("talbot-rice-gallery", () => ingestTalbotRiceGallery(admin)),
    () => runSource("dca", () => ingestDca(admin)),
    () => runSource("vam-dundee", () => ingestVamDundee(admin)),
    () => runSource("mac-birmingham", () => ingestMacBirmingham(admin)),
    () => runSource("firstsite", () => ingestFirstsite(admin)),
    () => runSource("sainsbury-centre", () => ingestSainsburyCentre(admin)),
    () => runSource("national-museum-cardiff", () => ingestNationalMuseumCardiff(admin)),
    () => runSource("fabrica", () => ingestFabrica(admin)),
    () => runSource("hunterian", () => ingestHunterian(admin)),
    () => runSource("kettles-yard", () => ingestKettlesYard(admin)),
    () => runSource("henry-moore-institute", () => ingestHenryMooreInstitute(admin)),
    () => runSource("fact-liverpool", () => ingestFactLiverpool(admin)),
    () => runSource("laing-art-gallery", () => ingestLaingArtGallery(admin)),
    () => runSource("hatton-gallery", () => ingestHattonGallery(admin)),
    () => runSource("great-north-museum", () => ingestGreatNorthMuseum(admin)),
    () => runSource("discovery-museum-newcastle", () => ingestDiscoveryMuseum(admin)),
    () => runSource("bowes-museum", () => ingestBowesMuseum(admin)),
    () => runSource("manchester-museum", () => ingestManchesterMuseum(admin)),
    () => runSource("royal-pavilion-museums", () => ingestRoyalPavilionMuseums(admin)),
    () => runSource("de-la-warr-pavilion", () => ingestDeLaWarrPavilion(admin)),
    () => runSource("hastings-contemporary", () => ingestHastingsContemporary(admin)),
    () => runSource("josh-lilley", () => ingestJoshLilley(admin)),
    () => runSource("hope93", () => ingestHope93(admin)),
    () => runSource("vardaxoglou", () => ingestVardaxoglou(admin)),
    () => runSource("setareh", () => ingestSetareh(admin)),
    () => runSource("nicoletti-contemporary", () => ingestNicolettiContemporary(admin)),
    () => runSource("copeland-park", () => ingestCopelandPark(admin)),
    () => runSource("cubitt", () => ingestCubitt(admin)),
    () => runSource("yard-theatre", () => ingestYardTheatre(admin)),
    () => runSource("sadlers-wells", () => ingestSadlersWells(admin)),
    () => runSource("ladbroke-hall", () => ingestLadbrokeHall(admin)),
    () => runSource("brixton-house", () => ingestBrixtonHouse(admin)),
    () => runSource("vam-south-kensington", () => ingestVamSouthKensington(admin)),
    () => runSource("amgueddfa-cymru", () => ingestAmgueddfaCymru(admin)),
    () => runSource("aberdeen-art-gallery", () => ingestAberdeenArtGallery(admin)),
    () => runSource("leicester-museums", () => ingestLeicesterMuseums(admin)),
    () => runSource("victoria-art-gallery", () => ingestVictoriaArtGallery(admin)),
    () => runSource("fitzwilliam-museum", () => ingestFitzwilliamMuseum(admin)),
    () => runSource("holburne-museum", () => ingestHolburneMuseum(admin)),
    () => runSource("wolverhampton-art-gallery", () => ingestWolverhamptonArtGallery(admin)),
    () => runSource("nottingham-contemporary", () => ingestNottinghamContemporary(admin)),
    ],
    INGEST_SOURCE_CONCURRENCY,
    (run) => run()
  );

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


  // Read-only, after everything that changes what's public.
  let yieldStage: Awaited<ReturnType<typeof runYield>> | { error: string };
  try {
    yieldStage = await runYield(admin);
  } catch (err) {
    yieldStage = { error: (err as Error).message };
  }

  return {
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
      newArtGalleryWalsall,
      bluecoat,
      goldenThreadGallery,
      streetLevelPhotoworks,
      fruitmarketGallery,
      spikeIsland,
      goma,
      burrellCollection,
      riversideMuseum,
      talbotRiceGallery,
      dca,
      vamDundee,
      macBirmingham,
      firstsite,
      sainsburyCentre,
      nationalMuseumCardiff,
      fabrica,
      hunterian,
      kettlesYard,
      henryMooreInstitute,
      factLiverpool,
      laingArtGallery,
      hattonGallery,
      greatNorthMuseum,
      discoveryMuseum,
      bowesMuseum,
      manchesterMuseum,
      royalPavilionMuseums,
      deLaWarrPavilion,
      hastingsContemporary,
      joshLilley,
      hope93,
      vardaxoglou,
      setareh,
      nicolettiContemporary,
      copelandPark,
      cubitt,
      yardTheatre,
      sadlersWells,
      ladbrokeHall,
      brixtonHouse,
      vamSouthKensington,
      amgueddfaCymru,
      aberdeenArtGallery,
      leicesterMuseums,
      victoriaArtGallery,
      fitzwilliamMuseum,
      holburneMuseum,
      wolverhamptonArtGallery,
      nottinghamContemporary,
    },
    expiry,
    dedup,
    classify,
    categoryInference,
    quality,
    prune,
    notify,
    yield: yieldStage,
  };
}
