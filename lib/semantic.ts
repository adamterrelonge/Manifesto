// Pure helpers for the offline semantic classifier (scripts/semantic-classify.ts)
// and keyword miner (scripts/mine-keywords.ts). No I/O, no model — the
// scripts own fetching and embedding; everything here is unit-testable.
//
// Approach: sentence embeddings scored two ways, per bucket —
//   1. Prototype similarity: closeness to a few hand-written descriptions of
//      what the bucket is about (BUCKET_PROTOTYPES). Works from day one.
//   2. k-nearest-neighbours: closeness to events already tagged with the
//      bucket from *text evidence* (keyword match) or a human moderator
//      approval. Blended in once a bucket has MIN_KNN_POSITIVES of them.
// Every moderator approve/reject at /admin/review adds a labelled example,
// so kNN improves without any training step.
//
// Source-mission tags are deliberately NOT used as kNN positives: they say
// who the organiser is, not what the event's text is about, so learning
// from them teaches format instead of community (measured on live data:
// New Art Exchange's children's art clubs made "Sunday Art Club" at another
// gallery look like a `poc` event). Prototype ranking scored AUC 0.98 for
// black/queer on held-out keyword positives vs 0.95/0.96 for kNN alone.

import { classifyEventBuckets, isGateQualifyingBucket, type BucketSlug } from "@/lib/buckets";
import { sourceMissionMatches, type SourceMissionLookup } from "@/lib/source-missions";

/** Written confidence range for embedding suggestions — always below the
 *  0.8 public gate (lib/buckets.ts HIGH_CONFIDENCE_THRESHOLD), so they only
 *  surface in the review queue until a moderator approves them. */
export const EMBEDDING_CONFIDENCE_MIN = 0.6;
export const EMBEDDING_CONFIDENCE_MAX = 0.75;

/** Below this many positives a bucket can't be calibrated — no suggestions. */
export const MIN_CALIBRATION_POSITIVES = 5;
/** kNN is blended into the score only once a bucket has this many positives. */
export const MIN_KNN_POSITIVES = 8;
export const KNN_K = 3;

/** bge models expect this instruction on the short "query" side. */
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

// Hand-written descriptions per gate-qualifying bucket. Keep them about the
// community/purpose, and avoid words with a common unrelated sense — an
// earlier `poc` prototype using "colour" matched painting workshops.
export const BUCKET_PROTOTYPES: Partial<Record<BucketSlug, string[]>> = {
  black: [
    "An event celebrating Black British, African and Caribbean culture and heritage",
    "Black artists, writers and communities from the African diaspora",
    "Black history and the Black experience in Britain",
  ],
  poc: [
    "An event for racially minoritised people and the global majority",
    "Race, racism and representation for Black and brown communities",
  ],
  queer: [
    "An LGBTQ+ event for queer, gay, lesbian, bisexual and trans people",
    "Queer culture, drag and Pride",
    "A social group for trans and non-binary people",
  ],
  latinx: [
    "Latin American culture, music and community in the UK",
    "Latinx and Hispanic artists from Latin America",
  ],
  "east-mon-asian": [
    "East and Southeast Asian culture: Chinese, Japanese, Korean, Vietnamese, Filipino",
    "ESEA artists and diaspora communities in Britain",
  ],
  "south-asian": [
    "South Asian culture: Indian, Pakistani, Bangladeshi, Sri Lankan and Nepali",
    "Desi artists and the South Asian diaspora in Britain",
  ],
  "womxn-led": [
    "An event led by and for women",
    "Women artists, feminism and women's voices",
  ],
  "sober-friendly": ["An alcohol-free, sober social event"],
  "grassroots-activism": ["Community organising, mutual aid, protest and grassroots activism"],
};

export interface ExistingTag {
  bucketSlug: string;
  confidence: number | null;
  assignedBy: string;
}

export interface LabelSourceEvent extends SourceMissionLookup {
  id: string;
  title: string;
  description: string | null;
  isFree: boolean;
  tags: ExistingTag[];
}

export interface BucketLabels {
  positives: Set<string>;
  negatives: Set<string>;
  /** Any existing row (incl. rejected/low-confidence) — never re-suggest these. */
  tagged: Set<string>;
}

/** Tags not used as kNN positives: organiser/venue-level tags, and other
 *  models' output (learning from it would let model errors reinforce). */
const NON_TEXT_ASSIGNERS = new Set(["source-mission", "venue-accessibility", "embedding", "model-evidence"]);

/** Labels per gate-qualifying bucket, combining what's stored in
 *  event_buckets with what the current keyword + mission rules would assign
 *  (so a fresh rule takes effect before the next ingest writes it).
 *  positives = text-evidenced or human-approved; tagged = any existing or
 *  rule-derived tag at all (those events are never re-suggested). */
export function buildBucketLabels(events: LabelSourceEvent[]): Map<BucketSlug, BucketLabels> {
  const labels = new Map<BucketSlug, BucketLabels>();
  const get = (slug: string) => {
    if (!isGateQualifyingBucket(slug)) return null;
    let entry = labels.get(slug as BucketSlug);
    if (!entry) {
      entry = { positives: new Set(), negatives: new Set(), tagged: new Set() };
      labels.set(slug as BucketSlug, entry);
    }
    return entry;
  };

  for (const event of events) {
    const rejected = new Set<string>();
    for (const tag of event.tags) {
      const entry = get(tag.bucketSlug);
      if (!entry) continue;
      entry.tagged.add(event.id);
      if (tag.assignedBy === "rejected") {
        entry.negatives.add(event.id);
        rejected.add(tag.bucketSlug);
      } else if (
        tag.assignedBy === "moderator" ||
        (!NON_TEXT_ASSIGNERS.has(tag.assignedBy) && (tag.confidence ?? 0) >= 0.85)
      ) {
        entry.positives.add(event.id);
      }
    }

    const keywordMatches = classifyEventBuckets({
      title: event.title,
      description: event.description,
      isFree: event.isFree,
    });
    for (const match of keywordMatches) {
      const entry = get(match.bucketSlug);
      if (!entry) continue;
      entry.tagged.add(event.id);
      if (match.confidence >= 0.85 && !rejected.has(match.bucketSlug)) entry.positives.add(event.id);
    }
    for (const match of sourceMissionMatches(event)) {
      get(match.bucketSlug)?.tagged.add(event.id);
    }
  }

  // A moderator rejection always wins over a rule/stored positive.
  for (const entry of labels.values()) {
    for (const id of entry.negatives) entry.positives.delete(id);
  }
  return labels;
}

/** Text fed to the embedding model. Descriptions are truncated: the model
 *  only reads ~512 tokens anyway and long boilerplate dilutes the signal. */
export function embeddingText(title: string, description: string | null): string {
  const desc = (description ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
  return desc ? `${title.trim()}. ${desc}` : title.trim();
}

/** Dot product — equals cosine similarity for L2-normalised vectors. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export interface KnnResult {
  score: number;
  nearestId: string | null;
  nearestSim: number;
}

/** Mean similarity to the k most similar ids in `pool` (excluding `selfId`). */
export function knnScore(
  vector: ArrayLike<number>,
  pool: Iterable<string>,
  vectors: Map<string, ArrayLike<number>>,
  k = KNN_K,
  selfId?: string
): KnnResult {
  const sims: { id: string; sim: number }[] = [];
  for (const id of pool) {
    if (id === selfId) continue;
    const other = vectors.get(id);
    if (other) sims.push({ id, sim: cosine(vector, other) });
  }
  if (sims.length === 0) return { score: 0, nearestId: null, nearestSim: 0 };
  sims.sort((a, b) => b.sim - a.sim);
  const top = sims.slice(0, k);
  return {
    score: top.reduce((s, x) => s + x.sim, 0) / top.length,
    nearestId: top[0].id,
    nearestSim: top[0].sim,
  };
}

/** Recurring listings ("Trans Social" every week) repeat the same text; keep
 *  one id per normalised title so they don't dominate kNN or calibration. */
export function dedupeByTitle(ids: Iterable<string>, titleOf: (id: string) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const key = titleOf(id).toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

/** Highest similarity to any of a bucket's prototype vectors. */
export function prototypeScore(vector: ArrayLike<number>, prototypes: ArrayLike<number>[]): number {
  let best = -1;
  for (const p of prototypes) best = Math.max(best, cosine(vector, p));
  return best;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Suggestion threshold for one bucket: an event must score above both
 *  - the background's 99.5th percentile (unusual among untagged events), and
 *  - the 25th percentile of leave-one-out positive scores (looks like a
 *    typical known member of the bucket, not an outlier one).
 *  Data-driven per bucket, so it adapts as labels accumulate. On live data
 *  p99 admitted mostly format-alike noise ("Saturday Art Club" as queer). */
export function chooseThreshold(looPositiveScores: number[], backgroundScores: number[]): number {
  return Math.max(percentile(backgroundScores, 99.5), percentile(looPositiveScores, 25));
}

/** Which bucket's prototypes an event is closest to overall. An event is
 *  only suggested for the bucket it matches best, so an LGBTQ+ event that
 *  is merely near the `black` prototypes isn't suggested as `black`. */
export function bestPrototypeBucket(
  vector: ArrayLike<number>,
  prototypesByBucket: Map<string, ArrayLike<number>[]>
): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [slug, protos] of prototypesByBucket) {
    const s = prototypeScore(vector, protos);
    if (s > bestScore) {
      bestScore = s;
      best = slug;
    }
  }
  return best;
}

/** Map a passing score onto the review-only confidence band. */
export function suggestionConfidence(score: number, threshold: number, maxScore: number): number {
  const span = maxScore - threshold;
  const t = span > 0 ? Math.min(1, Math.max(0, (score - threshold) / span)) : 1;
  const conf = EMBEDDING_CONFIDENCE_MIN + t * (EMBEDDING_CONFIDENCE_MAX - EMBEDDING_CONFIDENCE_MIN);
  return Math.round(conf * 100) / 100;
}

// ---------------------------------------------------------------------------
// Keyword mining (scripts/mine-keywords.ts)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or our the this to was we will with you your their they them us all can more not but join".split(
    " "
  )
);

/** Distinct 1-3 word n-grams in a text, skipping ones that start or end on
 *  a stopword or contain a number (dates/prices/times are noise here). */
export function ngrams(text: string, maxN = 3): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z][a-z'+-]*[a-z+]|[a-z]/g) ?? [];
  const out = new Set<string>();
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[n - 1])) continue;
      if (gram.some((t) => t.length < 2)) continue;
      out.add(gram.join(" "));
    }
  }
  return out;
}

export interface MinedPhrase {
  phrase: string;
  positiveDocs: number;
  backgroundDocs: number;
  distinctSources: number;
  logOdds: number;
}

/** Contrastive phrase mining: n-grams far more common in a bucket's
 *  positives than in untagged events. `minSources` stops one organiser's
 *  boilerplate footer from dominating the list. */
export function minePhrases(
  positives: { text: string; source: string }[],
  background: string[],
  opts: { minDocs?: number; minSources?: number; alpha?: number } = {}
): MinedPhrase[] {
  const { minDocs = 3, minSources = 2, alpha = 0.5 } = opts;
  const posCount = new Map<string, number>();
  const posSources = new Map<string, Set<string>>();
  for (const { text, source } of positives) {
    for (const gram of ngrams(text)) {
      posCount.set(gram, (posCount.get(gram) ?? 0) + 1);
      let sources = posSources.get(gram);
      if (!sources) posSources.set(gram, (sources = new Set()));
      sources.add(source);
    }
  }
  const bgCount = new Map<string, number>();
  for (const text of background) {
    for (const gram of ngrams(text)) {
      if (posCount.has(gram)) bgCount.set(gram, (bgCount.get(gram) ?? 0) + 1);
    }
  }

  const P = positives.length;
  const B = background.length;
  const results: MinedPhrase[] = [];
  for (const [phrase, p] of posCount) {
    const sources = posSources.get(phrase)!.size;
    if (p < minDocs || sources < minSources) continue;
    const b = bgCount.get(phrase) ?? 0;
    const logOdds = Math.log((p + alpha) / (P + alpha)) - Math.log((b + alpha) / (B + alpha));
    results.push({ phrase, positiveDocs: p, backgroundDocs: b, distinctSources: sources, logOdds });
  }
  return results.sort((a, b) => b.logOdds - a.logOdds);
}
