import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS } from "./scrape-utils";

// No HTML scraping needed — the listing page's own "load more" filter calls
// a first-party JSON REST endpoint directly (confirmed via the page's own
// `fetchAndDisplayPosts()` inline script), which returns clean fields
// including `date_from`/`date_to` as "YYYYMMDD" strings. `post_types=all`
// returns every category at once (Exhibitions, Museum Events, Workshops,
// Fashion School, Digital Design Courses, Online Talks).

const BASE_URL = "https://fashiontextilemuseum.org";
const API_URL = `${BASE_URL}/wp-json/ftmfilteredcards/v1/posts?post_types=all`;

const VENUE = {
  name: "Fashion and Textile Museum",
  address: "83 Bermondsey Street",
  city: "London",
  region: "Greater London",
  postcode: "SE1 3XF",
  lat: 51.5013,
  lng: -0.0812,
};

const POST_TYPE_CATEGORY: Record<string, Category> = {
  Exhibition: "gallery-exhibition",
  "Museum Event": "community-social",
  Workshop: "workshop-talk",
  "Fashion School": "workshop-talk",
  "Digital Design Course": "workshop-talk",
  "Online Talk": "workshop-talk",
};

interface FtmApiPost {
  title: string;
  intro: string;
  date_from: string;
  date_to: string;
  thumbnail: string | null;
  permalink: string;
  post_type_label: string;
}

export interface FashionTextileMuseumRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  postTypeLabel: string;
  url: string;
}

function parseYyyymmdd(raw: string): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return isNaN(d.getTime()) ? null : d;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

export async function fetchFashionTextileMuseumEvents(): Promise<FashionTextileMuseumRawEvent[]> {
  const res = await fetch(API_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Fashion and Textile Museum API error: ${res.status} ${res.statusText}`);

  const posts: FtmApiPost[] = await res.json();
  const events: FashionTextileMuseumRawEvent[] = [];

  for (const post of posts) {
    const slug = slugFromUrl(post.permalink);
    if (!slug || !post.title) continue;

    const start = parseYyyymmdd(post.date_from);
    if (!start) continue; // unparseable date — skip

    const end = parseYyyymmdd(post.date_to);

    events.push({
      slug,
      title: post.title,
      description: post.intro || null,
      imageUrl: post.thumbnail || null,
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      postTypeLabel: post.post_type_label,
      url: post.permalink,
    });
  }

  return events;
}

export function normaliseFashionTextileMuseumEvent(
  raw: FashionTextileMuseumRawEvent
): NormalisedEvent {
  const category: Category | null = POST_TYPE_CATEGORY[raw.postTypeLabel] ?? null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Fashion and Textile Museum",
      sourceType: "fashion-textile-museum",
      profileUrl: `${BASE_URL}/whats-on/`,
    },
    category,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "fashion-textile-museum", id: raw.slug, url: raw.url },
  };
}
