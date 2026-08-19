// Skiddle and Eventbrite both pass a UK venue's "region" straight through
// from their own API, uncontrolled — a live-DB audit (2026-08-15, ~2100
// events) found this produces duplicate region pages for the same real
// place ("London" next to "Greater London", "Manchester" next to "Greater
// Manchester", ...), overly broad country-level values ("England",
// "Scotland", empty string), and pre-1996/1998 abolished administrative
// counties the APIs still emit (Avon, Strathclyde, Cleveland, Humberside,
// Middlesex, Clwyd, Gwent, the Glamorgans, Hereford and Worcester). This
// table normalises the concrete bad values that audit surfaced; it isn't
// meant to be an exhaustive gazetteer.
const REGION_ALIASES: Record<string, string | null> = {
  // Country-level, not a region — and "Ireland" is the Republic of Ireland,
  // out of this project's UK-only-for-v1 scope (see docs/PROJECT_PLAN.md §4).
  england: null,
  scotland: null,
  wales: null,
  "northern ireland": null,
  ireland: null,
  uk: null,
  "united kingdom": null,

  // A city name used as its own "region" — promote to the real county/metro
  // county so it doesn't fork a second page for the same place.
  london: "Greater London",
  manchester: "Greater Manchester",
  birmingham: "West Midlands",
  nottingham: "Nottinghamshire",
  cambridge: "Cambridgeshire",
  durham: "County Durham",
  // Bare "Yorkshire" only ever paired with York/Whitby in the audited data,
  // both North Yorkshire — not safe to assume for other cities.
  yorkshire: "North Yorkshire",

  // Common abbreviations.
  hants: "Hampshire",
  oxon: "Oxfordshire",

  // Pre-1996/1998 abolished administrative counties with no clean 1:1
  // modern successor — safer to drop than guess.
  avon: null,
  strathclyde: null,
  cleveland: null,
  humberside: null,
  middlesex: null,
  clwyd: null,
  gwent: null,
  "west glamorgan": null,
  "south glamorgan": null,
  "hereford and worcester": null,
};

export function normaliseUkRegion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  if (key in REGION_ALIASES) return REGION_ALIASES[key];
  return trimmed;
}
