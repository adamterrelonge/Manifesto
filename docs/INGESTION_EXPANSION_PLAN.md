# Ingestion Expansion — Build Plan

Status: proposed (2026-11-25). Supersedes the "bucket-tagging is the only
gate" rule in `PROJECT_PLAN.md` §1/§3/§9 once Phase 2 lands — update those
sections in the same PR.

## 1. Goals

1. **More events reaching users each week** — the metric is *publicly shown*
   events in the 7-day window, not rows ingested.
2. **Community-scale only.** Intimate, independent and community events are
   in (Tate Modern Lates, gallery talks, indie screenings, grassroots
   socials). Mass-market events are out: **any venue with capacity ≥ 300**,
   arena/stadium tours, large club nights.
3. **A free local Hugging Face model does more of the categorisation**, so
   less depends on keyword rules and manual review.
4. **More sources, picked by community** rather than by venue type alone.

### Decisions (agreed 2026-11-25)

| Question | Decision |
|---|---|
| How does the gate widen? | **Both**: a new gate bucket `community-culture` *and* a curated allow-list of community-anchored sources |
| Do access tags (step-free, BSL, relaxed) make an event public? | **No.** Accessibility is a bonus label on an event that already qualifies, never a reason to show it. `ACCESS_ONLY_BUCKETS` behaviour is unchanged. |
| Venues of 300–1,000 capacity? | **Out.** The scale cutoff is 300. |
| Public window | **Unchanged** — one week (the current 8-day horizon in `lib/events-query.ts`). |

## 2. Baseline (live data, 2026-11-25)

| | |
|---|---|
| Ingested per run | ~2,800 events, 95 sources |
| Live in 8-day window | 1,549 |
| **Publicly shown** | **71 (~5%)** |
| Ticketmaster + Skiddle | ~1,400 per run (half the volume), near-zero shown |
| Sources at 0 events | 9 — serpentine (403), dadafest, designMuseum, homeManchester, factLiverpool, sainsburyCentre, ladbrokeHall, nationalMuseumScotland, outsavvy |
| Eventbrite organisers 404ing | Deaf Rave, MENA Arts UK, Brain Injury & Neurodivergence Network |
| `OUTSAVVY_API_TOKEN` | unset — LGBTQ+ ticketing source disabled |

Lates are already ingested but hidden: "LATE at Kettle's Yard" has no tags;
"Soane Late", "GoMA Late", "Wellcome Collection Lates" carry only access-only
tags. The bottleneck is the gate, not discovery.

## 3. Targets (exit criteria for the whole plan)

- **≥ 300 publicly shown events** in the 7-day window on a typical weekday run.
- **< 5% of shown events** from venues with capacity ≥ 300 (spot-checked
  sample of 100).
- **≤ 5 sources** returning zero events per run.
- Identity-bucket precision **≥ 95%** on a moderator-reviewed sample
  (no regression from today's keyword/mission baseline).
- The scheduled workflow stays under its 45-minute timeout.

---

## Phase 1 — Repair (quick wins)

1. Commit the restored `package-lock.json` (CI `npm ci` currently fails on
   missing `@emnapi/*` entries). Only commit lockfile changes that come with
   dependency changes.
2. Health step in `.github/workflows/ingest.yml`: give the install step an
   `id` and run `npm run health` only if install succeeded, so a failed
   install surfaces as one clear error, not `tsx: not found`.
3. ~~Set `OUTSAVVY_API_TOKEN` in repo secrets.~~ Dropped — see status.
4. Replace or remove the 3 dead Eventbrite organiser IDs in
   `lib/sources/eventbrite-organisers.ts` (and their missions in
   `lib/source-missions.ts`).
5. Triage the 9 zero-event sources: fix the parser, or mark retired in
   `docs/SCRAPE_TARGETS.md` with the reason (e.g. Serpentine 403).
6. **Health metric: shown-per-source.** Extend `lib/source-health.ts` /
   `scripts/source-health.ts` to report, per source, `fetched → passed scale
   filter → publicly shown`. "Fetched 800, shown 2" must be as visible as
   "fetched 0".

**Done when:** scheduled run is green; health report shows the yield funnel
per source.

**Status (2026-11-25):**
1. ✅ Lockfile committed (`ebedf8d`).
2. ✅ Health step gated on `steps.install.outcome == 'success'`.
3. ✅ OutSavvy retired instead (decided 2026-11-25: too few events to be
   worth a credential). Adapter, registration, mission entry and workflow
   secret removed; recover `lib/sources/outsavvy.ts` from git history if
   it's ever wanted.
4. ✅ Already retired in `f491f2f`; re-checked — MENA Arts UK has closed,
   Deaf Rave now sells via Tickettailor/host venues (pick up via Rich Mix,
   Phase 4), BINN not found.
5. ✅ Triage of the 9:
   - National Museum Scotland — markup changed; fixed (0 → 25 events, incl.
     "Museum Late: Big Burns Ceilidh"). Now throws on a 0-card parse.
   - Sainsbury Centre — moved to sainsburymuseum.com; parser rewritten (10).
   - Serpentine, FACT, Ladbroke Hall (+ Sainsbury) — 403/405 only from
     GitHub runner IPs; reported as `skipped` in CI via
     `CI_IP_BLOCKED_SOURCES`, still retried each run. They won't ingest from
     CI while the block holds — a self-hosted runner would be the fix if
     they matter.
   - HOME Manchester — bot challenge; already skipped in `f491f2f`.
   - DaDaFest — genuinely no current events (archive only); `empty` is correct.
   - Design Museum — returned 0 in CI but 6 locally with no error; watch the
     next run (likely the same IP filtering, served as a 200).
   - OutSavvy — retired, see 3.
6. ✅ `runYield` stage (`lib/pipeline.ts`) + "Reaching users" section in the
   health report. Gate logic moved to `lib/public-gate.ts`, shared with
   `lib/events-query.ts` so the count can't drift from the site. First
   reading: 1,506 live, **71 shown**; Ticketmaster 471 live / 0 shown,
   Skiddle 388 / 3, Eventbrite 43 / 28.

## Phase 2 — Widen the gate (decision C)

### 2a. Scale filter (`lib/scale.ts`, new)

Deterministic, unit-tested, runs in the pipeline **before** classification so
large events never reach tagging or the review queue.

Output: `scale: 'community' | 'large' | 'unknown'` plus the reasons, stored on
the event (new column, migration `00xx_event_scale.sql`).

Signals, strongest first:
1. **Known capacity** — a `venues.capacity` column (new). Seeded from a
   hand-maintained list of large UK venues (arenas, O2/Academy chain,
   major theatres and concert halls) and from API data where available.
   `capacity >= 300` → `large`.
2. **Source-supplied signals** — Ticketmaster venue/segment/promoter data,
   Skiddle venue type; arena/stadium in venue name.
3. **Copy signals** — "UK tour", "+ special guests", "arena", headline/
   support billing, price ceiling well above typical community pricing.
4. Curated community sources (2c) default to `community`, but a known
   capacity ≥ 300 still wins (e.g. a large hall hired at a community venue).

`unknown` is treated as **community** for gating, but logged so the health
report shows how much is unclassified — that feeds the model work in Phase 3.

### 2b. Narrow the big APIs at the query

Change the Ticketmaster and Skiddle adapters to stop pulling mass-market
inventory at source (genre/segment/keyword/venue filters, exclude known large
venue IDs). Goal: fewer rows fetched, higher proportion shown. Measure before
and after with the Phase 1 funnel.

### 2c. Community-anchored source allow-list

Extend `lib/source-missions.ts` with a second kind of entry: a curated source
(scraper source key or Eventbrite organiser ID) whose events qualify for
`community-culture` by default. Same curation rules as missions: recorded
`basis`, no entries on a hunch. Candidates: small galleries, community arts
centres, indie cinemas, radical bookshops (see Phase 4) and existing small
sources (Gasworks, 198, Hope93, Cubitt, Spike Island, Street Level…).

Large institutions (Tate, Barbican, V&A, National Gallery) are **not**
allow-listed wholesale — their individual events qualify via 2d.

### 2d. New gate-qualifying bucket `community-culture`

- Add to `lib/buckets.ts` (gate-qualifying, not access-only) with a migration
  inserting the bucket row.
- Assigned by: the allow-list (2c), keyword rules for clear formats
  ("Late", "Lates", "Up Late", "late opening", "artist talk", "in
  conversation", "community screening", "zine fair", "open studio",
  "reading group", "book launch"), and the model (Phase 3).
- Only ever applied to events with `scale != 'large'`.
- Identity buckets remain separate labels on top; access tags remain bonus
  labels and never qualify an event alone.

### 2e. UI and docs

- Filter sidebar: `community-culture` shown as a general "Culture & Lates"
  option alongside the community buckets.
- Update `PROJECT_PLAN.md` §1/§3/§9 so the gate is described as "community-
  scale and (community-anchored or bucket-matched)".

**Done when:** Kettle's Yard / Soane / GoMA / Wellcome / Tate Lates appear
publicly; arena/tour events do not; shown count is measured against the
baseline.

## Phase 3 — Local model does more

Builds on the existing CPU pipeline (`scripts/semantic-classify.ts`,
`lib/semantic.ts`, `Xenova/bge-small-en-v1.5`, embedding cache in `.cache/`).
All models run locally via `@huggingface/transformers`, no paid API.

### 3a. Low-risk tasks — model may auto-apply

Mis-labelling these harms nothing about identity, so they can be written
directly (`assigned_by: 'model'`):
- **Format**: late / talk / screening / workshop / social / club night /
  exhibition / performance / market — fills `category` where keywords miss.
- **Scale** for `unknown` events from 2a.
- **`community-culture`** for community-scale events from non-allow-listed
  sources.

Approach: embedding prototypes + kNN on the existing model first (cheap,
already cached); add a zero-shot NLI model only where accuracy falls short.

### 3b. Identity buckets — evidence-gated

Add a small zero-shot NLI model (candidate: an ONNX DeBERTa-v3 zero-shot
checkpoint from the Hub, loaded via transformers.js — pick by size/latency
benchmark on the CI runner).

- The model must return an **evidence span** that appears verbatim in the
  event's own title/description.
- Evidence verified + confidence over threshold → auto-applied
  (`assigned_by: 'model-evidence'`), visible as a distinct method in
  `/admin/review`.
- No verified evidence → stays a review-queue suggestion (today's
  behaviour, 0.6–0.75).
- Organiser name alone is never evidence (PROJECT_PLAN §9).
- Moderator `rejected` / `moderator` rows are never overwritten (existing
  insert-only rule).

### 3c. Evaluation before switch-on

- Offline eval script against existing keyword, mission and moderator labels
  (`scripts/_labelled-events.ts`): precision/recall per bucket and per format.
- A bucket is only enabled for auto-apply once precision ≥ 95% on a held-out
  set; thresholds live in code with the eval numbers in comments.
- Budget: model download + inference must keep the scheduled job within
  timeout (model cached in `.cache/models`).

**Done when:** eval report committed; auto-apply on for formats/scale/
`community-culture`; identity auto-apply on only for buckets that pass.

## Phase 4 — New sources

Each candidate: check `robots.txt` (named AI-bot blocks = skip, as with
Chapter, NPG, NHM), check terms, check for an API/feed first, add to
`docs/SCRAPE_TARGETS.md` with its result. Already-blocked targets (British
Museum, Science Museum, Chapter Arts Centre) are not retried.

**Priority order** — yield of community-scale events per hour of work:

1. **Platforms (many organisers per adapter)**
   - TicketSource API — small venues and community events.
   - More Eventbrite organisers (community-led, verified mission) and more
     bio-link seeds.
   - Resident Advisor / DICE — only if current terms allow; otherwise skip.
2. **Lates at sources we already have** — make sure Tate, Barbican,
   Horniman, Kettle's Yard, V&A South Kensington (Friday Late) scrapers catch
   their Lates programmes, not just exhibitions. Museum of London Docklands
   as a new candidate.
3. **Independent cinemas** — Rio, Genesis, Cinema Museum, Deptford Cinema
   (London); Hyde Park Picture House (Leeds); Star & Shadow (Newcastle);
   Cube (Bristol); Watershed (Bristol); CCA (Glasgow).
4. **Community arts centres** — Rich Mix, The Albany, Arcola, Contact
   (Manchester), Tramway (Glasgow).
5. **Radical / community bookshops & archives** (talks, launches) — New
   Beacon Books, Gay's the Word, Housmans, Round Table Books, Bishopsgate
   Institute, MayDay Rooms.
6. **Community-specific organisations**
   - ESEA: Kakilang, Chinese Arts Now, Centre for Chinese Contemporary Art
   - South Asian: Sampad, Kala Sangam, South Asian Arts-uk, Darbar
   - Disability & Deaf: Graeae, Deafinitely Theatre, Corali, Unlimited
   - Latinx: Latin American House
   - Sober: Club Soda

Every new source is classified as allow-listed (2c) or not when added, with
its `basis` recorded.

**Done when:** ≥ 20 new sources live, each with non-zero shown events in the
health report or a documented reason.

## Phase 5 — Measure and tune

- Health report trend over 2 weeks: shown count, shown-per-source, scale
  `unknown` share, review queue size.
- Sample 100 shown events by hand for large-scale leaks and mis-tags; tune
  the scale list and thresholds.
- Prune sources whose shown yield stays at zero for 2+ weeks.

---

## Order and dependencies

```
Phase 1 ──► Phase 2a/2b ──► 2c/2d/2e ──► Phase 3 ──► Phase 5
                     └──────► Phase 4 (can start once 2c exists) ──┘
```

Phases 1 and 2 alone should move the shown count most (the Lates and other
untagged-but-suitable events already in the DB). Phase 3 cuts manual review;
Phase 4 grows the pool.

## Risks

- **Gate drift** — `fetchQualifyingEvents` is the single source of truth for
  what's public; all gate changes go there and in `isGateQualifyingBucket`,
  never in a view.
- **Scale false negatives** — big events with no capacity data slip through
  as `unknown`. Mitigated by the API-level narrowing (2b), the venue list,
  and the Phase 5 sample.
- **Model mis-tags on identity** — mitigated by evidence-span verification,
  per-bucket precision bar, and permanent moderator decisions.
- **CI runtime** — a second model adds download and inference time; cache
  it and benchmark before enabling.
- **Scraper fragility** — new sources go through the existing source-health
  alerting.
