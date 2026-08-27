import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// V&A Dundee has no JSON-LD, no plain `<time>` tag, and no discoverable REST
// API — the only way in is the Next.js App Router's RSC "flight stream":
// dozens of `<script>self.__next_f.push([1,"..."])</script>` tags, each
// carrying one numbered chunk (`"23:[...]"`, `"24:[...]"`, ...) of the
// server-rendered React tree as data, which the client reassembles and
// renders. This is NOT the same thing as JSON-LD/schema.org data — it's an
// internal framework wire format, undocumented and version-specific.
//
// It turned out more tractable than expected: each `push([1, "..."])` call's
// string argument is valid JSON (Next.js emits standard JSON escaping), and
// after `JSON.parse`-ing it and stripping the leading `"<id>:"` prefix, the
// remainder is *also* just valid JSON — a plain (if deeply nested) tree of
// arrays/objects/strings. No custom deserializer, no resolving `"$L34"`-style
// cross-chunk references was needed: every `ProgrammeEvents` array found so
// far is fully inlined in the same chunk as its section heading, not split
// across chunks or referenced from elsewhere. So the extraction is just:
// regex out each chunk's string literal -> JSON.parse it -> JSON.parse the
// part after the first colon -> recursively walk that object tree looking
// for a `ProgrammeEvents` key. Four chunks matched at time of writing, one
// per listing tab ("Temporary Exhibitions" x3, "Future Exhibitions" x3,
// "Other Exhibitions" x20, "Past Exhibitions" x13 — the last is skipped).
//
// **Why this is riskier than every other adapter in this codebase**: the
// flight-stream format is a React/Next.js implementation detail, not a
// stable public contract. A Next.js major-version upgrade on V&A's site
// could change the chunk framing (the `[1, "..."]` shape, or whether chunks
// are still valid bare JSON vs. needing real JS eval), a Storyblok CMS
// content-model change could rename `ProgrammeEvents`/`StartingDate`/
// `IsFreeEvent`, or a build change could split what's currently one inlined
// chunk across multiple `$L`-referenced ones (which this parser does not
// resolve). If `fetchVamDundeeEvents` starts returning zero events, that's
// the first thing to check — it will very likely be a silent shape change,
// not a fetch error, since a malformed chunk here is just skipped rather
// than thrown.
//
// robots.txt is permissive (`Crawl-delay: 2`, no AI-bot block); confirmed
// live with a genuine Node fetch (not just curl/WebFetch) returning 200.

const BASE_URL = "https://www.vam.ac.uk";
const LISTING_URL = `${BASE_URL}/dundee/whatson/programmes/exhibitions`;

const VENUE = {
  name: "V&A Dundee",
  address: "1 Riverside Esplanade",
  city: "Dundee",
  region: "Dundee City",
  postcode: "DD1 4EZ",
  lat: 56.457288,
  lng: -2.967172,
};

// Section tabs seen live — "Past Exhibitions" is real content, just already
// finished, and is skipped in fetchVamDundeeEvents rather than parsed.
const SKIP_SECTIONS = new Set(["Past Exhibitions"]);

interface RawHeaderMedia {
  ImageMobile?: { filename?: string };
}

interface RawHeaderBlock {
  HeaderMedia?: RawHeaderMedia[];
}

interface RawProgrammeEvent {
  slug?: string;
  full_slug?: string;
  content?: {
    Name?: string;
    StartingDate?: string;
    EndingDate?: string;
    IsFreeEvent?: boolean;
    Header?: RawHeaderBlock[];
  };
}

export interface VamDundeeRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string;
  endAt: string | null;
  url: string;
}

// Recursively collects every value found under the given key anywhere in a
// parsed flight-stream chunk — the chunk is a plain (if deep) JSON tree at
// this point, no RSC-specific deserialization needed.
function findKey(node: unknown, key: string, out: unknown[]): void {
  if (Array.isArray(node)) {
    for (const item of node) findKey(item, key, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) out.push(v);
      findKey(v, key, out);
    }
  }
}

interface FlightSection {
  title: string;
  events: RawProgrammeEvent[];
}

function extractSections(html: string): FlightSection[] {
  const chunkRe = /<script[^>]*>self\.__next_f\.push\(\[1,("[\s\S]*?")\]\)<\/script>/g;
  const sections: FlightSection[] = [];
  let match: RegExpExecArray | null;

  while ((match = chunkRe.exec(html)) !== null) {
    let decoded: string;
    try {
      decoded = JSON.parse(match[1]) as string;
    } catch {
      continue; // not a valid JSON string literal — skip
    }

    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(decoded.slice(colonIdx + 1));
    } catch {
      continue; // chunk isn't a JSON payload (e.g. a font-preload `HL[...]` entry)
    }

    const programmeEvents: unknown[] = [];
    findKey(payload, "ProgrammeEvents", programmeEvents);
    const events = programmeEvents[0];
    if (!Array.isArray(events) || events.length === 0) continue;

    const titles: unknown[] = [];
    findKey(payload, "Title", titles);
    const sectionTitle = titles.find(
      (t): t is string => typeof t === "string" && t.includes("Exhibitions")
    );
    if (!sectionTitle) continue;

    sections.push({ title: sectionTitle, events: events as RawProgrammeEvent[] });
  }

  return sections;
}

// "2026-03-06 10:00" — treated as venue-local wall-clock time, same
// simplification every free-text-date adapter in this codebase already
// makes (no BST/GMT offset handling), not documented as UTC anywhere in
// the source data.
function parseLocalDateTime(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchVamDundeeEvents(): Promise<VamDundeeRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`V&A Dundee listing error: ${res.status} ${res.statusText}`);
  const html = await res.text();

  const sections = extractSections(html);
  const seen = new Set<string>();
  const events: VamDundeeRawEvent[] = [];

  for (const section of sections) {
    if (SKIP_SECTIONS.has(section.title)) continue;

    for (const raw of section.events) {
      const slug = raw.slug;
      const title = raw.content?.Name;
      if (!slug || !title || seen.has(slug)) continue;

      const startAt = parseLocalDateTime(raw.content?.StartingDate);
      if (!startAt) continue;
      seen.add(slug);

      const imageUrl =
        raw.content?.Header?.[0]?.HeaderMedia?.[0]?.ImageMobile?.filename ?? null;

      events.push({
        slug,
        title: title.replace(/\s+/g, " ").trim(),
        imageUrl,
        isFree: raw.content?.IsFreeEvent ?? false,
        startAt,
        endAt: parseLocalDateTime(raw.content?.EndingDate),
        url: `${BASE_URL}/dundee/${raw.full_slug ?? `whatson/exhibitions/${slug}`}`,
      });
    }
  }

  return events;
}

export function normaliseVamDundeeEvent(raw: VamDundeeRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "V&A Dundee", sourceType: "vam-dundee", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "vam-dundee", id: raw.slug, url: raw.url },
  };
}
