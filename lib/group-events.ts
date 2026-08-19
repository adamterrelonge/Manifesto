import type { EventListItem } from "@/lib/types";

export interface EventOccurrence {
  id: string;
  start_at: string;
  end_at: string | null;
}

// One card/row/pin per production, not per performance. Every view-facing
// field is taken from the earliest upcoming occurrence ("primary") — the
// group is otherwise just that occurrence plus the full sorted date list.
export interface EventGroup {
  key: string;
  title: string;
  description: string | null;
  category: string | null;
  is_free: boolean;
  price_min: number | null;
  currency: string;
  image_url: string | null;
  source_url: string | null;
  venues: EventListItem["venues"];
  event_buckets: EventListItem["event_buckets"];
  // Favouriting/flagging act on this occurrence — there's no per-group
  // favourite row in the schema, and the primary occurrence is the one a
  // user actually sees represented on the card.
  primaryEventId: string;
  occurrences: EventOccurrence[];
}

// Same title + same venue + same category = the same production on a
// different date (e.g. a week of Broadway showtimes ingested as one row
// per performance). Title is normalised (trim/lowercase/collapse
// whitespace) so near-identical casing from different scrape passes still
// merges. Events with no venue are never grouped with each other — without
// a location to compare, "same event" can't be confirmed, so each gets its
// own key.
function groupKey(event: EventListItem): string {
  if (!event.venues) return `solo:${event.id}`;
  const title = event.title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${title}::${event.venues.id}::${event.category ?? "none"}`;
}

export function groupEvents(events: EventListItem[]): EventGroup[] {
  const buckets = new Map<string, EventListItem[]>();
  for (const event of events) {
    const key = groupKey(event);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(event);
  }

  const groups: EventGroup[] = [];
  for (const [key, occurrenceEvents] of buckets) {
    const sorted = [...occurrenceEvents].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    const primary = sorted[0];

    groups.push({
      key,
      title: primary.title,
      description: primary.description,
      category: primary.category,
      is_free: primary.is_free,
      price_min: primary.price_min,
      currency: primary.currency,
      image_url: primary.image_url,
      source_url: primary.source_url,
      venues: primary.venues,
      event_buckets: primary.event_buckets,
      primaryEventId: primary.id,
      occurrences: sorted.map((e) => ({ id: e.id, start_at: e.start_at, end_at: e.end_at })),
    });
  }

  // Same ordering the ungrouped list already had: soonest upcoming first.
  groups.sort(
    (a, b) =>
      new Date(a.occurrences[0].start_at).getTime() - new Date(b.occurrences[0].start_at).getTime()
  );

  return groups;
}
