# Local model evaluation — Phase 3 (2026-11-25)

Plan: `docs/INGESTION_EXPANSION_PLAN.md` §3. Code: `lib/zero-shot.ts`,
`scripts/model-classify.ts`. Re-run with:

```
npm run classify:model -- --eval                 # table below, from docs/eval/model-labels.json
npm run classify:model -- --eval --dump f.tsv    # + candidates to label
```

## Setup

- **Model**: `MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33` (zero-shot
  NLI, ~90MB at q8, CPU via transformers.js, cached in `.cache/models`).
  Chosen over `Xenova/nli-deberta-v3-xsmall`, which said "a talk or lecture"
  0.91 for a warehouse rave and 0.97 for a sitar concert.
- **Hypothesis wording matters most.** With `This example is {}.` and short
  labels ("for LGBTQ+ people"), known talks scored 1.00; with full sentences
  ("This event is a talk, lecture or discussion.") the same titles scored
  0.13. Recall on keyword-tagged queer events went 0/40 → 34/40.
- **Evidence**: title + first 3 sentences are scored separately, the
  organiser's name masked first; the best passage is stored verbatim as
  evidence and re-checked against the event text before writing.
- **Candidates**: per bucket, the N untagged, non-large events nearest the
  bucket's prototypes by bge-small embedding (normal run N = 30-150; the eval
  reads 3N, so precision is measured on harder negatives than production
  sees).
- **Labels**: every distinct title scoring ≥ 0.9 (and many lower) was
  hand-labelled by Claude for "does this event belong in the bucket" —
  `docs/eval/model-labels.json`, 194 labels. **These want a human
  spot-check**; the enabled buckets also go through `/admin/review`.
- **Precision** counts distinct titles (a weekly listing counts once).
  **Recall** = share of events already tagged from their own text (keyword
  ≥ 0.85 or moderator) that the model also scores above the threshold.

## Results

| Bucket | Precision at threshold | Recall (known) | Why it fails | Decision |
|---|---|---|---|---|
| queer | **100%** (3/3 ≥ 0.9, of 180 screened) | 23/28 | — | **on, 0.9** |
| poc | 69% @0.9, 95% @0.98, **100%** (16/16) @0.99 | 1/20 @0.99 | "Bi The Way" 0.985 | **on, 0.99** |
| south-asian | 69% @0.95, 86% @0.98 | 3/4 | Paris Opera *La Bayadère*, Central Asian artists, Cantonese meetup | off |
| black | 33–50% | 14/36 | "Black Parade" emo night, "Stephen Black" medium | off |
| east-mon-asian | 67% | 2/13 | Indian and Central Asian events | off |
| latinx | 50–60% | 2/4 | Spain, Portugal, the Philippines | off |
| womxn-led | 63–83% | — | any woman artist's name ("Laura Onions") | off |
| grassroots-activism | 42–44% ≤ 0.95 | — | history talks, queer events | off |
| sober-friendly | 0% | — | children's art clubs | off |
| community-culture | 38–53% | 21/39 @0.9 | exhibitions, kids' workshops, teacher CPD read as "a talk" | off |
| category backfill | ~55–60% (70-title sample) | — | "Black History Bus tour" → music, comedians → sports | off |

**Scale** (plan 3a) was not attempted with the model: an event's text
doesn't carry venue capacity; the venue list and capacities in
`lib/scale.ts` are the right tool.

## Effect

Normal run on live data: **11 tags** (9 poc, 2 queer) → public at 0.8-0.9
confidence, all still in the review queue. Runtime: ~15s cold (plus a
one-off ~90MB model download), ~7s warm.

## Reading this

A small zero-shot model is good at "is this event for LGBTQ+ people" and
at very-high-confidence race/racism topics, and bad at anything where a
word has a second meaning (Black, women's names, "late"), at geography
(South vs Central vs East Asia, Spain vs Latin America), and at format.
The rule-based format matcher (`lib/community-culture.ts`) stays the
source of community-culture. Next levers: Phase 4 sources; or, if more model
coverage is wanted, a larger NLI model (`deberta-v3-base` zeroshot, ~4x CPU)
evaluated with this same harness.
