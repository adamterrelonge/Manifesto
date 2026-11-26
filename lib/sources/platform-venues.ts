import type { SpektrixVenueConfig } from "./spektrix";
import type { TribeSiteConfig } from "./tribe-events";

// Phase 4 (docs/INGESTION_EXPANSION_PLAN.md): venues read through a shared
// platform adapter instead of a bespoke scraper. Adding a venue on one of
// these platforms is one entry here — then classify it in
// lib/community-culture.ts / lib/source-missions.ts (or record why not) and
// add it to docs/SCRAPE_TARGETS.md.
//
// Every venue here was checked on 2026-11-26: robots.txt has no rule against
// this bot or AI crawlers, the API answered, and the venue's spaces are under
// 300 (lib/scale.ts) — or the large space is filtered out below.

const london = (name: string, address: string, postcode: string) => ({
  name,
  address,
  city: "London",
  region: "Greater London",
  postcode,
  lat: null,
  lng: null,
});

export const SPEKTRIX_VENUES: SpektrixVenueConfig[] = [
  {
    provider: "bishopsgate-institute",
    name: "Bishopsgate Institute",
    apiBase: "https://bookings.bishopsgate.org.uk/bishopsgateinstitute",
    whatsOnUrl: "https://www.bishopsgate.org.uk/whats-on",
    venue: london("Bishopsgate Institute", "230 Bishopsgate", "EC2M 4QH"),
    // Online-only sessions, and "Reading Room" (library opening hours).
    include: (e) => e.attribute_Location !== "Online" && !/^\s*reading room\s*$/i.test(e.name),
  },
  {
    provider: "rich-mix",
    name: "Rich Mix",
    apiBase: "https://tickets.richmix.org.uk/richmix",
    whatsOnUrl: "https://richmix.org.uk/whats-on/",
    venue: london("Rich Mix", "35-47 Bethnal Green Road", "E1 6LA"),
  },
  {
    provider: "artsadmin",
    name: "Artsadmin",
    apiBase: "https://shop.artsadmin.co.uk/artsadmin",
    whatsOnUrl: "https://www.artsadmin.co.uk/whats-on/",
    venue: london("Toynbee Studios", "28 Commercial Street", "E1 6AB"),
  },
  {
    provider: "bush-theatre",
    name: "Bush Theatre",
    apiBase: "https://tickets.bushtheatre.co.uk/bushtheatre",
    whatsOnUrl: "https://www.bushtheatre.co.uk/whats-on/",
    venue: london("Bush Theatre", "7 Uxbridge Road", "W12 8LJ"),
    category: "theatre-performance",
  },
  {
    provider: "theatre503",
    name: "Theatre503",
    apiBase: "https://tickets.theatre503.com/theatre503",
    whatsOnUrl: "https://www.theatre503.com/whats-on/",
    venue: london("Theatre503", "The Latchmere, 503 Battersea Park Road", "SW11 3BW"),
    category: "theatre-performance",
  },
  {
    provider: "kiln-theatre",
    name: "Kiln Theatre",
    apiBase: "https://tickets.kilntheatre.com/tricycle",
    whatsOnUrl: "https://www.kilntheatre.com/whats-on/",
    venue: london("Kiln Theatre", "269 Kilburn High Road", "NW6 7JR"),
    category: "theatre-performance",
  },
  {
    provider: "the-place",
    name: "The Place",
    apiBase: "https://boxoffice.theplace.org.uk/theplace",
    whatsOnUrl: "https://www.theplace.org.uk/whats-on",
    venue: london("The Place", "17 Duke's Road", "WC1H 9PY"),
    // Termly dance classes ("C&C 2026-27 …", "CYD AU26-SU27 …").
    include: (e) => !/^\s*(?:C&C|CYD)\b/.test(e.name),
  },
  {
    provider: "hyde-park-picture-house",
    name: "Hyde Park Picture House",
    apiBase: "https://tickets.hpph.co.uk/leedsheritagetheatres",
    whatsOnUrl: "https://hpph.co.uk/",
    venue: {
      name: "Hyde Park Picture House",
      address: "73 Brudenell Road",
      city: "Leeds",
      region: "West Yorkshire",
      postcode: "LS6 1JD",
      lat: null,
      lng: null,
    },
    category: "film",
    // Shared account with Leeds Grand Theatre and City Varieties (both 300+).
    include: (e) => e.attribute_Venue === "Hyde Park Picture House",
  },
  {
    provider: "broadway-nottingham",
    name: "Broadway Cinema",
    apiBase: "https://tickets.broadway.org.uk/broadwaynottingham",
    whatsOnUrl: "https://www.broadway.org.uk/whats-on",
    venue: {
      name: "Broadway Cinema",
      address: "14-18 Broad Street",
      city: "Nottingham",
      region: "Nottinghamshire",
      postcode: "NG1 3AL",
      lat: null,
      lng: null,
    },
  },
  {
    provider: "derby-quad",
    name: "QUAD",
    apiBase: "https://tickets.derbyquad.co.uk/derbyquad",
    whatsOnUrl: "https://www.derbyquad.co.uk/whats-on",
    venue: {
      name: "QUAD",
      address: "Market Place",
      city: "Derby",
      region: "Derbyshire",
      postcode: "DE1 3AS",
      lat: null,
      lng: null,
    },
  },
  {
    provider: "exeter-phoenix",
    name: "Exeter Phoenix",
    apiBase: "https://tickets.exeterphoenix.org.uk/exeterphoenix",
    whatsOnUrl: "https://exeterphoenix.org.uk/whats-on/",
    venue: {
      name: "Exeter Phoenix",
      address: "Bradninch Place, Gandy Street",
      city: "Exeter",
      region: "Devon",
      postcode: "EX4 3LS",
      lat: null,
      lng: null,
    },
  },
  {
    provider: "tobacco-factory-theatres",
    name: "Tobacco Factory Theatres",
    apiBase: "https://tickets.tobaccofactorytheatres.com/tobaccofactory",
    whatsOnUrl: "https://www.tobaccofactorytheatres.com/whats-on/",
    venue: {
      name: "Tobacco Factory Theatres",
      address: "Raleigh Road",
      city: "Bristol",
      region: "Bristol",
      postcode: "BS3 1TF",
      lat: null,
      lng: null,
    },
    category: "theatre-performance",
  },
  {
    provider: "contact-manchester",
    name: "Contact",
    apiBase: "https://tickets.contactmcr.com/contacttheatre",
    whatsOnUrl: "https://contactmcr.com/whats-on",
    venue: {
      name: "Contact",
      address: "Oxford Road",
      city: "Manchester",
      region: "Greater Manchester",
      postcode: "M15 6JA",
      lat: null,
      lng: null,
    },
  },
  {
    provider: "mac-belfast",
    name: "The MAC",
    apiBase: "https://basket.themaclive.com/themac",
    whatsOnUrl: "https://themaclive.com/whats-on",
    venue: {
      name: "The MAC",
      address: "10 Exchange Street West",
      city: "Belfast",
      region: "County Antrim",
      postcode: "BT1 2NJ",
      lat: null,
      lng: null,
    },
    // The Main Stage seats ~350; the studio and galleries are small.
    include: (e) => e.attribute_Location !== "The Main Stage",
  },
  // Clients without a custom ticket domain answer on system.spektrix.com.
  {
    provider: "camden-peoples-theatre",
    name: "Camden People's Theatre",
    apiBase: "https://tickets.cptheatre.co.uk/camdenpeoplestheatre",
    whatsOnUrl: "https://www.cptheatre.co.uk/",
    venue: london("Camden People's Theatre", "58-60 Hampstead Road", "NW1 2PY"),
    category: "theatre-performance",
  },
  {
    provider: "the-albany",
    name: "The Albany",
    apiBase: "https://system.spektrix.com/thealbany",
    whatsOnUrl: "https://www.thealbany.org.uk/",
    venue: london("The Albany", "Douglas Way", "SE8 4AG"),
    // "Creative Communities" is drop-in coworking and room hire.
    include: (e) => e.attribute_Venue !== "Creative Communities",
  },
  {
    provider: "arcola-theatre",
    name: "Arcola Theatre",
    apiBase: "https://system.spektrix.com/arcolatheatre",
    whatsOnUrl: "https://www.arcolatheatre.com/whats-on/",
    venue: london("Arcola Theatre", "24 Ashwin Street", "E8 3DL"),
    category: "theatre-performance",
  },
  {
    provider: "jacksons-lane",
    name: "Jacksons Lane",
    apiBase: "https://system.spektrix.com/jacksonslane",
    whatsOnUrl: "https://www.jacksonslane.org.uk/whats-on/",
    venue: london("Jacksons Lane", "269a Archway Road", "N6 5AA"),
  },
  {
    provider: "omnibus-theatre",
    name: "Omnibus Theatre",
    apiBase: "https://system.spektrix.com/omnibustheatre",
    whatsOnUrl: "https://www.omnibus-clapham.org/",
    venue: london("Omnibus Theatre", "1 Clapham Common North Side", "SW4 0QW"),
  },
  {
    provider: "park-theatre",
    name: "Park Theatre",
    apiBase: "https://system.spektrix.com/parktheatre",
    whatsOnUrl: "https://parktheatre.co.uk/whats-on/",
    venue: london("Park Theatre", "Clifton Terrace", "N4 3JP"),
    category: "theatre-performance",
    include: (e) => e.attribute_Venue !== "Online Event",
  },
  {
    provider: "southwark-playhouse",
    name: "Southwark Playhouse",
    apiBase: "https://system.spektrix.com/southwarkplayhouse",
    whatsOnUrl: "https://www.southwarkplayhouse.co.uk/whats-on/",
    venue: london("Southwark Playhouse", "77-85 Newington Causeway", "SE1 6BD"),
    category: "theatre-performance",
  },
  {
    provider: "soho-theatre",
    name: "Soho Theatre",
    apiBase: "https://system.spektrix.com/sohotheatre",
    whatsOnUrl: "https://sohotheatre.com/whats-on/",
    venue: london("Soho Theatre", "21 Dean Street", "W1D 3NE"),
    // Dean Street's Upstairs/Downstairs only — the shared account also sells
    // Soho Theatre Walthamstow (~1,000 seats).
    include: (e) => e.attribute_Venue === "Upstairs" || e.attribute_Venue === "Downstairs",
  },
  {
    provider: "battersea-arts-centre",
    name: "Battersea Arts Centre",
    apiBase: "https://system.spektrix.com/bac",
    whatsOnUrl: "https://www.bac.org.uk/whats-on/",
    venue: london("Battersea Arts Centre", "Lavender Hill", "SW11 5TN"),
  },
  {
    provider: "artsdepot",
    name: "artsdepot",
    apiBase: "https://system.spektrix.com/artsdepot",
    whatsOnUrl: "https://www.artsdepot.co.uk/whats-on/",
    venue: london("artsdepot", "5 Nether Street, North Finchley", "N12 0GA"),
  },
  {
    provider: "tyneside-cinema",
    name: "Tyneside Cinema",
    apiBase: "https://system.spektrix.com/tynesidecinema",
    whatsOnUrl: "https://tynesidecinema.co.uk/whats-on/",
    venue: {
      name: "Tyneside Cinema",
      address: "10 Pilgrim Street",
      city: "Newcastle upon Tyne",
      region: "Tyne and Wear",
      postcode: "NE1 6QG",
      lat: null,
      lng: null,
    },
    category: "film",
  },
];

export const TRIBE_SITES: TribeSiteConfig[] = [
  {
    provider: "chats-palace",
    name: "Chats Palace",
    siteUrl: "https://chatspalace.com",
    venue: london("Chats Palace Arts Centre", "42-44 Brooksby's Walk", "E9 6DF"),
  },
  {
    provider: "housmans",
    name: "Housmans Bookshop",
    siteUrl: "https://housmans.com",
    venue: london("Housmans Bookshop", "5 Caledonian Road", "N1 9DX"),
    category: "workshop-talk",
  },
  {
    provider: "sampad",
    name: "Sampad",
    siteUrl: "https://sampad.org.uk",
    // Sampad programmes across Birmingham; events carry their own venue.
    venue: {
      name: "Sampad",
      address: "mac, Cannon Hill Park",
      city: "Birmingham",
      region: "West Midlands",
      postcode: "B12 9QH",
      lat: null,
      lng: null,
    },
  },
  {
    provider: "the-stove",
    name: "The Stove Network",
    siteUrl: "https://thestove.org",
    venue: {
      name: "The Stove",
      address: "100 High Street",
      city: "Dumfries",
      region: "Scotland",
      postcode: "DG1 2BJ",
      lat: null,
      lng: null,
    },
  },
  {
    provider: "wharf-chambers",
    name: "Wharf Chambers",
    siteUrl: "https://www.wharfchambers.org",
    venue: {
      name: "Wharf Chambers",
      address: "23-25 Wharf Street",
      city: "Leeds",
      region: "West Yorkshire",
      postcode: "LS2 7EQ",
      lat: null,
      lng: null,
    },
  },
];

/** "bush-theatre" → "bushTheatre": the key the health report uses. */
export function sourceKey(provider: string): string {
  return provider.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
