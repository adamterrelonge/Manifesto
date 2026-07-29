// Canonical event-category vocabulary, confirmed against real Skiddle
// EventCode / Ticketmaster segment+genre values observed in the live data.
// Distinct from the identity/accessibility `buckets` — categories describe
// *what kind* of event this is, buckets describe *who it's for*.

export type Category =
  | "music"
  | "comedy"
  | "theatre-performance"
  | "film"
  | "gallery-exhibition"
  | "market-fair"
  | "workshop-talk"
  | "community-social"
  | "sports"
  | "family-kids"
  | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  music: "Music",
  comedy: "Comedy",
  "theatre-performance": "Theatre & Performance",
  film: "Film",
  "gallery-exhibition": "Gallery & Exhibition",
  "market-fair": "Market & Fair",
  "workshop-talk": "Workshop & Talk",
  "community-social": "Community & Social",
  sports: "Sports",
  "family-kids": "Family & Kids",
  other: "Other",
};

const CATEGORY_SET = new Set<string>(Object.keys(CATEGORY_LABELS));

export function categoryLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  if (CATEGORY_SET.has(category)) return CATEGORY_LABELS[category as Category];
  return category;
}
