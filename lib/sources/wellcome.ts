import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

const BASE_URL = "https://wellcomecollection.org";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUE = {
  name: "Wellcome Collection",
  address: "183 Euston Road",
  city: "London",
  region: "Greater London",
  postcode: "NW1 2BE",
  lat: 51.5257,
  lng: -0.1335,
};

interface WCDateTime { value: string; type: string }

interface WCEvent {
  uid: string;
  title: string;
  type: string;
  isPast: boolean;
  isOnline: boolean;
  promo?: { caption?: string; image?: { contentUrl?: string } };
  image?: { contentUrl?: string };
  times?: Array<{ range?: { startDateTime?: WCDateTime; endDateTime?: WCDateTime } }>;
  labels?: Array<{ text?: string }>;
  secondaryLabels?: Array<{ text?: string }>;
}

interface WCExhibition {
  uid: string;
  title: string;
  isPermanent?: boolean;
  start?: WCDateTime;
  end?: WCDateTime;
  promo?: { caption?: string; image?: { contentUrl?: string } };
  image?: { contentUrl?: string };
  labels?: Array<{ text?: string }>;
}

export interface WellcomeRawEvent {
  uid: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function isFreeFromLabels(labels: Array<{ text?: string }> = []): boolean {
  return labels.some((l) => /\bfree\b/i.test(l.text ?? ""));
}

function parseWCDate(d: WCDateTime | undefined): string | null {
  if (!d?.value) return null;
  const parsed = new Date(d.value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function eventFromWCEvent(e: WCEvent): WellcomeRawEvent | null {
  if (e.isPast || e.isOnline) return null;
  const times = e.times ?? [];
  if (times.length === 0) return null;
  const startAt = parseWCDate(times[0]?.range?.startDateTime);
  const endAt = parseWCDate(times[times.length - 1]?.range?.endDateTime);
  if (!startAt) return null;
  return {
    uid: e.uid,
    title: e.title,
    description: e.promo?.caption ?? null,
    imageUrl: e.image?.contentUrl ?? e.promo?.image?.contentUrl ?? null,
    startAt,
    endAt,
    isFree: isFreeFromLabels([...(e.labels ?? []), ...(e.secondaryLabels ?? [])]),
    url: `${BASE_URL}/events/${e.uid}`,
  };
}

function eventFromWCExhibition(e: WCExhibition, now: Date): WellcomeRawEvent | null {
  if (e.isPermanent) return null;
  const startAt = parseWCDate(e.start);
  const endAt = parseWCDate(e.end);
  if (endAt && new Date(endAt) < now) return null;
  if (!startAt) return null;
  return {
    uid: `exhibition-${e.uid}`,
    title: e.title,
    description: e.promo?.caption ?? null,
    imageUrl: e.image?.contentUrl ?? e.promo?.image?.contentUrl ?? null,
    startAt,
    endAt,
    isFree: isFreeFromLabels(e.labels ?? []),
    url: `${BASE_URL}/exhibitions/${e.uid}`,
  };
}

export async function fetchWellcomeEvents(): Promise<WellcomeRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Wellcome listing error: ${res.status}`);

  const html = await res.text();
  const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!ndMatch) throw new Error("Wellcome: __NEXT_DATA__ not found");

  const nd = JSON.parse(ndMatch[1]) as {
    props: {
      pageProps: {
        events?: WCEvent[];
        exhibitions?: WCExhibition[];
      };
    };
  };

  const { events = [], exhibitions = [] } = nd.props.pageProps;
  const now = new Date();

  const results: WellcomeRawEvent[] = [];
  for (const e of events) {
    const r = eventFromWCEvent(e);
    if (r) results.push(r);
  }
  for (const e of exhibitions) {
    const r = eventFromWCExhibition(e, now);
    if (r) results.push(r);
  }
  return results;
}

export function normaliseWellcomeEvent(raw: WellcomeRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Wellcome event ${raw.uid} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Wellcome Collection",
      sourceType: "wellcome",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "wellcome", id: raw.uid, url: raw.url },
  };
}
