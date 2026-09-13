// Free, from-scratch bucket classifier: deterministic keyword/phrase
// matching against event title + description. No external API calls.
//
// This is deliberately conservative per docs/PROJECT_PLAN.md §9: it only
// ever matches explicit signal actually present in the event's own copy
// (never infers identity from an organiser's name, and never guesses).
// Confidence is not a model's self-reported number — it's a fixed score
// per phrase, set by how unambiguous that phrase is on its own. Anything
// below HIGH_CONFIDENCE_THRESHOLD should be treated as "needs review" once
// the admin review queue exists.

export type BucketSlug =
  | "black"
  | "poc"
  | "queer"
  | "latinx"
  | "east-mon-asian"
  | "south-asian"
  | "disability-friendly"
  | "autistic-friendly"
  | "deaf-accessible"
  | "womxn-led"
  | "sober-friendly"
  | "grassroots-activism"
  | "low-income-access"
  | "free-entry";

export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

// A match this certain skips the manual admin review queue entirely —
// lib/pipeline.ts's runClassification writes it straight in as
// assigned_by: "moderator" (the same state a human approval sets), rather
// than leaving it to pile up as one more row someone has to click through.
// Distinct from HIGH_CONFIDENCE_THRESHOLD (0.8), which only controls public
// visibility (lib/events-query.ts) — this is stricter, and only about
// whether a human still needs to look at it. Only phrases/sources that are
// effectively unambiguous should use 0.95+ (e.g. lib/venue-accessibility.ts's
// fixed 0.95, or explicit unambiguous phrases like "lgbtq+"/"black-led").
export const AUTO_APPROVE_THRESHOLD = 0.95;

interface KeywordRule {
  phrase: string;
  confidence: number;
}

type KeywordBucketSlug = Exclude<BucketSlug, "free-entry">;

const BUCKET_KEYWORDS: Record<KeywordBucketSlug, KeywordRule[]> = {
  black: [
    { phrase: "pan-african", confidence: 0.95 },
    { phrase: "pan african", confidence: 0.95 },
    { phrase: "panafrica", confidence: 0.95 },
    { phrase: "pan-africanism", confidence: 0.95 },
    { phrase: "black women", confidence: 0.95 },
    { phrase: "black woman", confidence: 0.95 },
    { phrase: "black people", confidence: 0.95 },
    { phrase: "black person", confidence: 0.95 },
    { phrase: "black men", confidence: 0.95 },
    { phrase: "black man", confidence: 0.95 },
    { phrase: "black owned", confidence: 0.95 },
    { phrase: "black-owned", confidence: 0.95 },
    { phrase: "black-led", confidence: 0.95 },
    { phrase: "black led", confidence: 0.95 },
    { phrase: "black queer", confidence: 0.95 },
    { phrase: "black trans", confidence: 0.95 },
    { phrase: "black community", confidence: 0.9 },
    { phrase: "black creatives", confidence: 0.9 },
    { phrase: "black founders", confidence: 0.9 },
    { phrase: "black-focused", confidence: 0.9 },

    // UK-specific & Diaspora phrasing
    { phrase: "black british", confidence: 0.85 },
    { phrase: "afro-caribbean", confidence: 0.85 },
    { phrase: "afro caribbean", confidence: 0.85 },
    { phrase: "afrocaribbean", confidence: 0.85 },
    { phrase: "african and caribbean", confidence: 0.85 },
    { phrase: "african-caribbean", confidence: 0.85 },
    { phrase: "african diaspora", confidence: 0.85 },
    { phrase: "caribbean diaspora", confidence: 0.85 },
    { phrase: "black heritage", confidence: 0.85 },

    // Cultural expressions & Event themes
    { phrase: "black joy", confidence: 0.85 },
    { phrase: "black excellence", confidence: 0.85 },
    { phrase: "black history month", confidence: 0.85 },
    { phrase: "bhm", confidence: 0.8 },
    { phrase: "melanin", confidence: 0.75 },
    { phrase: "black owned business", confidence: 0.95 },
    { phrase: "afro-caribbean", confidence: 0.8 },
    { phrase: "afrocaribbean", confidence: 0.8 },
    { phrase: "black history month", confidence: 0.85 },
    { phrase: "black british", confidence: 0.65 },
    { phrase: "afrobeats", confidence: 0.4 }, // Low: often just a club night genre
    { phrase: "amapiano", confidence: 0.4 },
    { phrase: "black audience", confidence: 0.9 },
    { phrase: "black audiences", confidence: 0.9 },
    { phrase: "black music", confidence: 0.9 },
    { phrase: "black culture", confidence: 0.85 },
    { phrase: "black arts", confidence: 0.85 },
    { phrase: "black art", confidence: 0.75 },
    { phrase: "black history", confidence: 0.8 },
    { phrase: "black experience", confidence: 0.85 },
    { phrase: "black stories", confidence: 0.85 },
    { phrase: "african art", confidence: 0.8 },
    { phrase: "african artist", confidence: 0.75 },
  ],
  poc: [
    { phrase: "people of colour", confidence: 0.95 },
    { phrase: "people of color", confidence: 0.95 },
    { phrase: "bpoc", confidence: 0.95 },
    { phrase: "bipoc", confidence: 0.95 },
    { phrase: "qtipoc", confidence: 0.95 },
    { phrase: "qtibpoc", confidence: 0.95 }, // Explicit Trans/Intersex addition
    { phrase: "qtoc", confidence: 0.9 },
    { phrase: "poc-led", confidence: 0.95 },
    { phrase: "poc led", confidence: 0.95 },
    { phrase: "poc-owned", confidence: 0.95 },
    { phrase: "poc owned", confidence: 0.95 },

    // UK Collective Terminology
    { phrase: "global majority", confidence: 0.85 },
    { phrase: "people of the global majority", confidence: 0.9 },
    { phrase: "person of the global majority", confidence: 0.9 },
    { phrase: "black and brown", confidence: 0.85 },
    { phrase: "black & brown", confidence: 0.85 },
    { phrase: "bame", confidence: 0.75 }, // Common UK institutional acronym
    { phrase: "poc community", confidence: 0.85 },
    { phrase: "poc-friendly", confidence: 0.8 },
    { phrase: "poc audience", confidence: 0.85 },
    { phrase: "poc audiences", confidence: 0.85 },
    { phrase: "women of colour", confidence: 0.9 },
    { phrase: "woman of colour", confidence: 0.9 },
    { phrase: "women of color", confidence: 0.9 },
  ],
  queer: [
    { phrase: "lgbtq+", confidence: 0.95 },
    { phrase: "lgbtqia+", confidence: 0.95 },
    { phrase: "lgbtq", confidence: 0.95 },
    { phrase: "lgbt+", confidence: 0.95 },
    { phrase: "queer", confidence: 0.85 },
    { phrase: "sapphic", confidence: 0.9 },
    { phrase: "trans-friendly", confidence: 0.9 },
    { phrase: "trans friendly", confidence: 0.9 },
    { phrase: "trans joy", confidence: 0.9 },
    { phrase: "transgender", confidence: 0.75 },
    { phrase: "non-binary", confidence: 0.75 },
    { phrase: "nonbinary", confidence: 0.75 },
    { phrase: "enby", confidence: 0.7 },
    { phrase: "gay night", confidence: 0.85 },
    { phrase: "drag show", confidence: 0.75 },
    { phrase: "drag king", confidence: 0.85 },
    { phrase: "drag queen", confidence: 0.8 },
    { phrase: "pride", confidence: 0.5 }, // Low: high corporate co-optation
    { phrase: "queer audience", confidence: 0.85 },
    { phrase: "queer audiences", confidence: 0.85 },
  ],
  latinx: [
    { phrase: "latinx", confidence: 0.95 },
    { phrase: "latine", confidence: 0.95 },
    { phrase: "latinx-led", confidence: 0.95 },
    { phrase: "latinx led", confidence: 0.95 },
    { phrase: "latine-led", confidence: 0.95 },
    { phrase: "latin-owned", confidence: 0.9 },
    { phrase: "latin owned", confidence: 0.9 },
    { phrase: "latina-owned", confidence: 0.9 },
    { phrase: "latina owned", confidence: 0.9 },
    { phrase: "latin american", confidence: 0.85 },
    { phrase: "latin america", confidence: 0.8 },
    { phrase: "latin community", confidence: 0.85 },
    { phrase: "latinx community", confidence: 0.9 },
    { phrase: "latin creatives", confidence: 0.85 },
    { phrase: "latina", confidence: 0.75 },
    { phrase: "latinas", confidence: 0.75 },
    { phrase: "latino", confidence: 0.7 },
    { phrase: "latinos", confidence: 0.7 },
    { phrase: "hispanic", confidence: 0.7 },
    { phrase: "afro-latina", confidence: 0.9 },
    { phrase: "afro-latino", confidence: 0.9 },
    { phrase: "afro-latinx", confidence: 0.95 },
    { phrase: "afrolatinx", confidence: 0.95 },
    { phrase: "afrolatina", confidence: 0.9 },
    { phrase: "queer latinx", confidence: 0.95 },
    { phrase: "queer latina", confidence: 0.95 },
    { phrase: "latinx audience", confidence: 0.9 },
    { phrase: "latinx audiences", confidence: 0.9 },
    { phrase: "latin american art", confidence: 0.8 },
    { phrase: "latin american artist", confidence: 0.75 },
    { phrase: "latino art", confidence: 0.7 },
    { phrase: "latina art", confidence: 0.7 },
  ],
  "east-mon-asian": [
    { phrase: "esea", confidence: 0.9 }, // East and Southeast Asian
    { phrase: "esea-led", confidence: 0.95 },
    { phrase: "east asian", confidence: 0.75 },
    { phrase: "southeast asian", confidence: 0.75 },
    { phrase: "east & southeast asian", confidence: 0.9 },
    { phrase: "east asian art", confidence: 0.75 },
    { phrase: "east asian artist", confidence: 0.75 },
    { phrase: "southeast asian art", confidence: 0.75 },
    { phrase: "southeast asian artist", confidence: 0.75 },
  ],
  "south-asian": [
    { phrase: "south asian", confidence: 0.8 },
    { phrase: "south asian queer", confidence: 0.95 },
    { phrase: "desi queer", confidence: 0.9 },
    { phrase: "brown joy", confidence: 0.85 },
    { phrase: "south asian art", confidence: 0.75 },
    { phrase: "south asian artist", confidence: 0.75 },
    { phrase: "desi artist", confidence: 0.7 },
  ],
  "disability-friendly": [
    { phrase: "wheelchair accessible", confidence: 0.95 },
    { phrase: "wheelchair-accessible", confidence: 0.95 },
    { phrase: "step-free access", confidence: 0.95 },
    { phrase: "step-free", confidence: 0.9 },
    { phrase: "step free", confidence: 0.9 },
    { phrase: "disabled access", confidence: 0.9 },
    { phrase: "accessible toilet", confidence: 0.85 },
    { phrase: "changing places toilet", confidence: 0.95 },
    { phrase: "audio described", confidence: 0.9 },
    { phrase: "touch tour", confidence: 0.9 },
    { phrase: "disability-friendly", confidence: 0.9 },
    { phrase: "accessible venue", confidence: 0.85 },
    { phrase: "ramp access", confidence: 0.85 },
    { phrase: "large print available", confidence: 0.8 },
  ],
  "autistic-friendly": [
    { phrase: "autism-friendly", confidence: 0.95 },
    { phrase: "autistic-friendly", confidence: 0.95 },
    { phrase: "sensory-friendly", confidence: 0.9 },
    { phrase: "sensory friendly", confidence: 0.9 },
    { phrase: "low sensory", confidence: 0.85 },
    { phrase: "relaxed performance", confidence: 0.85 },
    { phrase: "chilled performance", confidence: 0.85 },
    { phrase: "quiet space available", confidence: 0.85 },
    { phrase: "neurodivergent-friendly", confidence: 0.9 },
    { phrase: "neurodivergent friendly", confidence: 0.9 },
    { phrase: "quiet room", confidence: 0.85 },
    { phrase: "sensory room", confidence: 0.9 },
    { phrase: "ear defenders provided", confidence: 0.9 },
    // Deliberately no bare "relaxed" here — too common a word in ordinary
    // event copy ("a relaxed evening of jazz") to use as a global keyword;
    // "relaxed opening" is the specific museum/gallery accessibility term.
    { phrase: "relaxed opening", confidence: 0.85 },
  ],
  "deaf-accessible": [
    { phrase: "bsl interpreted", confidence: 0.95 },
    { phrase: "bsl interpreter", confidence: 0.95 },
    { phrase: "bsl interpretation", confidence: 0.95 },
    { phrase: "integrated bsl", confidence: 0.95 },
    { phrase: "captioned performance", confidence: 0.9 },
    { phrase: "live captioning", confidence: 0.9 },
    { phrase: "palantype", confidence: 0.9 },
    { phrase: "speech to text", confidence: 0.85 },
    { phrase: "speech-to-text", confidence: 0.85 },
    { phrase: "hearing loop", confidence: 0.85 },
    { phrase: "british sign language", confidence: 0.9 },
  ],
  "womxn-led": [
    { phrase: "womxn", confidence: 0.85 },
    { phrase: "women-led", confidence: 0.95 },
    { phrase: "women led", confidence: 0.95 },
    { phrase: "female-led", confidence: 0.85 },
    { phrase: "female led", confidence: 0.85 },
    { phrase: "flinta", confidence: 0.95 }, // Female, Lesbian, Intersex, Trans, Agender
    { phrase: "women-only", confidence: 0.85 },
    { phrase: "girls night", confidence: 0.4 },
    { phrase: "bsl signed", confidence: 0.9 },
    { phrase: "deaf friendly", confidence: 0.85 },
    { phrase: "subtitled", confidence: 0.7 },
    { phrase: "female-founded", confidence: 0.9 },
    { phrase: "women-founded", confidence: 0.9 },
  ],
  "sober-friendly": [
    { phrase: "alcohol-free", confidence: 0.95 },
    { phrase: "alcohol free", confidence: 0.95 },
    { phrase: "sober event", confidence: 0.9 },
    { phrase: "sober space", confidence: 0.9 },
    { phrase: "sober clubbing", confidence: 0.9 },
    { phrase: "dry event", confidence: 0.8 },
    { phrase: "no alcohol", confidence: 0.8 },
    { phrase: "mocktails available", confidence: 0.75 },
    { phrase: "dry bar", confidence: 0.85 },
    { phrase: "sober curious", confidence: 0.85 },
  ],
  "grassroots-activism": [
    { phrase: "mutual aid", confidence: 0.95 },
    { phrase: "community organizing", confidence: 0.9 },
    { phrase: "union rally", confidence: 0.9 },
    { phrase: "strike fund", confidence: 0.95 },
    { phrase: "climate justice", confidence: 0.85 },
    { phrase: "antiracist", confidence: 0.85 },
    { phrase: "anti-racist", confidence: 0.85 },
    { phrase: "decolonial", confidence: 0.85 },
    { phrase: "banner making", confidence: 0.8 },
    { phrase: "zine workshop", confidence: 0.7 },
    { phrase: "community assembly", confidence: 0.85 },
    { phrase: "grassroots campaign", confidence: 0.85 },
  ],
  "low-income-access": [
    { phrase: "pay-what-you-can", confidence: 0.95 },
    { phrase: "pwyc", confidence: 0.95 },
    { phrase: "sliding scale", confidence: 0.9 },
    { phrase: "not-for-profit", confidence: 0.8 },
    { phrase: "solidarity ticket", confidence: 0.9 },
    { phrase: "free meal included", confidence: 0.85 },
    { phrase: "donations welcome", confidence: 0.7 },
  ],
};

export interface BucketMatch {
  bucketSlug: BucketSlug;
  confidence: number;
  evidence: string;
}

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

export interface ClassifiableEvent {
  title: string;
  description: string | null;
  isFree: boolean;
}

export function classifyEventBuckets(event: ClassifiableEvent): BucketMatch[] {
  const text = `${event.title} ${event.description ?? ""}`.toLowerCase();
  const matches: BucketMatch[] = [];

  for (const [slug, rules] of Object.entries(BUCKET_KEYWORDS) as [
    KeywordBucketSlug,
    KeywordRule[],
  ][]) {
    let best: KeywordRule | null = null;
    for (const rule of rules) {
      if (matchesPhrase(text, rule.phrase) && (!best || rule.confidence > best.confidence)) {
        best = rule;
      }
    }
    if (best) {
      matches.push({ bucketSlug: slug, confidence: best.confidence, evidence: best.phrase });
    }
  }

  if (event.isFree) {
    matches.push({ bucketSlug: "free-entry", confidence: 1, evidence: "is_free = true" });
  }

  return matches;
}

// Display labels for the Filter panel / admin review queue.
export const BUCKET_LABELS: Record<BucketSlug, string> = {
  black: "Black",
  poc: "POC",
  queer: "Queer",
  latinx: "Latinx",
  "east-mon-asian": "East & Southeast Asian",
  "south-asian": "South Asian",
  "disability-friendly": "Disability-friendly",
  "autistic-friendly": "Autistic-friendly",
  "deaf-accessible": "Deaf-accessible",
  "womxn-led": "Womxn-led",
  "sober-friendly": "Sober-friendly",
  "grassroots-activism": "Grassroots & Activism",
  "low-income-access": "Low-income Access",
  "free-entry": "Free Entry",
};

// These describe access/cost, not identity or a specific accessibility
// need — matching one of these alone should not be enough to pass the
// "niche events only" gate in app/page.tsx. They're still valid enrichment
// tags shown alongside a real identity/accessibility match.
export const NON_QUALIFYING_BUCKETS: BucketSlug[] = ["free-entry", "low-income-access"];

// These describe a physical/sensory accessibility feature of the *venue or
// event itself*, not the community it's for — most public venues have a
// step-free entrance or an accessible toilet as a matter of course (see
// lib/venue-accessibility.ts), so "wheelchair accessible" alone says
// nothing about who the event is actually aimed at. Per product decision,
// an event needs a real identity/community bucket match (black, queer,
// womxn-led, ...) to pass the "niche events only" gate — one of these
// alone, or several of these together with no identity bucket, is not
// enough. They're still valid enrichment tags shown alongside a
// qualifying match. Kept separate from NON_QUALIFYING_BUCKETS (which is
// about cost, not accessibility) so call sites that only care about cost —
// e.g. the Sidebar "Community" filter list — aren't affected by this rule.
export const ACCESS_ONLY_BUCKETS: BucketSlug[] = [
  "disability-friendly",
  "autistic-friendly",
  "deaf-accessible",
];

// Shared by lib/events-query.ts's "niche events only" gate and anywhere
// else that needs to know whether a single bucket match is, by itself,
// sufficient signal that an event belongs in front of users.
export function isGateQualifyingBucket(slug: string): boolean {
  return (
    !NON_QUALIFYING_BUCKETS.includes(slug as BucketSlug) &&
    !ACCESS_ONLY_BUCKETS.includes(slug as BucketSlug)
  );
}
