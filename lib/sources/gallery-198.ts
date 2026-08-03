import type { NormalisedEvent } from "@/lib/types";

const PRISMIC_API = "https://198cal.cdn.prismic.io/api/v2";
const SITE_BASE = "https://www.198.org.uk";

const VENUE = {
  name: "198 Contemporary Arts and Learning",
  address: "198 Railton Road",
  city: "London",
  region: "Greater London",
  postcode: "SE24 0JT",
  lat: 51.4474,
  lng: -0.1081,
};

export interface Gallery198RawEvent {
  uid: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  priceMin: number | null;
  category: string | null;
  url: string;
}

interface PrismicRef { ref: string; isMasterRef: boolean }
interface PrismicDoc {
  uid: string;
  data: {
    title?: string;
    description?: string | null;
    main_image?: { url?: string } | null;
    start_date?: string | null;
    end_date?: string | null;
    is_free?: boolean | string | null;
    ticket_price?: string | null;
    parent?: { uid?: string } | null;
  };
}

async function getMasterRef(): Promise<string> {
  const res = await fetch(PRISMIC_API);
  if (!res.ok) throw new Error(`Prismic API error: ${res.status}`);
  const data = (await res.json()) as { refs: PrismicRef[] };
  const master = data.refs.find((r) => r.isMasterRef);
  if (!master) throw new Error("Prismic master ref not found");
  return master.ref;
}

async function fetchPage(
  ref: string,
  page: number
): Promise<{ results: PrismicDoc[]; next_page: string | null }> {
  const q = encodeURIComponent("[[has(my.page.start_date)]]");
  const ord = encodeURIComponent("[my.page.start_date desc]");
  const url = `${PRISMIC_API}/documents/search?ref=${ref}&q=${q}&orderings=${ord}&pageSize=20&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Prismic query error: ${res.status}`);
  return res.json();
}

function isFreeEvent(d: PrismicDoc["data"]): boolean {
  if (d.is_free === true) return true;
  if (typeof d.ticket_price === "string" && /free/i.test(d.ticket_price)) return true;
  if (typeof d.description === "string" && /\bfree\b/i.test(d.description)) return true;
  return false;
}

function parsePriceMin(d: PrismicDoc["data"]): number | null {
  if (!d.ticket_price || typeof d.ticket_price !== "string") return null;
  const m = d.ticket_price.match(/£(\d+(?:\.\d{2})?)/);
  return m ? parseFloat(m[1]) : null;
}

export async function fetch198Events(): Promise<Gallery198RawEvent[]> {
  const ref = await getMasterRef();

  const allDocs: PrismicDoc[] = [];
  let page = 1;
  while (true) {
    const batch = await fetchPage(ref, page);
    allDocs.push(...batch.results);
    if (!batch.next_page) break;
    page++;
  }

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return allDocs
    .map((doc): Gallery198RawEvent | null => {
      const d = doc.data;
      const startAt = d.start_date ?? null;
      const endAt = d.end_date ?? null;
      if (!startAt) return null;

      // Keep: ongoing (end >= now), future, or started within last 7 days
      const start = new Date(startAt);
      const end = endAt ? new Date(endAt) : null;
      const isVisible = end ? end >= now : start >= oneWeekAgo;
      if (!isVisible) return null;

      const title = d.title?.trim() ?? doc.uid;
      const description = typeof d.description === "string" ? d.description.trim() || null : null;
      const imageUrl = d.main_image?.url ?? null;
      const parentUid = d.parent?.uid ?? null;
      const category = parentUid === "contemporary-art" ? "gallery-exhibition" : null;

      return {
        uid: doc.uid,
        title,
        description,
        imageUrl,
        startAt,
        endAt,
        isFree: isFreeEvent(d),
        priceMin: parsePriceMin(d),
        category,
        url: `${SITE_BASE}/whats-on/${doc.uid}`,
      };
    })
    .filter((e): e is Gallery198RawEvent => e !== null);
}

export function normalise198Event(raw: Gallery198RawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`198 Gallery event ${raw.uid} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "198 Contemporary Arts and Learning",
      sourceType: "198-gallery",
      profileUrl: SITE_BASE,
    },
    category: raw.category,
    isFree: raw.isFree,
    priceMin: raw.priceMin,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "198-gallery", id: raw.uid, url: raw.url },
  };
}
