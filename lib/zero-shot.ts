// Pure helpers for the local zero-shot classifier (scripts/model-classify.ts,
// docs/INGESTION_EXPANSION_PLAN.md Phase 3). No I/O, no model — the script
// owns loading and inference; everything here is unit-testable.
//
// How a model tag is earned:
//   1. The event's own text is split into passages (title + sentences).
//      The organiser's name is masked first, so who runs an event is never
//      evidence for who it's for (PROJECT_PLAN §9).
//   2. A local NLI model scores "does this passage entail <hypothesis>" for
//      each passage. The best passage is the evidence span — verbatim from
//      the event by construction, and re-checked before writing.
//   3. A target is only auto-applied if it is enabled in AUTO_APPLY, which
//      is switched on per target from the measured precision in
//      docs/MODEL_EVAL.md. Below its threshold nothing is written; the
//      embedding suggester (scripts/semantic-classify.ts) still covers the
//      review queue.

import type { BucketSlug } from "@/lib/buckets";
import type { Category } from "@/lib/categories";

/** Picked by the benchmark in docs/MODEL_EVAL.md: ~90MB at q8, ~15ms per
 *  (passage, hypothesis) pair on CPU, and far fewer false entailments than
 *  Xenova/nli-deberta-v3-xsmall on event titles. */
export const ZERO_SHOT_MODEL = "MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33";

export type ModelTarget = Extract<
  BucketSlug,
  | "black"
  | "poc"
  | "queer"
  | "latinx"
  | "east-mon-asian"
  | "south-asian"
  | "womxn-led"
  | "sober-friendly"
  | "grassroots-activism"
  | "community-culture"
>;

/** The model was trained on this template; wording matters a lot here —
 *  measured on live titles, full-sentence hypotheses ("This event is a
 *  talk...") scored known talks at 0.13, this template at 1.00. */
export const HYPOTHESIS_TEMPLATE = "This example is {}.";

/** One or more labels per target, slotted into HYPOTHESIS_TEMPLATE; a
 *  target's score is the best over labels and passages. Short, and about
 *  the event's content rather than its organiser. */
export const HYPOTHESES: Record<ModelTarget, string[]> = {
  black: ["about Black, African or Caribbean culture"],
  poc: ["about racism or people of colour"],
  queer: ["for LGBTQ+ people"],
  latinx: ["about Latin American culture"],
  "east-mon-asian": ["about East or Southeast Asian culture"],
  "south-asian": ["about South Asian culture"],
  "womxn-led": ["about women"],
  "sober-friendly": ["an alcohol-free social"],
  "grassroots-activism": ["about activism or community organising"],
  // Mirrors the format rule in lib/community-culture.ts: talks, readings
  // and Lates — not every screening, workshop or exhibition.
  "community-culture": ["a talk", "a book launch or poetry reading", "a museum late"],
};

/** Short descriptions per target used to pre-screen candidates with the
 *  embedding model before the (slower) NLI model sees them. */
export const SCREEN_PROTOTYPES: Record<ModelTarget, string[]> = {
  black: ["Black British, African and Caribbean culture, heritage and history"],
  poc: ["Race, racism and people of colour", "Global majority and racially minoritised communities"],
  queer: ["LGBTQ+, queer, gay, lesbian, bisexual and trans people", "Drag and Pride"],
  latinx: ["Latin American and Hispanic culture, music and people"],
  "east-mon-asian": ["Chinese, Japanese, Korean, Vietnamese, Filipino and Southeast Asian culture"],
  "south-asian": ["Indian, Pakistani, Bangladeshi, Sri Lankan culture, Diwali, Eid and Bollywood"],
  "womxn-led": ["Women artists, feminism and women's voices"],
  "sober-friendly": ["An alcohol-free, sober social event"],
  "grassroots-activism": ["Activism, protest, mutual aid and community organising"],
  "community-culture": [
    "An artist talk, curator talk, lecture or panel discussion",
    "A book launch, author reading or poetry night",
    "A museum or gallery late-night opening",
  ],
};

export interface AutoApplyRule {
  enabled: boolean;
  /** Minimum entailment probability on the evidence passage. */
  threshold: number;
  /** Eval result that justified the setting (docs/MODEL_EVAL.md). */
  basis: string;
}

/** Per-target switch. A target is only enabled once the eval shows ≥ 95%
 *  precision at its threshold (plan §3c); everything else stays off.
 *  Precision = distinct titles, hand-labelled, among the 3x-deep screen
 *  (docs/MODEL_EVAL.md, 2026-11-25). Re-run `npm run classify:model --
 *  --eval` before changing any of these. */
export const AUTO_APPLY: Record<ModelTarget, AutoApplyRule> = {
  queer: { enabled: true, threshold: 0.9, basis: "3/3 correct ≥ 0.9 of 180 screened; recall 23/28 on keyword positives" },
  poc: { enabled: true, threshold: 0.99, basis: "16/16 correct ≥ 0.99; 18/19 at 0.98 (miss: 'Bi The Way')" },
  black: { enabled: false, threshold: 0.9, basis: "33-50%: the word 'Black' in names (Black Parade, Stephen Black)" },
  latinx: { enabled: false, threshold: 0.9, basis: "50-60%: Spain, Portugal and the Philippines read as Latin America" },
  "east-mon-asian": { enabled: false, threshold: 0.9, basis: "67%: Indian and Central Asian events read as East Asian" },
  "south-asian": { enabled: false, threshold: 0.9, basis: "69% at 0.95, 86% at 0.98: Orientalist ballet, Central Asian artists" },
  "womxn-led": { enabled: false, threshold: 0.9, basis: "63-83%: fires on any woman artist's name" },
  "sober-friendly": { enabled: false, threshold: 0.9, basis: "0%: children's art clubs read as alcohol-free socials" },
  "grassroots-activism": { enabled: false, threshold: 0.9, basis: "42-44% ≤ 0.95: history talks and queer events" },
  "community-culture": { enabled: false, threshold: 0.9, basis: "38-53%: exhibitions, kids' workshops and CPD read as talks" },
};

/** Category backfill from titles: off — ~55-60% right on a 70-title
 *  sample (tours as music, comedians as sports). Kept for --eval. */
export const CATEGORY_AUTO_APPLY = false;

/** Written confidence for an auto-applied model tag: inside the public band
 *  (≥ 0.8) but under AUTO_APPROVE_THRESHOLD (0.95), so every model tag is
 *  public *and* still waits in /admin/review for a moderator to confirm. */
export const MODEL_CONFIDENCE_MIN = 0.8;
export const MODEL_CONFIDENCE_MAX = 0.9;

export function modelConfidence(score: number, threshold: number): number {
  const span = 1 - threshold;
  const t = span > 0 ? Math.min(1, Math.max(0, (score - threshold) / span)) : 1;
  return Math.round((MODEL_CONFIDENCE_MIN + t * (MODEL_CONFIDENCE_MAX - MODEL_CONFIDENCE_MIN)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Passages and evidence
// ---------------------------------------------------------------------------

export const MAX_PASSAGES = 4;
const MIN_PASSAGE_CHARS = 12;
const MAX_PASSAGE_CHARS = 300;
export const ORGANISER_MASK = "the organiser";

export interface Passage {
  /** Verbatim text from the event — what gets stored as evidence. */
  text: string;
  /** What the model reads: `text` with the organiser's name masked. */
  input: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces the organiser's name (whole words, any case) with a neutral
 *  placeholder. Names under 4 characters are left alone — too likely to
 *  hit ordinary words. */
export function maskOrganiser(text: string, organiserName: string | null | undefined): string {
  const name = organiserName?.trim();
  if (!name || name.length < 4) return text;
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"), ORGANISER_MASK);
}

/** Title first, then the description's first sentences — the opening of a
 *  listing says what the event is; the tail is usually booking and access
 *  boilerplate. */
export function splitPassages(
  title: string,
  description: string | null,
  organiserName?: string | null
): Passage[] {
  const raw: string[] = [title.trim()];
  const desc = (description ?? "").replace(/\s+/g, " ").trim();
  if (desc) {
    for (const sentence of desc.split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'(])/)) {
      const s = sentence.trim();
      if (s.length >= MIN_PASSAGE_CHARS) raw.push(s.length > MAX_PASSAGE_CHARS ? s.slice(0, MAX_PASSAGE_CHARS) : s);
      if (raw.length >= MAX_PASSAGES) break;
    }
  }
  const seen = new Set<string>();
  const out: Passage[] = [];
  for (const text of raw) {
    const key = text.toLowerCase().replace(/[.!?]+$/, "");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, input: maskOrganiser(text, organiserName) });
  }
  return out;
}

/** Evidence must be verbatim event text, and must still say something once
 *  the organiser's name is taken out. */
export function isVerifiedEvidence(
  passage: Passage,
  event: { title: string; description: string | null; organiserName?: string | null }
): boolean {
  const haystack = `${event.title} ${(event.description ?? "").replace(/\s+/g, " ")}`;
  if (!haystack.includes(passage.text)) return false;
  const rest = maskOrganiser(passage.text, event.organiserName).replaceAll(ORGANISER_MASK, "");
  return /\p{L}{3,}/u.test(rest);
}

export interface PassageScore {
  passage: Passage;
  hypothesis: string;
  score: number;
}

export interface ModelDecision {
  target: ModelTarget;
  score: number;
  evidence: PassageScore;
  confidence: number;
  evidenceText: string;
}

/** Best passage for a target, or null when nothing reaches the target's
 *  threshold, the target is off, or the evidence can't be verified. */
export function decide(
  target: ModelTarget,
  scores: PassageScore[],
  event: { title: string; description: string | null; organiserName?: string | null },
  rules: Record<ModelTarget, AutoApplyRule> = AUTO_APPLY
): ModelDecision | null {
  const rule = rules[target];
  if (!rule.enabled) return null;
  const best = bestPassage(scores, event);
  if (!best || best.score < rule.threshold) return null;
  return {
    target,
    score: best.score,
    evidence: best,
    confidence: modelConfidence(best.score, rule.threshold),
    evidenceText: modelEvidenceText(best),
  };
}

/** Highest-scoring passage whose evidence verifies. */
export function bestPassage(
  scores: PassageScore[],
  event: { title: string; description: string | null; organiserName?: string | null }
): PassageScore | null {
  let best: PassageScore | null = null;
  for (const s of scores) {
    if (best && s.score <= best.score) continue;
    if (!isVerifiedEvidence(s.passage, event)) continue;
    best = s;
  }
  return best;
}

export function modelEvidenceText(s: PassageScore): string {
  const quote = s.passage.text.length > 160 ? `${s.passage.text.slice(0, 157)}...` : s.passage.text;
  return `model (zero-shot ${s.score.toFixed(2)}): "${quote}" — ${HYPOTHESIS_TEMPLATE.replace("{}", s.hypothesis)}`;
}

// ---------------------------------------------------------------------------
// Category backfill (low risk: never affects the public gate)
// ---------------------------------------------------------------------------

/** Label per category (HYPOTHESIS_TEMPLATE), for events the keyword
 *  inference left null. */
export const CATEGORY_HYPOTHESES: Record<Category, string> = {
  music: "a concert, gig or club night",
  "theatre-performance": "a theatre, dance or comedy show",
  film: "a film screening",
  "gallery-exhibition": "an exhibition",
  "market-fair": "a market or fair",
  "workshop-talk": "a workshop, class, talk or tour",
  "community-social": "a social meetup",
  sports: "a sports match",
  "family-kids": "for children and families",
  "health-wellness": "about health and wellbeing",
};

export const CATEGORY_THRESHOLD = 0.8;
/** The winner must beat the runner-up by this much, or the event stays
 *  uncategorised — a wrong category is worse than none. */
export const CATEGORY_MARGIN = 0.2;

export function pickCategory(scores: Partial<Record<Category, number>>): Category | null {
  const ranked = (Object.entries(scores) as [Category, number][]).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const [top, second] = ranked;
  if (top[1] < CATEGORY_THRESHOLD) return null;
  if (second && top[1] - second[1] < CATEGORY_MARGIN) return null;
  return top[0];
}
