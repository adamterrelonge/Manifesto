# Manifesto — UK Culture & Events Aggregator

## 1. One-line pitch

A single map/list/card interface that aggregates the UK's events, openings and screenings from mainstream ticketing APIs *and* the independent creators who only post to their Instagram/Linktree — then tags everything against community-relevant buckets (POC, Queer, Black, Latinx, Disability-friendly, Autistic-friendly, etc.) so people can actually find the spaces built for them.

**The app only ever shows events that matched at least one bucket.** Aggregation pulls in everything from a source (generic gigs, mainstream theatre, etc.), but bucket-tagging isn't a filter layered on top of a general listings feed — it's the gate. An event with zero community/accessibility signal in its own copy is discarded from what users see, not just deprioritised. This is what keeps the product "niche events for these communities," not "everything, with some of it labelled."

## 2. Why this exists

Mainstream discovery apps (Eventbrite, Time Out, Google) are dominated by whoever pays for placement or has the ops capacity to list on every platform. The events that matter most to underrepresented communities are frequently:

- Run by small/independent organisers with no budget for Eventbrite Pro
- Announced only via Instagram story / link-in-bio / WhatsApp broadcast
- Missing any structured metadata about who they're for or how accessible they are

This project treats **aggregation + inclusive categorisation** as the core product, not a feature bolted onto a generic listings app. The explicit focus on Blackness is a first-class design constraint, not an afterthought bucket.

## 3. Goals

1. **Coverage** — pull as much of "what's on in the UK" as possible from free/cheap APIs, refreshed on a schedule.
2. **Long tail** — surface independent creator events that never touch a ticketing platform, via link-in-bio scraping.
3. **Normalisation** — merge wildly different source schemas into one clean `Event` model, dedupe cross-posted events.
4. **Inclusive categorisation** — a classification layer that tags events into identity/accessibility buckets, with Blackness as a primary lens, not a checkbox. Bucket-tagging is a gate, not a filter: only bucket-matched events are ever surfaced to users.
5. **Multi-modal discovery** — list, card grid, and map/pin views of the same underlying data.
6. **Personalisation** — accounts, saved locations, favourites, ratings, proximity/interest-based notifications.
7. **Source breadth** — grow past a handful of API-friendly sources into a wide, ongoing pool of venues and institutions (galleries, museums, community spaces, ticketing platforms) via adapters and scrapers, so coverage isn't capped by how many integrations happen to exist yet.
8. **Operational robustness at scale** — every pipeline stage (classification, quality scoring, dedup) must correctly process the *entire* events table as it grows into the thousands of rows, not silently truncate against an unpaginated query's default row cap; the schema also needs a real retention/expiry story for events whose run has ended, rather than unbounded row growth.

## 4. Non-goals (for now)

- Being a ticketing/payments platform (always deep-link out to the source for booking).
- International coverage — UK-only for v1, architecture should not prevent expansion beyond the UK later.
- Uniform density across the country on day one — real-world event volume will skew toward London, Manchester, Birmingham, Bristol, Glasgow, etc. first; treat lower-density regions as organic growth from community submissions and the bio-link scraper, not a launch blocker.
- Building a general-purpose scraper framework — the bio-link scraper only needs to handle a known, curated set of creator profiles + common platforms (Linktree, Beacons, Instagram bio, plain personal sites).

---

## 5. High-level architecture

```
┌──────────────────┐   ┌──────────────────┐   ┌───────────────────────┐
│  Source Adapters │   │ Bio-Link Scraper │   │  Manual/Community     │
│  (Ticketmaster,  │   │ (curated creator │   │  Submissions          │
│  Skiddle, Dice,  │   │  list + crawler) │   │  (form, later app)    │
│  RA, Meetup, ...)│   └────────┬─────────┘   └───────────┬───────────┘
└────────┬─────────┘            │                         │
         │                      │                         │
         └───────────────┬──────┴──────────────┬──────────┘
                          ▼
                 ┌──────────────────┐
                 │  Ingestion Queue │  (normalise → raw_events table)
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │  Normalisation & │  (schema mapping, geocoding,
                 │  Dedup Pipeline  │   date/time parsing, venue match)
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │  AI Enrichment   │  (categorisation buckets,
                 │  Layer           │   summary, accessibility flags,
                 │                  │   confidence scores)
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │  Events Database │  (Postgres + PostGIS for geo)
                 └────────┬─────────┘
                          ▼
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   ┌─────────┐      ┌───────────┐      ┌────────────┐
   │  API /  │      │  Web App  │      │Notification│
   │  tRPC   │◄─────┤ (Next.js) │      │  Service   │
   │  layer  │      │List/Cards/│      │(push/email)│
   └─────────┘      │ Map views │      └────────────┘
                    └───────────┘
```

### Suggested stack (fits the existing Next.js app in this repo)

- **Frontend**: Next.js (App Router) — already scaffolded here — with a map view via MapLibre GL / Mapbox GL JS.
- **Backend**: Next.js Route Handlers or a separate small Node service for scheduled ingestion (cron jobs don't belong in request-response serverless functions).
- **Database**: Postgres + PostGIS (Supabase is a good free-tier fit: auth + Postgres + storage in one).
- **Job scheduling**: Vercel Cron / Supabase Edge Functions / a lightweight queue (BullMQ + Redis) for ingestion + scraping jobs.
- **AI layer**: Claude (or another LLM) called in batch during ingestion — not per-request — to keep cost and latency low. Structured output (JSON mode / tool calls) for bucket tagging.
- **Auth**: Supabase Auth / Clerk / NextAuth — whichever pairs best with the chosen DB.
- **Notifications**: Web Push (free) first; email via Resend; SMS/native push later if it becomes an app.

---

## 6. Data sources

| Source | Type | Notes |
|---|---|---|
| Ticketmaster Discovery API | Free API | Good for larger venues/gigs; generous free tier |
| Skiddle API | Free API | Strong UK-wide indie music + club coverage |
| TicketSource API | Free API | Smaller venues, community events, theatre |
| Meetup API | Paid/limited free | API access has tightened — verify current terms; may need to fall back to scraping public group pages |
| Resident Advisor | No official public API | Historically scraped via GraphQL endpoint used by their own site — fragile, ToS-sensitive, treat as a stretch goal with fallback to manual curation |
| Dice.fm | No official public API | Same caveat as RA — check current ToS before relying on this |
| Link-in-bio scraper | Custom scraper | See §7 |
| Manual/community submissions | Form | Cheap way to fill gaps API coverage will always have |
| Council/local authority open data | Open data (data.gov.uk + individual council portals) | Patchy quality and coverage varies wildly by council, but free and useful for filling regional gaps commercial APIs don't reach — stretch goal, worth a scoping pass per major city |
| University/student union event boards | Scrape/partner | Big source of indie film screenings, workshops, and POC/queer/Latinx society events that never appear anywhere else — high signal-to-noise for this project's target buckets, worth prioritising once the bio-link scraper pattern exists |
| Library/community centre programming | Scrape/partner | Councils and libraries run free workshops and cultural programming that rarely gets listed on ticketing platforms — similar shape to the university source, likely reachable via the same scraping pattern |

**Action item before building each adapter**: re-check current ToS/rate limits for RA and Dice specifically, since both have historically restricted scraping and this can change without notice. Where no public API exists, prefer partnering/asking for a data feed over silent scraping, and always keep a manual-submission fallback so the product doesn't depend entirely on gray-area access.

---

## 7. Link-in-bio scraper

**Purpose**: capture events from small creators/organisers who post exclusively to Instagram/TikTok bio links and never touch a ticketing platform.

**Approach**:
1. Maintain a curated seed list of creator handles/profiles (community-sourced + manually added) rather than crawling all of Instagram — this keeps scope, legal exposure, and noise manageable.
2. For each seed, resolve their bio link (Linktree, Beacons, Koji, Milkshake, or a plain personal site).
3. Scrape the resolved page for event-shaped content (dates, venue names, ticket links) using a mix of structured-data parsing (schema.org/Event JSON-LD where present) and an LLM extraction pass on the raw page text for unstructured cases.
4. Re-crawl on a schedule (e.g. daily) and diff against previously seen content to detect new events.
5. Route everything through the same normalisation/AI pipeline as API sources.

**Constraints to respect**:
- Do not scrape Instagram itself directly (against their ToS and technically brittle) — only the external bio-link landing pages, which are built to be publicly linked out to.
- Respect `robots.txt` and rate-limit aggressively per domain.
- Store provenance (source URL, scrape timestamp) on every event for transparency and takedown requests.
- Give creators a way to claim/edit/remove their listing — this turns a scraping liability into a relationship.

---

## 8. Normalisation model

A minimal `Event` shape everything gets mapped into:

```
Event {
  id
  title
  description
  start_at / end_at
  venue: { name, address, lat, lng, city, region }   // region = borough/district/unitary authority depending on locale
  organiser: { name, source_type, profile_url }
  category: enum (music, gallery, film, food, workshop, market, ...)
  price: { is_free, min, max, currency }
  source: { provider, source_id, source_url, scraped_at }
  buckets: [ Bucket ]         // see §9
  accessibility: { step_free, bsl_interpreted, quiet_space, ... }
  status: draft | published | flagged | expired
  dedup_group_id                // links duplicate listings of the same event
}
```

Dedup strategy: fuzzy-match on (title similarity + venue + date window) across sources; when matched, merge into one canonical event and keep all source links.

---

## 9. AI categorisation layer

**Goal**: not just "is this a gig" but *who is this for, and is it accessible to them*.

**Bucket-tagging is a gate, not a filter.** Events with zero matched buckets are discarded from every user-facing view (list/card/map) — the app deliberately does not show "everything, with some of it labelled." The raw aggregated feed (everything from every source) only exists internally, as input to this classification step.

- **v1 implementation is a free, from-scratch keyword/phrase classifier** (`lib/buckets.ts`), not an LLM — deterministic, zero ongoing cost, and re-runnable anytime. It only matches explicit phrases actually present in an event's own title/description (never infers from an organiser's name), which happens to satisfy the bias safeguard below by construction. A real LLM-based pass (see below) remains a valid future upgrade for nuance the keyword approach can't catch — if added, it should be clearly distinguished from keyword matches (e.g. a distinct `assigned_by` value) so users and moderators can tell which method produced a given tag.
- Longer-term/LLM version: run as a **batch enrichment step** after normalisation, not live per page-load — cheaper, cacheable, and lets you review/correct output before it's public.
- Use structured output (tool-call / JSON schema) so buckets are a controlled vocabulary, not free text: `["black", "poc", "queer", "latinx", "east-mon-asian", "south-asian", "disability-friendly", "autistic-friendly", "deaf-accessible", "womxn-led", "sober-friendly", "grassroots-activism", "low-income-access", "free-entry", ...]` — extendable, but keep it a maintained list rather than letting the model invent new tags per event.
- Each bucket assignment carries a **confidence score** and the **evidence snippet** the model used, so low-confidence tags can be queued for human review instead of silently mis-tagging an event.
- **Bias/accuracy safeguard**: because these are identity categories tied to real communities, treat this as the highest-scrutiny part of the pipeline:
  - Never infer identity from an organiser's name/photo alone — require explicit signal in event copy (e.g. "Black queer social", "wheelchair accessible venue, step-free").
  - Build a review queue where community moderators (starting with yourself) can correct/confirm tags; feed corrections back as few-shot examples to improve future accuracy.
  - Keep an audit log of tag changes.
  - Make mis-tagging cheap to fix: any event's buckets should be editable in one click from an admin view.
- Also generate: a short neutral summary, suggested category, and a spam/quality filter score (to catch scraped junk before it reaches users).

---

## 10. Product surfaces

- **List view** — dense, filterable (date, category, bucket, price, free-text search).
- **Card view** — visual browsing, image-forward, good for discovery/mobile.
- **Map view** — pins clustered by density, colour/icon-coded by bucket or category, filter drawer shared with list/card views so all three stay in sync.
- **Event detail page** — normalised info + always a clear "source" link/attribution + booking CTA out to the origin platform.
- **Accounts**:
  - Set home location / commute radius.
  - Favourite events and venues.
  - Rate/review attended events.
  - Follow specific organisers or buckets (e.g. "notify me about Black-owned gallery openings within 3 miles").
- **Notifications** — push/email when new events match saved filters, with sensible batching (digest, not spam).

---

## 11. Build phases

**Phase 0 — Foundations**
- Postgres schema (events, venues, organisers, buckets, users).
- One API adapter end-to-end (Skiddle or Ticketmaster — best free-tier docs) proving ingest → normalise → store → render as a list.

**Phase 1 — Aggregation core**
- Add remaining API adapters (TicketSource, Meetup, re-verify RA/Dice access).
- Dedup pipeline.
- Card + map views.

**Phase 2 — AI enrichment**
- Batch bucket-tagging pipeline with confidence scores.
- Admin review queue for tag correction.
- Spam/quality filtering.

**Phase 3 — Pipeline hardening & source expansion** — mostly complete
- ✅ Row-cap audit closed: dedup runs as Postgres RPC (`merge_duplicate_venues`, `run_event_dedup` in `supabase/migrations/0002_dedup.sql`/`0003_venue_name_normalization.sql`) operating DB-side, so it was never subject to PostgREST's 1000-row REST cap in the first place; classify, quality scoring, and the new category-inference pass (below) all page through `.range()` in `lib/pipeline.ts`.
- ✅ Retention/expiry shipped: `supabase/migrations/0007_expiry.sql` + `runExpiry()` in `lib/pipeline.ts`, run first in the ingest pipeline so dedup/classify/quality never reprocess events whose run has already ended.
- ✅ DB indexes added (`supabase/migrations/0008_indexes.sql`): `events_end_at_idx` for the expiry scan, `events_status_is_duplicate_start_at_idx` covering the homepage's `status`/`is_duplicate`/`start_at` filter in one index scan.
- ✅ Source adapters grew from 2 (Barbican, Serpentine) to 23 registered sources: Ticketmaster/Skiddle/Eventbrite APIs, the bio-link scraper, and 18 new venue scrapers — Autograph ABP, Queer Britain, Tate, Horniman, ICA, Whitechapel, South London Gallery, Migration Museum, V&A East, Factory International, Africa Centre, 198 Contemporary, October Gallery, Wellcome Collection, Gasworks, Museum of the Home, Arnolfini. Candidate venues are tracked in `docs/SCRAPE_TARGETS.md` — still a long tail left, see the proposed next batch there.
- ✅ **New**: keyword-based *category* (event-type) inference (`lib/categories.ts` → `inferCategory`, run as `runCategoryInference` in the ingest pipeline) backfills `category` (music, film, gallery-exhibition, workshop-talk, market-fair, family-kids, community-social, theatre-performance) on any event a source adapter left uncategorised — same phrase-matching approach as bucket-tagging (§9), not an LLM call.
- Bucket keyword coverage (§9) widened after real ingestion runs surfaced false negatives on the Asian/Black/Latinx buckets: added "african art(ist)", "women/woman of colour", "latin american art(ist)"/"latino/latina art", "east asian art(ist)", "south asian art(ist)"/"desi artist" phrases to `lib/buckets.ts` so exhibition copy describing an artist's background — not just copy explicitly addressed "for Black/Asian/Latinx audiences" — still gates into the right bucket.
- Still open: re-audit the full pipeline against current row counts (1600+ published events and growing) now that the fixes above are live, to confirm none of them silently regress as ingestion keeps scaling.

**Phase 4 — Long tail** ✅ complete (one item needs a credential to fully activate — see below)
- ✅ Link-in-bio scraper built and wired into ingestion (`lib/sources/bio-link.ts`, registered as the `bio-links` source) — parses Linktree/Beacons `__NEXT_DATA__` JSON, falls back to a generic `<a>` link scan for plain sites. The seed list (`lib/sources/bio-link-seeds.ts`) has grown to 7 entries; growing it further is manual curation (verify each bio-link against `robots.txt` before adding — see the file's own header), not scraper engineering.
- ✅ Manual community submission form shipped: public form at `app/submit`, `POST /api/submit` (validates input, runs the same bucket-classification and quality-scoring as ingested events, saves as `status: draft`), and an admin queue at `app/admin/submissions` (`GET`/`POST /api/admin/submissions`) to approve or reject. Gated by a shared `ADMIN_SECRET` bearer token entered into the browser and kept in `sessionStorage` — functional as a moderator tool, but a mockup, not real per-user accounts (see Phase 5 note below).
- ✅ **Organiser claim/edit flow shipped and tested end-to-end against the live database in two passes** (real signed-in test users, real RLS, real `/api/admin/claims` route — not a re-implementation; the second pass specifically re-verified the widened per-event edit fields, hide→unhide, and the new own-events RLS policy after `0011` landed), built on the real Supabase Auth accounts already wired up in `Sidebar.tsx`: a signed-in user submits a claim at `app/claim` (RLS-protected insert into `organiser_claims` — `supabase/migrations/0009_organiser_claims.sql`); an admin reviews it at `app/admin/claims`; approval sets `organisers.claimed_by` to the user's `auth.uid()` and best-effort emails them via Resend (`lib/email.ts` — no-ops with a console warning if `RESEND_API_KEY` isn't set, so approval never fails on missing email config; **set `RESEND_API_KEY` in `.env.local` to actually send**). This unlocks `app/organiser/manage`: self-edit for the organiser's display name/profile URL (`claim_organiser_update`), and full per-event editing — title, description, category, free/price (`claim_organiser_update_event`, widened in `supabase/migrations/0011_organiser_event_edits_v2.sql`) — plus symmetric hide/unhide (`claim_organiser_hide_event`/`claim_organiser_unhide_event`; unhide is safe today because hide is the *only* thing in the codebase that ever sets `status: 'flagged'`, confirmed by grep — revisit if a moderator-flagging feature is ever added, so an organiser can't self-unhide something flagged for cause). Event date/time rescheduling is deliberately not editable here — it interacts with the expiry/dedup pipeline in ways that deserve a dedicated pass, not a quick bolt-on. All RPCs are security-definer, checked against `claimed_by` server-side, same shape as `find_matching_venue`/`merge_duplicate_venues`; a new RLS policy lets a claimed organiser read all of their own events regardless of status (still never another organiser's). `Sidebar.tsx` links to `/submit` and `/claim` always, and to `/organiser/manage` once the signed-in user actually has a claimed organiser. `/admin/*` pages remain deliberately unlinked from nav.

**Phase 5 — Accounts & personalisation**
- Auth, saved location, favourites, ratings.
- Notification preferences + delivery (web push → email → mobile later).
- Note: the admin surfaces built in Phase 4 (bucket review, submissions queue) currently gate on a single shared `ADMIN_SECRET`/`INGEST_SECRET`, not real accounts — that's sufficient for a solo/small-moderator-team admin workflow but this phase still needs proper end-user auth (Supabase Auth per §5's suggested stack) before favourites/saved-location/notifications can exist.

**Phase 6 — Polish & scale**
- Performance pass on map rendering at scale (clustering, tile-based loading).
- City/region pages for SEO (London boroughs, Manchester wards, Glasgow districts, etc.).
- Analytics on which buckets/areas get the most engagement, to prioritise scraper coverage.

---

## 12. Legal / ethical notes to keep front of mind

- Always attribute source and deep-link to the origin for booking — this project aggregates *discovery*, not ticketing.
- Re-verify ToS for RA, Dice, and Meetup before shipping scrapers/adapters for them — these have changed access policies before.
- Give organisers a self-serve way to correct or remove their listing.
- Identity-bucket tagging touches real communities — bias review (§9) isn't optional polish, it's core scope.
- Keep a data-retention/deletion policy for user accounts and location data from day one (easier than retrofitting later).

---

## 13. Ideas to take it further

- **Community moderation / trust network**: let verified community members (not just admins) confirm or dispute bucket tags for events near them — crowdsources the highest-scrutiny part of the pipeline.
- **Report/flag pipeline for mistagging**: a lightweight user-facing "this tag is wrong" flag on any event, feeding the same admin review queue from §9 — beyond internal moderator review, this lets mistagged identity/accessibility buckets get caught fast once there's real traffic, rather than waiting for a moderator to stumble on it.
- **"Vibe" search**: natural-language query ("chill queer poetry night this weekend near Peckham") mapped to structured filters via LLM, instead of requiring users to manually build filter combinations — pairs well with the existing AI enrichment layer since it's reasoning over the same bucket/category/location fields.
- **Calendar sync (ICS feed)**: a per-saved-filter ICS feed URL users can subscribe to from Google/Apple/Outlook Calendar — low build effort on top of the existing filter/notification system, and turns a one-off visit into an always-current calendar subscription.
- **"Cultural calendar" digests**: auto-generated weekly digest per bucket and city ("This week in Black London", "This week in Queer Manchester") shareable as an image/story — doubles as organic distribution for the creators being featured.
- **Organiser dashboard**: let organisers claim a profile, see their own event's reach, and push updates directly — turns scraped subjects into active contributors and reduces scraper fragility over time.
- **Accessibility detail, not just a flag**: structured accessibility info (step count, quiet room, BSL, sensory notes) sourced via a short organiser questionnaire, not inferred — more useful than a binary tag.
- **Route/transport overlay on the map**: TfL API overlay showing step-free tube access to a venue, night bus coverage for late events (and equivalent regional transport data outside London).
- **"Similar organisers" graph**: once you have enough tagged events, recommend organisers/venues, not just events — helps users build an ongoing relationship with spaces, not just one-off attendance.
- **International expansion hooks**: keep country-level assumptions (currency, address format, admin-region taxonomy) isolated behind a `country` config so a future Ireland/wider-Europe chapter is a config change, not a rewrite.
- **Open data export**: a public read-only API/CSV of the aggregated (non-scraped-personal) event data — good for community orgs building their own tools, and good will.
- **Offline-friendly PWA**: many users at grassroots events are in venues with poor signal — cache today's favourited/nearby events for offline viewing.
- **Verified-safe-space badge**: beyond identity buckets, a lightweight incident-reporting/verification flow so users can flag whether a space actually lived up to its "safe space" claim — high trust value, needs careful moderation design.
