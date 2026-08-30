// Canonical event-category vocabulary, confirmed against real Skiddle
// EventCode / Ticketmaster segment+genre values observed in the live data.
// Distinct from the identity/accessibility `buckets` — categories describe
// *what kind* of event this is, buckets describe *who it's for*.
//
// "comedy" and "other" were deliberately removed — unmapped/comedy source
// codes now normalise to null (unclassified) rather than a catch-all.

export type Category =
  | "music"
  | "theatre-performance"
  | "film"
  | "gallery-exhibition"
  | "market-fair"
  | "workshop-talk"
  | "community-social"
  | "sports"
  | "family-kids"
  | "health-wellness";

export const CATEGORY_LABELS: Record<Category, string> = {
  music: "Music",
  "theatre-performance": "Theatre & Performance",
  film: "Film",
  "gallery-exhibition": "Gallery & Exhibition",
  "market-fair": "Market & Fair",
  "workshop-talk": "Workshop & Talk",
  "community-social": "Community & Social",
  sports: "Sports",
  "family-kids": "Family & Kids",
  "health-wellness": "Health & Wellness",
};

const CATEGORY_SET = new Set<string>(Object.keys(CATEGORY_LABELS));

export function categoryLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  if (CATEGORY_SET.has(category)) return CATEGORY_LABELS[category as Category];
  return category;
}

// ---------------------------------------------------------------------------
// Keyword-based category inference
// Checked in priority order — first match wins. Phrases are matched
// case-insensitively against the concatenated title + description.
// ---------------------------------------------------------------------------

const INFERENCE_RULES: Array<{ category: Category; phrases: string[] }> = [
  {
    category: "film",
    phrases: [
      "film screening", "film programme", "film program", "film club",
      "cinema screening", "screening of", "documentary screening",
      "moving image", "video art", "short films", "feature film",
      // UK BBFC age-certificate notation (e.g. "Bouchra (15)") — used
      // almost exclusively in cinema/screening listings, so a reliable
      // film signal on its own even when the copy never says "film".
      "(u)", "(pg)", "(12a)", "(12)", "(15)", "(18)",
    ],
  },
  {
    category: "music",
    phrases: [
      "live music", "live concert", "concert", "gig", "jazz",
      "classical music", "choir", "orchestra", "recital",
      "dj set", "dj night", "band night", "music festival",
      "open mic", "open-mic",
    ],
  },
  {
    category: "theatre-performance",
    phrases: [
      "theatre", "theater", "dance performance", "ballet", "opera",
      "live performance", "spoken word", "cabaret", "circus",
      "live art", "performance art", "choreography", "dance piece",
      "physical theatre", "drag performance", "drag show",
    ],
  },
  {
    // Checked ahead of workshop-talk's generic "workshop" phrase so e.g.
    // "yoga workshop" resolves here rather than to Workshop & Talk.
    category: "health-wellness",
    phrases: [
      "yoga", "meditation", "mindfulness", "wellbeing", "well-being",
      "wellness", "breathwork", "sound bath", "sound healing", "pilates",
      "tai chi", "qigong", "reiki", "self-care", "self care",
      "mental health", "therapy session", "guided relaxation", "somatic",
      "somatic healing", "movement practice", "ice bath", "sauna session",
    ],
  },
  {
    category: "workshop-talk",
    phrases: [
      "workshop", "masterclass", "artist talk", "in conversation with",
      "panel discussion", "panel talk", "q&a", "symposium", "seminar",
      "lecture", "guided tour", "study day", "open call",
      "life drawing", "drawing class", "art class", "craft class",
      "writing workshop", "poetry workshop", "community workshop",
    ],
  },
  {
    category: "market-fair",
    phrases: [
      "art fair", "craft fair", "makers market", "makers fair",
      "book fair", "pop-up market", "flea market", "bazaar",
      "open market", "market",
    ],
  },
  {
    category: "family-kids",
    phrases: [
      "family workshop", "for families", "for children", "for kids",
      "family activity", "children's", "family event", "kids workshop",
      "under 12", "under 16", "toddler", "young people", "youth club",
      "school holiday", "half term",
    ],
  },
  {
    category: "community-social",
    phrases: [
      "community event", "community gathering", "open day",
      "networking", "social event", "drop-in", "drop in",
      "celebration", "gathering", "meetup", "meet-up",
    ],
  },
  {
    category: "gallery-exhibition",
    phrases: [
      "exhibition", "exhibiting", "exhibits", "retrospective",
      "installation", "on show", "on view", "private view",
      "vernissage", "open studios", "open studio", "solo show",
      "group show", "artist residency", "new works", "new work by",
      "paintings", "sculptures", "photographs by", "drawings by",
    ],
  },
];

// Word-boundary match, not a plain substring check — added after a bare
// "market" phrase (for "African & Caribbean Market") turned out to also
// match "supermarket" and would have matched "marketing" too. Mirrors
// lib/buckets.ts's matchesPhrase; kept as a separate copy since this file
// is deliberately decoupled from the identity/accessibility bucket
// classifier (see this file's header comment).
function matchesPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWithWordChar = /\w/.test(phrase[0]);
  const endsWithWordChar = /\w/.test(phrase[phrase.length - 1]);
  const pattern = new RegExp(
    `${startsWithWordChar ? "\\b" : ""}${escaped}${endsWithWordChar ? "\\b" : ""}`,
    "i"
  );
  return pattern.test(text);
}

export function inferCategory(
  title: string,
  description: string | null
): Category | null {
  const haystack = `${title} ${description ?? ""}`.toLowerCase();
  for (const { category, phrases } of INFERENCE_RULES) {
    if (phrases.some((p) => matchesPhrase(haystack, p))) return category;
  }
  return null;
}
