import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";
import { BIO_LINK_SEEDS, type BioLinkSeed } from "./bio-link-seeds";

// Ticketing platforms whose URLs are themselves proof that a link is an
// event, AND whose event pages are one-URL-per-event (safe to trust a JSON-LD
// Event block found there as belonging to this specific link — see
// fetchStructuredStartAt below).
const TICKETING_HOSTS = new Set([
  "eventbrite.co.uk", "eventbrite.com",
  "dice.fm",
  "ra.co", "residentadvisor.net",
  "skiddle.com",
  "ticketmaster.co.uk", "ticketmaster.com",
  "outsavvy.com", "outsavvy.co.uk",
  "ticketweb.co.uk",
  "wegottickets.com",
  "universe.com",
  "buytickets.at",
]);

const DATE_IN_TEXT_RE =
  /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b/i;

export interface BioLinkRawEvent {
  slug: string;
  handle: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  sourceUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isTicketingUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return TICKETING_HOSTS.has(host);
  } catch {
    return false;
  }
}

function looksLikeEvent(text: string): boolean {
  return (
    DATE_IN_TEXT_RE.test(text) ||
    /\btickets?\b|\bbook\s+now\b|\bevent\b|\bgig\b|\bshow\b|\bperformance\b/i.test(text)
  );
}

function extractStartAt(text: string): string | null {
  const d = parseDMY(text);
  if (d) return d.toISOString();

  // UK numeric: "15/08" or "15/08/25"
  const numMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10) - 1;
    let year = numMatch[3] ? parseInt(numMatch[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const candidate = new Date(year, month, day);
      if (!isNaN(candidate.getTime())) return candidate.toISOString();
    }
  }

  return null;
}

// A Linktree/Beacons anchor's visible text is almost never a date — it's
// just the event name ("The ADHD Women Summit London 2026"). The actual date
// lives on the destination ticketing page. For hosts where one URL is always
// exactly one event (TICKETING_HOSTS), that page's schema.org Event JSON-LD
// is a trustworthy source — verified directly against live Eventbrite and
// buytickets.at pages, both returning a single Event object whose startDate
// matches the specific linked event. NOT extended to arbitrary/custom-domain
// links: a generic page (e.g. a creator's own site) can list many sessions
// under one URL, and grabbing "the first Event on the page" there risks
// attaching the wrong date to the wrong link.
async function fetchStructuredStartAt(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();

    const blocks = html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );
    for (const block of blocks) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(block[1]);
      } catch {
        continue;
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        const record = item as { "@type"?: string | string[]; startDate?: string };
        const type = record["@type"];
        const isEvent = Array.isArray(type)
          ? type.some((t) => /event/i.test(t))
          : typeof type === "string" && /event/i.test(type);
        if (isEvent && record.startDate) {
          const d = new Date(record.startDate);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Platform-specific parsers ──────────────────────────────────────────────

function parseLinktree(html: string): { title: string; url: string }[] {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    const pp = data?.props?.pageProps ?? {};
    const raw: { title?: string; url?: string; multipleLinks?: { url?: string }[] }[] =
      pp.links ?? pp.account?.links ?? pp.pageData?.links ?? [];
    return raw
      .flatMap((l) =>
        l.multipleLinks?.length
          ? l.multipleLinks.map((sub) => ({ title: l.title ?? "", url: sub.url ?? "" }))
          : [{ title: l.title ?? "", url: l.url ?? "" }]
      )
      .filter((l) => l.url);
  } catch {
    return [];
  }
}

function parseBeacons(html: string): { title: string; url: string }[] {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    const pp = data?.props?.pageProps ?? {};
    const raw: { title?: string; url?: string; cta_text?: string; cta_url?: string }[] =
      pp.page?.blocks ?? pp.blocks ?? [];
    return raw
      .map((b) => ({ title: b.title ?? b.cta_text ?? "", url: b.url ?? b.cta_url ?? "" }))
      .filter((l) => l.url);
  } catch {
    return [];
  }
}

function parseGeneric(html: string, pageUrl: string): { title: string; url: string }[] {
  const $ = cheerio.load(html);
  const results: { title: string; url: string }[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    // IIFE to avoid TypeScript narrowing `el` to never inside the closure
    (function (node: typeof el) {
      const href = $(node).attr("href") ?? "";
      if (!href || href.startsWith("#")) return;

      let url: string;
      try { url = new URL(href, pageUrl).href; } catch { return; }
      if (seen.has(url)) return;

      const title = $(node).text().trim().replace(/\s+/g, " ");
      if (!title) return;

      if (isTicketingUrl(url) || looksLikeEvent(title)) {
        seen.add(url);
        results.push({ title, url });
      }
    })(el);
  });

  return results;
}

// ── Per-seed scrape ────────────────────────────────────────────────────────

async function scrapeSeed(seed: BioLinkSeed): Promise<BioLinkRawEvent[]> {
  const events: BioLinkRawEvent[] = [];

  let res: Response;
  try {
    res = await fetch(seed.bioUrl, { headers: REQUEST_HEADERS });
    if (!res.ok) return events;
  } catch {
    return events;
  }

  const html = await res.text();
  const finalUrl = res.url;
  const host = (() => { try { return new URL(finalUrl).hostname; } catch { return ""; } })();

  let links: { title: string; url: string }[];
  if (host.includes("linktr.ee")) {
    links = parseLinktree(html);
  } else if (host.includes("beacons.ai")) {
    links = parseBeacons(html);
  } else {
    links = parseGeneric(html, finalUrl);
  }

  for (const link of links) {
    if (!looksLikeEvent(link.title) && !isTicketingUrl(link.url)) continue;

    const slug = `${seed.handle}::${link.url}`;

    // Link text rarely carries a date; fall back to the destination
    // ticketing page's own structured data before giving up.
    let startAt = extractStartAt(link.title);
    if (!startAt && isTicketingUrl(link.url)) {
      startAt = await fetchStructuredStartAt(link.url);
    }
    // Neither source produced a date (e.g. a custom-domain hub page with no
    // structured data) — skip rather than push a row that would just error
    // in normaliseBioLinkEvent.
    if (!startAt) continue;

    events.push({
      slug,
      handle: seed.handle,
      title: link.title || seed.handle,
      description: seed.notes,
      startAt,
      endAt: null,
      isFree: /\bfree\b/i.test(link.title),
      sourceUrl: link.url,
    });
  }

  return events;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchBioLinkEvents(): Promise<BioLinkRawEvent[]> {
  if (BIO_LINK_SEEDS.length === 0) return [];

  const CONCURRENCY = 3;
  const results: BioLinkRawEvent[][] = [];
  for (let i = 0; i < BIO_LINK_SEEDS.length; i += CONCURRENCY) {
    const batch = BIO_LINK_SEEDS.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(scrapeSeed));
    results.push(...batchResults);
  }

  const seen = new Set<string>();
  return results.flat().filter((e) => {
    if (seen.has(e.sourceUrl)) return false;
    seen.add(e.sourceUrl);
    return true;
  });
}

export function normaliseBioLinkEvent(raw: BioLinkRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Bio-link event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: null,
    organiser: {
      name: raw.handle,
      sourceType: "bio-link",
      profileUrl: null,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: null,
    source: {
      provider: "bio-link",
      id: raw.slug,
      url: raw.sourceUrl,
    },
  };
}
