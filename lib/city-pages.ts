import type { EventListItem } from "@/lib/types";

// URL-safe slug for a city/region name ("St Albans" -> "st-albans"). Applied
// consistently at both generation (building index links) and lookup
// (matching a requested URL segment back to the real name) so the two never
// drift — there's no stored slug column, city/region names are the only
// source of truth (see venues.city/region in supabase/migrations/0001_init.sql).
export function slugifyPlaceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PlaceSummary {
  name: string;
  slug: string;
  count: number;
}

// Builds a deduped, most-events-first list of every distinct value of the
// given venue field (city or region) that appears on at least one
// currently-qualifying event — so a place only gets an SEO page/index entry
// once there's something real to show on it, not for every place a venue
// has ever existed in.
export function buildPlaceIndex(
  events: EventListItem[],
  field: "city" | "region"
): PlaceSummary[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const name = event.venues?.[field];
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, slug: slugifyPlaceName(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function filterEventsByPlace(
  events: EventListItem[],
  field: "city" | "region",
  slug: string
): EventListItem[] {
  return events.filter((event) => {
    const name = event.venues?.[field];
    return !!name && slugifyPlaceName(name) === slug;
  });
}
