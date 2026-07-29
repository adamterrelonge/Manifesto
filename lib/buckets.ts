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

interface KeywordRule {
  phrase: string;
  confidence: number;
}

type KeywordBucketSlug = Exclude<BucketSlug, "free-entry">;

const BUCKET_KEYWORDS: Record<KeywordBucketSlug, KeywordRule[]> = {
  black: [
    { phrase: "black-owned", confidence: 0.95 },
    { phrase: "black owned", confidence: 0.95 },
    { phrase: "black-led", confidence: 0.95 },
    { phrase: "black led", confidence: 0.95 },
    { phrase: "black queer", confidence: 0.95 },
    { phrase: "black trans", confidence: 0.95 },
    { phrase: "black joy", confidence: 0.85 },
    { phrase: "black excellence", confidence: 0.85 },
    { phrase: "afro-caribbean", confidence: 0.8 },
    { phrase: "afrocaribbean", confidence: 0.8 },
    { phrase: "black history month", confidence: 0.85 },
    { phrase: "black british", confidence: 0.65 },
    { phrase: "afrobeats", confidence: 0.4 }, // Low: often just a club night genre
    { phrase: "amapiano", confidence: 0.4 },
  ],
  poc: [
    { phrase: "people of colour", confidence: 0.95 },
    { phrase: "people of color", confidence: 0.95 },
    { phrase: "bipoc", confidence: 0.9 },
    { phrase: "qtipoc", confidence: 0.95 }, // Queer Trans Intersex People of Colour
    { phrase: "qtoc", confidence: 0.9 },
    { phrase: "poc-led", confidence: 0.95 },
    { phrase: "poc led", confidence: 0.95 },
    { phrase: "poc-owned", confidence: 0.95 },
    { phrase: "global majority", confidence: 0.85 },
    { phrase: "people of the global majority", confidence: 0.9 },
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
  ],
  latinx: [
    { phrase: "latinx", confidence: 0.95 },
    { phrase: "latine", confidence: 0.9 },
    { phrase: "latin-owned", confidence: 0.9 },
    { phrase: "latinx-led", confidence: 0.9 },
    { phrase: "latin-american", confidence: 0.7 },
    { phrase: "hispanic", confidence: 0.6 },
    { phrase: "latina", confidence: 0.55 },
    { phrase: "latino", confidence: 0.55 },
  ],
  "east-mon-asian": [
    { phrase: "esea", confidence: 0.9 }, // East and Southeast Asian
    { phrase: "esea-led", confidence: 0.95 },
    { phrase: "east asian", confidence: 0.75 },
    { phrase: "southeast asian", confidence: 0.75 },
    { phrase: "east & southeast asian", confidence: 0.9 },
  ],
  "south-asian": [
    { phrase: "south asian", confidence: 0.8 },
    { phrase: "south asian queer", confidence: 0.95 },
    { phrase: "desi queer", confidence: 0.9 },
    { phrase: "brown joy", confidence: 0.85 },
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
    { phrase: "hearing loop", confidence: 0.85 },
  ],
  "womxn-led": [
    { phrase: "womxn", confidence: 0.85 },
    { phrase: "women-led", confidence: 0.95 },
    { phrase: "women led", confidence: 0.95 },
    { phrase: "female-led", confidence: 0.85 },
    { phrase: "female led", confidence: 0.85 },
    { phrase: "flinta", confidence: 0.95 }, // Female, Lesbian, Intersex, Trans, Agender
    { phrase: "women-only", confidence: 0.85 },
    { phrase: "girls night", confidence: 0.4 }, // Low: often commercial marketing
  ],
  "sober-friendly": [
    { phrase: "alcohol-free", confidence: 0.95 },
    { phrase: "alcohol free", confidence: 0.95 },
    { phrase: "sober event", confidence: 0.9 },
    { phrase: "sober space", confidence: 0.9 },
    { phrase: "sober clubbing", confidence: 0.9 },
    { phrase: "dry event", confidence: 0.8 },
    { phrase: "no alcohol", confidence: 0.8 },
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
