# Scrape Targets

A running candidate list of venues/institutions to build source adapters for,
per `docs/PROJECT_PLAN.md` Phase 3 ("keep adding source adapters beyond the
current handful, prioritising venues/institutions already scoped as
scrapable"). Organised by category — currently just Museums & Galleries, but
other venue types (theatres, music venues, libraries) can get their own
section here later.

**This is a hand-curated seed list, not an exhaustive registry.** For
programmatic expansion later, the two authoritative sources are the [Arts
Council England Accreditation Scheme](https://www.artscouncil.org.uk/supporting-museums/accreditation-scheme)
(~1,800 accredited UK museums) and the [Museums Association](https://www.museumsassociation.org/)
directory. This list deliberately trades completeness for a shortlist worth
actually building against.

## How to use this list

Before spending time building selectors for any entry below:

1. **Check `robots.txt`** for the domain — look for a blanket `Disallow`, a
   `Crawl-delay`, or named blocks of `ClaudeBot`/`GPTBot`/etc (a strong
   signal the operator has thought about bot access at all).
2. **Do a live fetch check from Node, not just curl.** `lib/sources/royal-academy.ts`
   was built, tested, and discarded in one session because the Royal
   Academy's Cloudflare Managed Challenge returns a clean `200` to curl but
   a `403` to Node's `fetch` (the runtime Vercel serverless functions
   actually use) — curl alone would have given a false pass. Confirm with
   something like:
   ```
   node -e "fetch('https://example.org/whats-on').then(r => console.log(r.status))"
   ```
3. **Look for a listing page, not just a homepage** — ideally one with
   pagination or filters that return a flat, complete result set (the
   Barbican's `?page=N` and Serpentine's `?type=X` pattern), rather than a
   curated homepage carousel that only ever shows a handful of items.
4. **Check for structured dates** on detail pages (a `datetime` attribute,
   JSON-LD `Event` schema) before resorting to free-text date parsing —
   Barbican and Serpentine both had one; the Royal Academy had neither,
   which was its own smaller warning sign before the Cloudflare block ended
   up mooting it anyway.

## Status

| Name | Status |
|---|---|
| Barbican Centre | ✅ Implemented (`lib/sources/barbican.ts`) |
| Serpentine Galleries | ✅ Implemented (`lib/sources/serpentine.ts`) |
| Royal Academy of Arts | ❌ Attempted, blocked by Cloudflare Managed Challenge — see `lib/sources/royal-academy.ts`'s removal in git history |
| Autograph ABP | ✅ Implemented (`lib/sources/autograph.ts`) |
| 198 Contemporary Arts and Learning | ✅ Implemented (`lib/sources/gallery-198.ts`) |
| Queer Britain | ✅ Implemented (`lib/sources/queer-britain.ts`) |
| Gasworks | ✅ Implemented (`lib/sources/gasworks.ts`) |
| Whitechapel Gallery | ✅ Implemented (`lib/sources/whitechapel.ts`) |
| ICA | ✅ Implemented (`lib/sources/ica.ts`) |
| Wellcome Collection | ✅ Implemented (`lib/sources/wellcome.ts`) |
| South London Gallery | ✅ Implemented (`lib/sources/south-london-gallery.ts`) |
| Migration Museum | ✅ Implemented (`lib/sources/migration-museum.ts`) |
| Horniman Museum | ✅ Implemented (`lib/sources/horniman.ts`) |
| V&A East | ✅ Implemented (`lib/sources/vam-east.ts`) |
| Tate (Modern/Britain/Liverpool/St Ives) | ✅ Implemented (`lib/sources/tate.ts`) |
| Museum of the Home | ✅ Implemented (`lib/sources/museum-of-home.ts`) |
| Arnolfini | ✅ Implemented (`lib/sources/arnolfini.ts`) |
| Africa Centre | ✅ Implemented (`lib/sources/africa-centre.ts`) — not previously tracked in this list; London, pan-African community/cultural programming |
| Factory International | ✅ Implemented (`lib/sources/factory-international.ts`) — not previously tracked in this list; Manchester, Aviva Studios |
| October Gallery | ✅ Implemented (`lib/sources/october-gallery.ts`) — not previously tracked in this list; London (Bloomsbury), African/Asian/Latin American/Islamic art |
| DaDaFest | ✅ Implemented (`lib/sources/dadafest.ts`) — Liverpool; year-round "Events Programme" listing (distinct from the biennial festival itself) has schema.org `Event` markup, if often thin between festival editions |
| New Art Exchange | ✅ Implemented (`lib/sources/new-art-exchange.ts`) — Nottingham; JSON-LD event array with pagination, no HTML scraping needed |
| Attenborough Arts Centre | ✅ Implemented (`lib/sources/attenborough-arts.ts`) — Leicester; first-party "The Events Calendar" JSON REST API, no scraping needed |
| Cartwright Hall Art Gallery | ✅ Implemented (`lib/sources/cartwright-hall.ts`) — Bradford; venue-filtered listing page + detail-page fetch for exhibition date ranges |
| Shape Arts | ✅ Implemented (`lib/sources/shape-arts.ts`) — London/nationwide; schema.org `Event` microdata, per-event venue text (no single fixed venue) |
| Doyle Wham | ❌ Attempted, blocked — `/exhibitions` is a Squarespace blog with only post-publish dates, no real exhibition run dates or JSON-LD `Event` data anywhere on the site |
| CasildART | ❌ Attempted, blocked — hand-authored Elementor page with inconsistent/freeform dates (mixes real dates, open-call deadlines, "TBD" placeholders, bundled multi-event paragraphs), no structured data |
| International Slavery Museum | ❌ Attempted, blocked — venue closed for redevelopment since 2025, not expected to reopen until ~2029; zero current/upcoming events in NML's own CMS. (Side-finding: National Museums Liverpool runs a headless Drupal JSON:API behind their Next.js site — reusable if another NML venue, e.g. Walker Art Gallery/World Museum/Museum of Liverpool/Lady Lever, gets scoped later, once one of them has live programming.) |
| Black Cultural Archives | ❌ Attempted, blocked — Windsor Square building closed for renovation since Feb 2025 with no confirmed reopening date; the site's own `/events` listing has zero forward-scheduled events |
| British Museum | ❌ Attempted, blocked — Cloudflare Managed Challenge returns `403` to Node's `fetch` (same failure mode as Royal Academy) on every path tested; `robots.txt` also explicitly disallows the live `/exhibitions-events/*` section regardless |
| National Gallery | ✅ Implemented (`lib/sources/national-gallery.ts`) — `/whats-on` is a single unpaginated page mixing exhibition cards (`.exhibition-date`, "Until X") and event/tour cards (`.date`, either a real date or unparseable recurring text like "Saturdays (excluding public holidays)") |
| National Portrait Gallery | ❌ Not attempted — `robots.txt` explicitly disallows `ClaudeBot`/`GPTBot`/etc. via a Cloudflare-managed bot-policy block; skipping on the operator's stated signal rather than testing for a technical bypass |
| Design Museum | ✅ Implemented (`lib/sources/design-museum.ts`) — not previously tracked in this list; London (Kensington). `/whats-on` is just a nav hub, the real programme is at `/calendar`; card dates are opening hours not exhibition dates, so each event needs a detail-page fetch for the real range (`time.date.icon-date`) |
| Natural History Museum | ❌ Not attempted — same explicit `ClaudeBot`/`GPTBot` robots.txt block as NPG, plus `robots.txt` separately disallows crawling `/visit/whats-on/programs/*` specifically |
| Somerset House | ❌ Attempted, blocked — `/whats-on` is a bare client-rendered SPA shell (React/react-helmet), no server-rendered event content in the raw HTML; would need a headless browser or an internal API to be found |
| Sir John Soane's Museum | ✅ Implemented (`lib/sources/soane.ts`) — paginated `/whats-on` (`?page=N`), each card has two `<time datetime>` ISO timestamps directly, no detail-page fetch needed |
| The Photographers' Gallery | ✅ Implemented (`lib/sources/photographers-gallery.ts`) — paginated `/whats-on` (`?page=N`); dates are free text on most cards (`<time datetime>` only present on a minority), so always parsed from the `.o-teaser__date` paragraph text for one consistent path |
| Science Museum | ❌ Attempted, blocked — `/see-and-do` is a marketing "Highlights" carousel (permanent galleries + retail promos), not an exhibitions/events listing; only 1 of ~10 `.c-card` items has a real date, the rest are "Open daily, HH:MM" opening hours. No dedicated whats-on/exhibitions aggregator page found (`/whats-on` is `404`). |
| IWM London | ❌ Attempted, blocked — `/visits/iwm-london/whats-on`'s event section is `<div id="events-listing">`, rendered client-side by a JS component (`data-component-id="iwm_theme:event_teaser_list"`); zero events in the raw server-rendered HTML |
| Royal Museums Greenwich | ❌ Attempted, blocked — `/whats-on`'s `<div id="events-search-results">` is empty in the raw HTML, populated by a client-side JS app (`id="root"` present); same client-rendered pattern as Somerset House |
| The Whitworth (Manchester) | ❌ Attempted, blocked — `/whats-on` has no server-rendered card/teaser/listing markup at all despite the `200` and 19 raw `<a>` links picked up in the initial pass; content is client-rendered |
| BALTIC (Gateshead) | ❌ Attempted, blocked — `/whats-on` (~1MB page) has no server-rendered card/event markup anywhere in the raw HTML; heavily client-rendered SPA, same pattern as Somerset House |
| Hayward Gallery (Southbank Centre) | ❌ Attempted, blocked — robots.txt itself is permissive, but `/whats-on` returns `403` to Node's `fetch` (same Cloudflare/WAF false-pass pattern as Royal Academy: looks fine to WebFetch/curl, blocked for the runtime Vercel actually uses) |
| Dulwich Picture Gallery | ❌ Attempted, blocked — robots.txt permissive (`Disallow: /admin/*` only), but `/exhibitions` returns `403` to Node's `fetch`, same Cloudflare/WAF pattern |
| Wallace Collection | ❌ Not attempted — robots.txt explicitly blocks `ClaudeBot`/`GPTBot`/`CCBot`/`Amazonbot`/`Applebot-Extended`/`Bytespider`/`Google-Extended`/`meta-externalagent`/`CloudflareBrowserRenderingCrawler` with `Disallow: /`; skipping per the operator's stated signal, same policy as NPG/NHM |
| Ibraaz | ✅ Implemented (`lib/sources/ibraaz.ts`) — not previously tracked in this list; London (Fitzrovia), arts/culture space. Nuxt SSR `/whats-on` — cards carry an authoritative ISO `<time datetime>` start plus free-text for the end date; detail-page fetch for the description and for `isFree` (inferred from presence/absence of the Ticket Tailor `.tt-widget` booking widget, since price itself is never in the static HTML) |
| National Museum of Scotland | ✅ Implemented (`lib/sources/national-museum-scotland.ts`) — Edinburgh, National Museums Scotland (separate org from the already-blocked National Galleries of Scotland). `/whats-on` (paginated) cards carry real `itemprop=startDate/endDate` ISO `<time>` pairs, but only exhibitions and a handful of one-off events get them — the rest are recurring tours/family sessions with free text only ("Wed 26 Aug and Fri 18 Sept, 09:45 - 10:30") and no single reliable start, skipped rather than mis-parsed; 6 events ingest cleanly |
| Birmingham Museum & Art Gallery | ✅ Implemented (`lib/sources/birmingham-museum.ts`) — shares the same "c-media" component template as National Museum of Scotland (coincidental shared vendor, not the same site) but with a messier DOM: about a third of cards are a real `<a class="c-media">`, the rest are `<div class="c-media" @click="goToUrl(...)">` (a Vue directive, not a usable href) needing the "Details" button's own `<a>` as a fallback; title also needs a `.h-accessibility` screen-reader span stripped out. Same "only cards with real `itemprop=startDate` ingest" rule as NMS — 9 events |
| Herbert Art Gallery & Museum | ✅ Implemented (`lib/sources/herbert-coventry.ts`) — Coventry. `/whats-on/` cards have a consistent free-text date range (`p.module_listing_metadata`, "20 February 2023 – 19 February 2027") and category tags (`ul.module_listing_categories`); 13 events on one unpaginated fetch |
| Leeds Art Gallery | ✅ Implemented (`lib/sources/leeds-art-gallery.ts`) — the real listing is `/exhibitions-at-leeds-art-gallery-4663`, not the nav-hub `/whats-on-at-leeds-art-gallery-*` page; each card's date/venue/description is one pipe-delimited text block ("22 May 2026 – 4 October 2026 \| Leeds Art Gallery \| desc"), and every card renders twice in the raw HTML (carousel + full grid), deduped by slug — 6 events. Henry Moore Institute likely shares the same Leeds Museums & Galleries platform, worth a quick follow-up |
| Kelvingrove Art Gallery and Museum | ✅ Implemented (`lib/sources/kelvingrove.ts`) — Glasgow, via Glasgow Life's `whats-on?venue=X` filtered listing (the same URL pattern likely covers GoMA/Burrell Collection/Riverside Museum too, once built). Free-text dates in two shapes — a one-off run ("Sat 13 Jun–Sun 18 Oct 2026") and a recurring-series window ("Every week on Saturday from 29th Nov 2025 until 19th Dec 2026", ordinal suffixes stripped before parsing) — 6 events |
| The New Art Gallery Walsall | ✅ Implemented (`lib/sources/new-art-gallery-walsall.ts`) — Walsall. `/whats-on/` mixes exhibitions and events in one grid of `.exitem` cards; the `.strand` category marker sometimes sits inside the card and sometimes as a preceding sibling, so the outer `.exitem` wrapper is used as the card root. Free-text dates come in three shapes — a normal range ("1 May – 13 September 2026"), a single drop-in day with a 24-hour time range and no year ("Thursday 6 August 11:00 – 15:00", parsed directly rather than through scrape-utils' am/pm-guessing `parseTime` since a bare "11:00" would otherwise get pushed into the evening), and pure recurring text with no date at all ("Sundays throughout the year") which is skipped — 17 of 19 cards ingest |
| Outsavvy | ✅ Implemented (`lib/sources/outsavvy.ts`) — nationwide ticketing platform, not a single venue. Has a genuine documented partner API (`partners.outsavvy.com/developer`) with a location-based `GET /events/search` (lat/lng/range/date range), the same shape as the Skiddle adapter — self-serve `OUTSAVVY_API_TOKEN` from a free partner account, `Authorization: Partner <token>` header, 5,000 calls/24h. Field names are reverse-engineered from the public docs only (no live token used to confirm a real payload) — verify against the `[outsavvy]` debug log on first real run. Each event's own `dates[]` array is flattened to one row per active showing, same as Skiddle/Ticketmaster/Eventbrite; no `region` field exists on the source (only town/postcode) so region is left `null` rather than reintroducing the city-as-region bug the region cleanup pass fixed |
| Dice.fm | ❌ Not attempted — `robots.txt` explicitly blocks `ClaudeBot`/`GPTBot`/`CCBot`/`Amazonbot`/`Bytespider`/`Google-Extended`/`meta-externalagent`/`CloudflareBrowserRenderingCrawler` with `Disallow: /`, same policy-block signal as NPG/Wallace Collection/Turner Contemporary — skipping per the operator's stated signal. Also has no usable API regardless: Dice's only public API (`partners-endpoint.dice.fm/graphql`, GraphQL) is a "Ticket Holders" API for an organiser to query their *own* post-sale ticket buyers, not a discovery/search endpoint for other people's events |
| Luma (lu.ma / luma.com) | ❌ Attempted, blocked — `robots.txt` itself is permissive (only `Disallow: */profile/*`), but the official API (`public-api.luma.com`) only manages calendars/events the key owner already controls (one key per calendar) and requires a paid Luma Plus subscription ($59/mo), with no location/city discovery endpoint. Public calendar pages (`luma.com/calendar/cal-*`) render their event list client-side — raw HTML has no event data, same empty-SPA-shell pattern that blocked Somerset House/IWM London/Royal Museums Greenwich. Third-party scrapers (Apify actors, "unofficial" wrapper APIs) exist but they're reverse-engineering Luma's own undocumented internal endpoints — not worth building against |
| Bluecoat | ✅ Implemented (`lib/sources/bluecoat.ts`) — Liverpool. `/whats-on` is a server-rendered `js-paginated-grid` of event cards; free-text date ranges in an `<h3>` parsed via `parseDMY`/`applyTime`, no `<time>`/JSON-LD. 9 events ingest cleanly |
| ONCA Gallery | ❌ Attempted, blocked — Brighton. `robots.txt` permissive, but the org has permanently wound down: `/whats-on/` and `/events/` both `404`, site nav links to `/after-o-n-c-a/` and `/final-words/`. No forward-scheduled events exist anywhere on the site |
| Chapter Arts Centre | ❌ Attempted, blocked — Cardiff. `robots.txt` explicitly disallows `ClaudeBot`/`GPTBot`/`CCBot`/`Amazonbot`/`Bytespider`/`Google-Extended`/`Applebot-Extended`/`meta-externalagent`/`CloudflareBrowserRenderingCrawler`; same policy-block pattern as NPG/Wallace Collection/Dice.fm |
| Golden Thread Gallery | ✅ Implemented (`lib/sources/golden-thread-gallery.ts`) — Belfast. First-party JSON REST API (`/wp-json/tribe/events/v1/events`, The Events Calendar plugin), same pattern as `lib/sources/attenborough-arts.ts`. The API's `venue`/`cost` fields are unconfigured template placeholders (a "Brazil" dummy venue, an identical "£99 ISO" cost on every event) — never trusted; a fixed `VENUE` const and conservative pricing defaults are used instead. 6 events ingest cleanly |
| Void Gallery | ❌ Attempted, blocked — Derry/Londonderry. `robots.txt` permissive and `/whats-on` etc. return `200`, but the page has zero server-rendered event cards — an Elementor widget renders the listing client-side, and no public REST route exists for the site's `lif_event` post type either (`/wp-json/wp/v2/lif_event` → `404`). Same "structured data exists in the CMS but not in the raw HTML" pattern as Camden Art Centre/Somerset House |
| Street Level Photoworks | ✅ Implemented (`lib/sources/street-level-photoworks.ts`) — Glasgow. `/whats-on` has real `<time datetime>` ISO start/end pairs per card. The page's own "Load More" pagination posts to `/js/xhr/paginator.php`, which `robots.txt` disallows, so only the first server-rendered page (5 cards) is read; 2 of those are "off-site-exhibition" cards with no address given and are skipped rather than mis-tagged with the venue's own coordinates — 3 events ingest cleanly |
| Ffotogallery | ❌ Attempted, blocked — Cardiff/Penarth. Squarespace `robots.txt` explicitly disallows `ClaudeBot`/`GPTBot`/`CCBot`/`Amazonbot`/`Bytespider`/`Google-Extended`/`Meta-ExternalAgent`/`anthropic-ai`/`cohere-ai` and more; skipped per the operator's stated signal |
| Fruitmarket Gallery | ✅ Implemented (`lib/sources/fruitmarket-gallery.ts`) — Edinburgh. Same first-party JSON REST API pattern as Attenborough Arts/Golden Thread Gallery (`/wp-json/tribe/events/v1/events`) — confirmed it's the same data the `/exhibitions/` page renders as cards, so no HTML scraping needed. 13 events ingest cleanly |
| Spike Island | ✅ Implemented (`lib/sources/spike-island.ts`) — Bristol. The real flat listings are `/programme/exhibitions/` and `/programme/events/` (the plain `/programme/` page is just a 2-item curated teaser); free-text date ranges (`.card__date-range`) parsed via `parseDMY` with a shared-year fallback to correctly handle cross-year ranges. 9 events ingest cleanly |
| MIMA (Middlesbrough Institute of Modern Art) | ❌ Attempted, blocked — Middlesbrough. `robots.txt` permissive and both `/whats-on/` and `/exhibitions/` return `200`, but both are an empty `<div id="app">` hydrated by a bundled Vue app — zero server-rendered event content, same pattern as Somerset House/IWM London/Camden Art Centre. A `tees.ac.uk`-hosted mirror page turned up in search but wasn't checked; may use a different, server-rendered CMS — worth a look if revisited |
| Gallery of Modern Art (GoMA) | ✅ Implemented (`lib/sources/goma.ts`) — Glasgow. Same Glasgow Life `whats-on?venue=X` pattern as `lib/sources/kelvingrove.ts`. 6/6 events ingest cleanly |
| The Burrell Collection | ✅ Implemented (`lib/sources/burrell-collection.ts`) — Glasgow. Same Glasgow Life pattern, needs the "The" prefix in the venue filter. 12/12 events ingest cleanly, including "LGBTQ+ Tours" and "Autism-Friendly Family Workshop" |
| Riverside Museum | ✅ Implemented (`lib/sources/riverside-museum.ts`) — Glasgow. Same Glasgow Life pattern. 4/4 events ingest cleanly, including an "Autism Friendly Adult Workshop" |
| Walker Art Gallery | ❌ Attempted, blocked — Liverpool, National Museums Liverpool. `robots.txt` permissive, homepage loads fine, but both the JSON:API (`/jsonapi/node/event`) and the venue's own `/walker-art-gallery/whats-on` HTML listing hang and time out (>40s) — reproduced consistently, not the transient `504` seen previously. Shares this broken backend with World Museum/Museum of Liverpool/Lady Lever |
| World Museum | ❌ Attempted, blocked — Liverpool, National Museums Liverpool. Same broken NML backend as Walker Art Gallery — `/world-museum/whats-on` also times out (>40s) |
| Museum of Liverpool | ❌ Attempted, blocked — National Museums Liverpool. Same broken backend — `/jsonapi/node/event` re-confirmed `504`, `/events` and `/museum-of-liverpool/whats-on` both hang. Infra flakiness on NML's end, not a bot block, but nothing usable right now |
| Lady Lever Art Gallery | ❌ Attempted, blocked — Port Sunlight, Wirral, National Museums Liverpool. Same broken NML backend as the other three NML venues above |
| Henry Moore Institute | ✅ Implemented (`lib/sources/henry-moore-institute.ts`) — Leeds. **Correction to this doc's earlier speculation**: not the Leeds Museums & Galleries platform — it's the Henry Moore Foundation's own site (`henry-moore.org`). Category read off the card's own class name. One co-programmed event physically at "Leeds Art Gallery" is skipped (no address given) rather than mis-tagged — same pattern as `street-level-photoworks.ts`. 7/9 on-site events ingest cleanly |
| Royal Armouries | ❌ Attempted, blocked — Leeds. Not a technical block (`robots.txt` permissive, just `Crawl-delay: 20`; Node fetch → `200`) — there's simply no scrapable content. `/whats-on` and `/leeds/whats-on` are bare search-filter shells with zero server-rendered cards; only a permanent recurring programme and a static online exhibition exist, no calendar of dated temporary exhibitions at all |
| Site Gallery | ❌ Attempted, blocked — Sheffield. Cloudflare-managed `robots.txt` explicitly disallows `ClaudeBot`/`GPTBot`/`CCBot`/`Amazonbot`/`Bytespider`/`Google-Extended`/`Applebot-Extended`/`meta-externalagent`/`CloudflareBrowserRenderingCrawler`; skipped per the operator's stated signal |
| mac Birmingham | ✅ Implemented (`lib/sources/mac-birmingham.ts`) — Birmingham (Midlands Arts Centre). Real ISO `<time datetime>` attrs with `itemprop="startDate"/"endDate"`, no free-text parsing. 10/10 events ingest cleanly |
| Fabrica | ✅ Implemented (`lib/sources/fabrica.ts`) — Brighton. Real URL is `/whats-on/exhibitions`. Free-text date range parsing. 3/3 events ingest cleanly |
| Hunterian Museum & Art Gallery | ✅ Implemented (`lib/sources/hunterian.ts`) — Glasgow (University of Glasgow). T4 CMS cards already filtered to Hunterian; date parsed from the embedded "Date:" line (with year), not the separate day/month-only teaser. 13/13 events ingest cleanly |
| Talbot Rice Gallery | ✅ Implemented (`lib/sources/talbot-rice-gallery.ts`) — Edinburgh (University of Edinburgh). Two DOM shapes handled: regular `.card` events (no-year dates via `parseDMY`'s `inferYear` fallback) and a structurally separate `.featured-card` exhibition block. 6/6 events ingest cleanly, including the mission-relevant "Sensory Friendly Morning" |
| Dundee Contemporary Arts (DCA) | ✅ Implemented (`lib/sources/dca.ts`) — Dundee. `/whats-on` redirects to the homepage, the real listing. Found and fixed a real bug during build: the homepage's "News and stories" section shares the exact same card markup as real events, so it was initially pulling in bogus "events" from news posts — fixed by filtering to `events/`-path slugs only. 3/3 real events ingest cleanly |
| V&A Dundee | ✅ Implemented (`lib/sources/vam-dundee.ts`) — Dundee. Extracts event data from a Next.js App Router RSC flight stream (`<script>self.__next_f.push([1,"..."])</script>` chunks) — turned out more tractable than expected, each chunk's payload is plain nested JSON, no custom RSC deserializer needed. **Flagged as higher-risk than every other adapter here**: depends on Next.js's internal wire format staying stable on V&A's site, not a public contract — a version bump or CMS field rename would likely cause a silent zero-events result rather than a clean fetch error, so this one needs occasional smoke-testing rather than being trusted to fail loudly. 26/26 forward-looking events ingest cleanly, including a "Design and Disability" exhibition |
| Sainsbury Centre | ✅ Implemented (`lib/sources/sainsbury-centre.ts`) — Norwich (UEA). 5 of 11 cards are permanent-installation blurbs with no date and are correctly skipped. 6/11 events ingest cleanly |
| Kettle's Yard | ✅ Implemented (`lib/sources/kettles-yard.ts`) — Cambridge (University of Cambridge). Its `datetime` HTML attribute is free text, not ISO, so the text content is parsed instead. 12/12 events ingest cleanly |
| Firstsite | ✅ Implemented (`lib/sources/firstsite.ts`) — Colchester. Best find of this round: `data-start-date`/`data-end-date` (YYYYMMDD) directly on each card, no free-text date parsing needed at all. 103 events ingest (includes long-running items back to 2023, left for downstream quality/expiry scoring same as every other adapter) |
| National Museum Cardiff | ✅ Implemented (`lib/sources/national-museum-cardiff.ts`) — Cardiff (Amgueddfa Cymru / National Museum Wales). Free-text dates come in 5 shapes; only "From X" and explicit dash-separated ranges are parsed, the rest (recurring/list/vague text) are deliberately skipped rather than guessed. 4/22 events ingest cleanly |
| FACT Liverpool | ✅ Implemented (`lib/sources/fact-liverpool.ts`) — Best find of round 5: unix-epoch `data-start`/`data-end` attrs directly on each `<article>`, no date-string parsing at all. 13/13 events ingest cleanly |
| Laing Art Gallery | ✅ Implemented (`lib/sources/laing-art-gallery.ts`) — Newcastle. Tyne & Wear Archives & Museums' shared `northeastmuseums.org.uk` `/whats-on/search/-/-/-/-/-/<venue-id>` platform, also covers Hatton Gallery/Great North Museum/Discovery Museum below. Four date-text shapes handled, including "Until X" (no start given, treated as already running) and comma-separated recurring-occurrence lists (first date used) |
| Hatton Gallery | ✅ Implemented (`lib/sources/hatton-gallery.ts`) — Newcastle University. Same northeastmuseums.org.uk platform as Laing, venue id 241 |
| Great North Museum: Hancock | ✅ Implemented (`lib/sources/great-north-museum.ts`) — Newcastle. Same platform, venue id 240 |
| Discovery Museum | ✅ Implemented (`lib/sources/discovery-museum-newcastle.ts`) — Newcastle. Same platform, venue id 239 |
| The Bowes Museum | ✅ Implemented (`lib/sources/bowes-museum.ts`) — Barnard Castle. Returns `403` to curl but a clean `200` to Node's `fetch` — the opposite direction of the usual Cloudflare false-pass pattern elsewhere in this doc, confirmed fine since Vercel's runtime is Node. Includes an "LGBTQIA+ Object Trail". 12/12 events ingest cleanly |
| Manchester Museum | ✅ Implemented (`lib/sources/manchester-museum.ts`) — University of Manchester. Squarespace-built `/events` — worth flagging since Squarespace blocked Doyle Wham/CasildART earlier in this doc for blog-post-only dates; this one has real `<time class="summary-metadata-item--date">` ranges, a counter-example not a pattern. 25/25 events ingest cleanly |
| Royal Pavilion & Museums (Brighton & Hove Museums) | ✅ Implemented (`lib/sources/royal-pavilion-museums.ts`) — a 5-venue umbrella (Royal Pavilion & Garden, Brighton Museum & Art Gallery, Preston Manor & Gardens, Hove Museum of Creativity, Booth Museum of Natural History) on one `/whats-on/` listing, venue read per-card. 51/51 events ingest cleanly across all 5 venues |
| De La Warr Pavilion | ✅ Implemented (`lib/sources/de-la-warr-pavilion.ts`) — Bexhill-on-Sea. Free-text `<h3>` date with a `<br/>` between start/end; many cards have no year on either side, inferred independently per side (accepted minor imprecision). 59/59 events ingest cleanly |
| Hastings Contemporary | ✅ Implemented (`lib/sources/hastings-contemporary.ts`) — clean, consistently full-year `.event-date` text, no shorthand cases |
| Victoria and Albert Museum (South Kensington + Young V&A) | ✅ Implemented (`lib/sources/vam-south-kensington.ts`) — best find of round 6: `/whatson` (distinct from `/east`, already scraped separately) carries full schema.org `Event` microdata as `<meta itemprop>` tags — ISO startDate/endDate, price/currency, nested `location` Place — no free-text date parsing anywhere. Covers a 6-venue umbrella (South Kensington, Young V&A, East Museum, East Storehouse, Online, Offsite); only the first two are ingested here to avoid double-ingesting the East venues `vam-east.ts` already covers. 40/40 events ingest cleanly, including an "LGBTQIA+ Tour" |
| St Fagans, National Waterfront Museum, National Wool Museum, National Roman Legion Museum, National Slate Museum, Big Pit National Coal Museum (Amgueddfa Cymru) | ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) — the same `events_list_event` platform as `national-museum-cardiff.ts`, but its umbrella `/whatson/` page covers all 7 sites; Cardiff filtered out here since it already has its own adapter. 32/70 cards ingest (the rest are recurring/list-of-dates text deliberately left unparsed, same conservative rule as Cardiff's adapter, extended to also parse a bare single date) |
| Aberdeen Art Gallery | ✅ Implemented (`lib/sources/aberdeen-art-gallery.ts`) — Drupal Views, server-rendered despite looking AJAX-driven at first glance. Three free-text date shapes plus a single-timed-date-before-a-comma case. Includes a dementia-friendly "Musical Memories" singing group — mission-relevant. 15/16 cards ingest (1 is a footer link, correctly filtered) |
| Leicester Museum & Art Gallery, Newarke Houses Museum | ✅ Implemented (`lib/sources/leicester-museums.ts`) — Leicester City Council's `/whats-on/` covers both venues on one small (8-card) unpaginated page. Dates never carry a year; found and fixed a real bug during build — inferring each side's year independently pushed a start date 8 months in the past onto next year, producing start > end, fixed with a shared-year-from-end fallback (same technique then reused in nottingham-contemporary.ts) |
| Victoria Art Gallery | ✅ Implemented (`lib/sources/victoria-art-gallery.ts`) — Bath & North East Somerset Council, Drupal Views. Found and fixed a real bug during build: the individual event is the inner `.views-col`, not the outer `.views-row` (a 3-column grid row) — the wrong selector was silently collapsing 3 cards into 1. Dates are a clean "X to Y" shape with a full year both sides. 11/11 events ingest, including a "Relaxed Hour" and a "BSL (British Sign Language) Exhibition Tour" — both mission-relevant |
| The Fitzwilliam Museum | ✅ Implemented (`lib/sources/fitzwilliam-museum.ts`) — Cambridge. `/plan-your-visit/exhibitions` cards are mostly a bare "opens on" start date with no end (most exhibitions here run open-ended) plus a couple of explicit "X to Y" ranges. 9/9 events ingest |
| Holburne Museum | ✅ Implemented (`lib/sources/holburne-museum.ts`) — Bath. WordPress "event" CPT archive, single free-text date per card, explicit `.c-archive-event__cost` field ("FREE" or a price). 2 of 6 cards have no date (recurring clubs) and are skipped. 4/6 events ingest |
| Wolverhampton Art Gallery, Bantock House | ✅ Implemented (`lib/sources/wolverhampton-art-gallery.ts`) — City of Wolverhampton Council. Clean server-rendered `event-card` grid, venue given per-card, dates always carry a full year on both sides. 9/9 events ingest |
| Nottingham Contemporary | ✅ Implemented (`lib/sources/nottingham-contemporary.ts`) — every card renders twice (a "Featured" section plus the full grid, same duplication pattern as `leeds-art-gallery.ts`), deduped by slug. Dates never carry a year and mix in recurrence/time text after a comma; the shared-year-from-end fallback (first used in `leicester-museums.ts`) correctly handles legitimate cross-year ranges like "Fri 9 Oct – Sun 10 Jan" while still fixing the same-year-but-already-past bug. 19 events ingest after dedup |
| Djanogly Gallery (Lakeside Arts, Nottingham) | ❌ Attempted, blocked — the real `#events-section`/`#events-section-rest` containers are empty `<section>` tags in the raw HTML (client-side JS/AJAX populated); a "Featured" section does have one real card with a date but it's wrapped in `style="display:none"`, not a reliable source |
| Courtauld Gallery | ❌ Attempted, blocked — `/whats-on/` has zero month-name or date-class content anywhere in the raw HTML; client-rendered |
| National Science and Media Museum (Bradford) | ❌ Attempted, blocked — `/whats-on` has zero real date content in the raw HTML despite a permissive robots.txt; client-rendered |
| The Box (Plymouth) | ❌ Attempted, blocked — `/whats-on` has zero real date content in the raw HTML; client-rendered |
| Oriel Davies (Newtown) | ❌ Attempted, blocked — `/whats-on/` has zero real date content; the only "date" match in a first-pass scan was a Google Analytics deprecation-notice string, not event data |
| Castlefield Gallery (Manchester) | 🔶 Re-attempted, still inconclusive — `/events/` has zero month-name/date-class content in the raw HTML, same as the round-4 first pass |
| Open Eye Gallery (Liverpool) | 🔶 Re-attempted, still inconclusive — `/whatson/` is an 11.9KB stub with zero date content, same as the round-4 first pass |
| Compton Verney (Warwickshire) | 🔶 Re-attempted, still inconclusive — the `data-start`/`data-end` attrs that looked promising in an automated heuristic scan turned out to be a slide-carousel widget's slide-index values ("201", "335"), not dates — confirms the round-4 finding rather than adding new information |
| Ikon Gallery (Birmingham) | ❌ Attempted, blocked — `/whats-on` (268KB page) has zero real date/card content; the one month-name match was a "galleries reopen 29 September" closure-notice banner |
| MOSTYN (Llandudno) | ❌ Attempted, blocked — intermittent Cloudflare "One moment, please..." JS challenge page returned to Node's `fetch` on repeat requests (a real page with content did come back on one earlier probe, confirming the block is a live challenge rather than a permanent redirect — not reliable enough to build against) |
| Glynn Vivian Art Gallery (Swansea) | ❌ Attempted, blocked — `/whats-on/` has zero real date content; the only month-name matches were a jQuery UI datepicker widget's config array |
| Grundy Art Gallery (Blackpool) | ❌ Attempted, blocked — `/whats-on/` body carries a `post-type-archive-event` class (WordPress "event" CPT) but the archive has zero server-rendered cards; only a client-side calendar widget's month-name array appears in the raw HTML |
| Towner Eastbourne | ❌ Attempted, blocked — `/whats-on` cards are driven by an Alpine.js/Vue filter component (`@click`, `:class` directives); zero `/exhibitions/` or `/events/` links anywhere in the raw HTML confirms the actual listing is client-rendered |
| Royal West of England Academy (RWA, Bristol) | ❌ Attempted, blocked — Shopify storefront; the homepage's `.slide__date` carousel is a curated teaser, and the real `/collections/events` grid turned out to be a `<script type="text/plain" data-product-template>` Mustache-style client-side template, not server-rendered markup |
| Ashmolean Museum (Oxford) | 🔶 Not pursued further this round — `/exhibitions` returns `200` with real month-name text (6 matches) but wasn't inspected closely enough to confirm a scrapable card structure; worth a closer look in a future round |
| Pitt Rivers Museum (Oxford) | 🔶 Not pursued further this round — `/events` returns `200` but zero month-name content in a first-pass scan; the "What's on" filtered URL variant wasn't checked |
| London Museum (Smithfield) | 🔶 Not pursued — doesn't reopen until 28 November 2026; `/whats-on/` already returns `200` with some real content but the programme is not yet the live one, worth revisiting after opening |
| Bristol Museum & Art Gallery, M Shed and other Bristol Museums venues | ❌ Not attempted — `robots.txt` explicitly blocks `ClaudeBot`/`GPTBot`/`CCBot`/`Amazonbot`/`Bytespider`/`Google-Extended`/`Applebot-Extended`/`meta-externalagent`/`CloudflareBrowserRenderingCrawler` via a Cloudflare "Content-Signal" block, same policy-block pattern as NPG/Wallace Collection |
| RAMM (Royal Albert Memorial Museum, Exeter) | ❌ Not attempted — `robots.txt` explicitly blocks `ClaudeBot`/`anthropic-ai`/`GPTBot`/`openai`/etc. via an enormous named-bot blocklist, same policy-block pattern as NPG/Wallace Collection |
| Ulster Museum, Ulster Folk Museum, Ulster Transport Museum (National Museums NI) | ❌ Attempted, blocked — Next.js app (`__NEXT_DATA__` present) but the embedded initial props are just homepage/nav content; `/whats-on`'s actual listing is fetched client-side after hydration, same pattern as `vam-dundee.ts`'s RSC approach but without the RSC stream actually containing the event data |
| MAC (Metropolitan Arts Centre, Belfast) | ❌ Attempted, blocked — `/whats-on` has zero event/card/listing class names anywhere in the raw HTML; client-rendered |
| CCA Derry~Londonderry | ❌ Attempted, blocked — `/exhibitions` returns only a paginated historical archive (all 36 dated entries found were from 2005–2011); no current/upcoming listing found on this URL in a first pass |
| York Art Gallery | ❌ Attempted, blocked — `/whats-on/` has zero event/card class names in the raw HTML; robots.txt's own `Disallow: *ajaxCalendar*` and `?mo=`/`?yr=` rules independently confirm the real listing is an AJAX calendar widget |
| Manchester Art Gallery | ❌ Attempted, blocked — `403` to Node's `fetch` on the homepage itself (Cloudflare/WAF), same failure mode as Royal Academy/Scottish National Gallery |
| Norwich Castle Museum & Art Gallery | ❌ Attempted, blocked — `403` to Node's `fetch`, same Cloudflare/WAF pattern |
| Heong Gallery (Downing College, Cambridge) | ❌ Attempted, blocked — `403` to Node's `fetch` on the college site |
| Derby Museum and Art Gallery | ❌ Attempted, blocked — Gatsby SPA (`gatsby-script-loader`), zero server-rendered event content in the raw HTML, same pattern as Somerset House/IWM London |
| Sheffield Museums Trust (Millennium Gallery, Graves Gallery) | 🔶 Attempted, inconclusive — `/whats-on/` returns `200` but is just navigation to per-venue pages with no card/date markup found in a first pass; not pursued further this round |
| Castlefield Gallery | 🔶 Attempted, inconclusive — `/events/` has a `/wp-json/` route but not the Tribe Events Calendar API, and no month-name or numeric date text anywhere in the raw HTML; not pursued further this round |
| Open Eye Gallery | 🔶 Attempted, inconclusive — same pattern as Castlefield Gallery, no date text found in `/whatson/`'s raw HTML; not pursued further this round |
| Compton Verney | 🔶 Attempted, inconclusive — `.c-event-card__date` text is real but inconsistent (mixed 2-digit/4-digit years, "Now open", "Wed and Thu" with no date at all); not pursued further this round given the parsing effort required for a minority-format payoff |
| Grundy Art Gallery | 🔶 Attempted, inconclusive — `/whats-on` returns `200` but only 114 bytes of content, effectively an empty stub page |
| Fitzwilliam Museum | ✅ Round 6 revisit — `/plan-your-visit/exhibitions` (not `/whats-on`, which is a separate near-empty events page) has real server-rendered cards, see Status table below |
| York Art Gallery, Science & Media Museum, Pitt Rivers Museum | ❌/🔶 Round 6 revisit — York Art Gallery confirmed blocked (AJAX calendar, robots.txt itself flags this); Science & Media Museum confirmed blocked (zero date content); Pitt Rivers still inconclusive, see Status table below |
| Wolverhampton Art Gallery, New Walk Museum (Leicester Museums) | ✅ Round 6 revisit — both built, see Status table below |
| Ashmolean Museum, Towner Eastbourne, Djanogly Gallery (Lakeside Arts) | ❌/🔶 Round 6 revisit — Towner Eastbourne and Djanogly Gallery confirmed client-rendered/blocked; Ashmolean still inconclusive, see Status table below |

Round 5 (30-candidate sweep, resolved 2026-08-27): **10 verified-buildable (covering 14 venues), 4 hard-blocked (3× Cloudflare/WAF `403`, 1× client-rendered SPA), 5 inconclusive/not pursued, 11 not reached this round** — see the Status table above for full per-venue detail. All 10 adapters are wired into `/api/ingest`.

Round 6 (30-candidate sweep, resolved 2026-08-28): pulled almost entirely from this doc's own long-standing candidate backlog rather than new research — the "not pursued this round" placeholders scattered through earlier rounds, plus a handful of newly-named national/regional venues (Amgueddfa Cymru's other 6 sites, Aberdeen, the two Bath galleries). Resolved **9 verified-buildable (covering 15 venues, ~147 events), 2 explicit AI-bot robots.txt blocks, and roughly 20 other blocked/inconclusive candidates** — see the Status table above for full per-venue detail. All 9 adapters are wired into `/api/ingest`.

Two standout finds: V&A's own `/whatson` page (distinct from the `/east`-only page `vam-east.ts` already scraped) turned out to carry full schema.org `Event` microdata — ISO dates, price, a nested `location` Place — as plain `<meta itemprop>` tags, no free-text parsing anywhere, the cleanest source found in any round so far; and Amgueddfa Cymru's umbrella `/whatson/` page (already known to power `national-museum-cardiff.ts`) turned out to cover 6 more National Museum Wales sites on the exact same URL, for free. Two real parsing bugs were caught and fixed this round, both the same root cause: inferring a date range's start and end years independently can push a start date that's several months in the past onto *next* year while the end date (closer to "now") stays this year, producing start > end for any exhibition that opened earlier in the current year — fixed with a shared-year-from-end fallback (first applied in `leicester-museums.ts`, reused in `nottingham-contemporary.ts`, which also needed it to still correctly handle a legitimate Oct→Jan cross-year case in the same pass). Mission-relevant finds: Aberdeen's "Musical Memories" (a dementia-friendly singing group) and Victoria Art Gallery's "Relaxed Hour" and "BSL (British Sign Language) Exhibition Tour".

---

## Next batch, round 2 (candidates)

The first proposed batch of 10 (§ below, now resolved: 5 built, 5 blocked)
skewed toward small/independent orgs, several of which turned out to have no
scrapeable structured data or to be temporarily closed. Worth pulling the
next batch more from the National/regional museum tiers below, which have
tended to have better site infrastructure (JSON-LD, dedicated CMSes) —
e.g. British Museum's sibling DCMS institutions (National Gallery, National
Portrait Gallery, Design Museum, Natural History Museum, Science Museum),
Whitworth/Manchester Art Gallery/HOME (North West cluster), or Somerset
House/Photographers' Gallery (London independent tier) — each still needs
the full robots.txt/live-fetch/structured-data check before building.

## Round 3 — outside London, community/inclusion-weighted (resolved 2026-08-26)

A third batch of 10, this time deliberately outside London and weighted
toward the "Community & inclusion-focused" mission (§ above) plus filling
the geographic gaps in current coverage (Scotland/Wales/Northern Ireland/
North East all had thin or zero coverage). Resolved 5 verified-buildable, 5
blocked — see the Status table above for full detail on each. Fruitmarket
Gallery (Edinburgh) was the standout: clean JSON-LD `Event` data plus ISO
`<time>` attributes, no free-text parsing needed at all. Two of the five
blocks were the same root cause seen repeatedly elsewhere in this doc — an
explicit named AI-bot block in `robots.txt` (Chapter Arts Centre,
Ffotogallery) — and one was a venue that had simply closed down (ONCA).
All 5 verified-buildable candidates now have adapters built and wired into
`/api/ingest` (see Status table above for each).

## Round 4 — 20-candidate sweep (resolved 2026-08-26)

A much larger batch of 20, pulled mostly from this doc's own regional
candidate tables plus two specific leads the doc had already flagged as
likely wins: the Glasgow Life `whats-on?venue=X` pattern behind the already-
implemented Kelvingrove adapter (guessed to also cover GoMA/Burrell/
Riverside — confirmed correct, all three implementable), and National
Museums Liverpool's headless JSON:API (previously seen `200` then `504` —
retried and found now consistently timing out across all 4 NML venues
checked, a harder infra failure than first suspected, not a bot block).
Resolved **13 verified-buildable, 1 verified-viable-but-high-effort (V&A
Dundee — real data exists but only inside a Next.js RSC flight stream,
meaningfully more fragile to parse than anything else in this doc), and 6
blocked**. mac Birmingham and Firstsite were the standout finds — clean
JSON-LD/`<time>` and `data-start-date`/`data-end-date` attributes
respectively, no free-text date parsing needed at all. Talbot Rice Gallery
turned up a directly mission-relevant "Sensory Friendly Morning" event
(`autistic-friendly` bucket), and the Glasgow Life cluster (GoMA/Burrell/
Riverside) turned up several more (LGBTQ+ tours, autism-friendly
workshops). All 14 verified-viable candidates — including V&A Dundee,
which proved more tractable than its RSC-stream risk suggested — now have
adapters built and wired into `/api/ingest`. See the Status table above
for full per-venue detail.

---

## Community & inclusion-focused (highest priority)

These are the venues most directly aligned with the product's core mission
(`PROJECT_PLAN.md` §2/§9) — identity/accessibility-relevant programming is
already the point of these spaces, rather than something to detect after the
fact. Prioritise this section over raw event volume elsewhere. The
[BLK ART MAP](https://www.blkartmap.co.uk/directory) is a living directory of
UK Black-led/POC-led arts organisations worth periodically re-checking for
entries this list misses.

| Name | City | Notes |
|---|---|---|
| Autograph ABP | London (Shoreditch) | ✅ Implemented — Black British photography/film, race & representation — mission-critical |
| 198 Contemporary Arts and Learning | London (Brixton) | ✅ Implemented — Black/POC-led visual arts and education space |
| Black Cultural Archives | London (Brixton) | ❌ Blocked — building closed for renovation since Feb 2025, no confirmed reopening date, zero forward-scheduled events on their own listing; re-check once reopened |
| New Art Exchange | Nottingham | ✅ Implemented — one of the UK's largest dedicated culturally-diverse contemporary art spaces |
| International Slavery Museum | Liverpool | ❌ Blocked — closed for redevelopment since 2025 (reopening ~2029), zero current/upcoming events; re-check on reopening |
| Queer Britain | London (King's Cross) | ✅ Implemented — UK's first LGBTQ+ museum |
| Shape Arts | London | ✅ Implemented — disability-led arts organisation, runs public programming |
| DaDaFest | Liverpool | ✅ Implemented — Disability and Deaf-led arts organisation; year-round events programme, festival itself is biennial |
| Cartwright Hall Art Gallery | Bradford | ✅ Implemented — strong South Asian collection/community programming given local demographics |
| Doyle Wham | London | ❌ Blocked — UK's first gallery dedicated to contemporary African photography, but no real event dates published (blog-post dates only, no JSON-LD) |
| CasildART | London | ❌ Blocked — Black-led, addresses underrepresentation of Black artists; site has no structured/consistent event dates |
| Gasworks | London (Vauxhall) | ✅ Implemented — international contemporary art with strong Global South/diaspora focus |
| Attenborough Arts Centre | Leicester | ✅ Implemented — venue built around accessible/inclusive arts practice |

*Verify before building*: Iniva (Institute of International Visual Arts) has
reportedly reduced/closed its physical exhibition space in recent years —
confirm current status before treating it as a live venue.

---

## National museums & galleries (DCMS-sponsored, London unless noted)

Free entry to permanent collections; large, well-resourced public
engagement programmes — likely highest event volume of any tier here.

| Name | Notes |
|---|---|
| British Museum | ❌ Blocked — see Status table above |
| National Gallery | ✅ Implemented (`lib/sources/national-gallery.ts`) |
| National Portrait Gallery | ❌ Skipped — explicit `ClaudeBot`/`GPTBot` robots.txt block, see Status table above |
| Tate Modern | ✅ Implemented (`lib/sources/tate.ts`) |
| Tate Britain | ✅ Implemented (`lib/sources/tate.ts`) |
| Tate Liverpool | Major redevelopment closure in progress — verify reopen status before building |
| Tate St Ives | |
| Victoria and Albert Museum (V&A) | South Kensington + Young V&A — ✅ Implemented (`lib/sources/vam-south-kensington.ts`). **V&A East** (Stratford) — ✅ Implemented (`lib/sources/vam-east.ts`) |
| Natural History Museum | |
| Science Museum | Part of Science Museum Group, alongside Science & Industry Museum (Manchester) and National Science and Media Museum (Bradford) |
| Design Museum | |
| Imperial War Museum London | Also IWM Duxford, IWM North (Manchester) |
| Royal Museums Greenwich | National Maritime Museum, Cutty Sark, Royal Observatory, Queen's House |
| London Museum | Formerly Museum of London — relocating to Smithfield, reopening ~2026, verify live listing URL |
| Wallace Collection | |
| Sir John Soane's Museum | |
| Horniman Museum | ✅ Implemented (`lib/sources/horniman.ts`) |
| Museum of the Home | ✅ Implemented (`lib/sources/museum-of-home.ts`) — formerly Geffrye Museum, Hoxton |
| Royal Armouries | Leeds (plus Tower of London, Fort Nelson) — ❌ Blocked, no scrapable event calendar exists, see Status table above |
| National Museums Liverpool | Umbrella for Walker Art Gallery, World Museum, Museum of Liverpool, International Slavery Museum, Lady Lever Art Gallery. 🔶 Re-attempted — the headless Drupal JSON:API noted below (`/jsonapi/node/event`) now times out (`504`) rather than the `200` seen when first discovered; not pursued further this round, worth a retry later rather than treating as a hard block |

---

## London (independent/non-DCMS)

| Name | Notes |
|---|---|
| Whitechapel Gallery | ✅ Implemented (`lib/sources/whitechapel.ts`) |
| Hayward Gallery | Southbank Centre |
| ICA (Institute of Contemporary Arts) | ✅ Implemented (`lib/sources/ica.ts`) |
| The Photographers' Gallery | |
| Dulwich Picture Gallery | |
| Courtauld Gallery | |
| Wellcome Collection | ✅ Implemented (`lib/sources/wellcome.ts`) — health/medicine themes, strong disability-relevant programming |
| Somerset House | ❌ Blocked — client-rendered SPA, see Status table above |
| Design Museum | ✅ Implemented (`lib/sources/design-museum.ts`) — Kensington |
| South London Gallery | ✅ Implemented (`lib/sources/south-london-gallery.ts`) |
| Camden Art Centre | ❌ Attempted, blocked — `/whats-on`'s only server-rendered card is a single "Highlight" banner; the actual programme grid is `<div id="app"><router-view></router-view></div>`, a client-rendered Vue SPA |
| Saatchi Gallery | 🔶 Attempted, inconclusive — `/whats-on/upcoming/` is a hand-authored Elementor (WordPress page builder) layout; no `Event` JSON-LD and no obvious repeating card/date structure found in a first pass. Not pursued further this round given the project's past experience with Elementor pages (CasildART, Doyle Wham) — worth a second look if revisited |
| National Army Museum | |
| Migration Museum | ✅ Implemented (`lib/sources/migration-museum.ts`) |
| Fashion and Textile Museum | ✅ Implemented (`lib/sources/fashion-textile-museum.ts`) — no HTML scraping needed, the listing's own client-side filter calls a first-party JSON REST endpoint (`/wp-json/ftmfilteredcards/v1/posts`) directly, with clean `date_from`/`date_to` fields |
| National Army Museum | ✅ Implemented (`lib/sources/national-army-museum.ts`) — paginated `/whats-on` (`?page=N`), date text is either a single date or a same-month day range ("6-7 Aug 2026") |
| Estorick Collection | Islington — attempted alongside this batch, no `Event` JSON-LD or `<time>`/date-class markup found on `/exhibitions`; not pursued further this round |

---

## North West

| Name | City | Notes |
|---|---|---|
| Manchester Art Gallery | Manchester | |
| The Whitworth | Manchester | University of Manchester |
| Manchester Museum | Manchester | |
| HOME | Manchester | ✅ Implemented (`lib/sources/home-manchester.ts`) — paginated `/whats-on`; `.start`/`.end` date spans carry no year, so it's inferred from the end date and the start borrows it (stepping back a year if that would put start after end) |
| Castlefield Gallery | Manchester | |
| Walker Art Gallery | Liverpool | National Museums Liverpool — ❌ Blocked, NML backend times out, see Status table above |
| World Museum | Liverpool | National Museums Liverpool — ❌ Blocked, same NML backend, see Status table above |
| Museum of Liverpool | Liverpool | National Museums Liverpool — ❌ Blocked, same NML backend, see Status table above |
| Bluecoat | Liverpool | ✅ Implemented (`lib/sources/bluecoat.ts`) |
| FACT Liverpool | Liverpool | Art + creative technology |
| Open Eye Gallery | Liverpool | Photography |
| Lady Lever Art Gallery | Port Sunlight, Wirral | National Museums Liverpool — ❌ Blocked, same NML backend, see Status table above |
| Grundy Art Gallery | Blackpool | |

---

## North East

| Name | City | Notes |
|---|---|---|
| BALTIC Centre for Contemporary Art | Gateshead | Strong community/access programming |
| Laing Art Gallery | Newcastle | |
| Hatton Gallery | Newcastle | Newcastle University |
| Great North Museum: Hancock | Newcastle | |
| Discovery Museum | Newcastle | |
| Bowes Museum | Barnard Castle | |
| MIMA (Middlesbrough Institute of Modern Art) | Middlesbrough | ❌ Blocked — client-rendered Vue SPA, see Status table above |

---

## Yorkshire & Humber

| Name | City | Notes |
|---|---|---|
| Leeds Art Gallery | Leeds | |
| Henry Moore Institute | Leeds | ✅ Implemented (`lib/sources/henry-moore-institute.ts`) |
| The Hepworth Wakefield | Wakefield | ✅ Implemented (`lib/sources/hepworth-wakefield.ts`) — `/whats-on/` cards have a free-text date with extra trailing info after the first comma ("...2026, FREE for Members..."); only the part before the comma is parsed |
| Yorkshire Sculpture Park | Wakefield | ✅ Implemented (`lib/sources/yorkshire-sculpture-park.ts`) — `/whats-on/exhibitions` cards carry `<time itemprop=startDate/endDate>` with clean ISO `datetime` attributes directly, no text parsing needed |
| York Art Gallery | York | |
| Millennium Gallery | Sheffield | |
| Graves Gallery | Sheffield | |
| Site Gallery | Sheffield | Contemporary art — ❌ Blocked, AI-bot robots.txt block, see Status table above |
| National Science and Media Museum | Bradford | Science Museum Group |
| Cartwright Hall Art Gallery | Bradford | See community section above |

---

## East & West Midlands

| Name | City | Notes |
|---|---|---|
| New Art Exchange | Nottingham | See community section above |
| Nottingham Contemporary | Nottingham | ✅ Implemented (`lib/sources/nottingham-contemporary.ts`) — round-4's first pass missed the abbreviated-weekday date text (`Sat 6 Jun`), which a full-month-name regex doesn't catch |
| Djanogly Gallery | Nottingham | ❌ Blocked — client-rendered, see Status table above |
| New Walk Museum & Art Gallery | Leicester | ✅ Implemented (`lib/sources/leicester-museums.ts`) |
| Attenborough Arts Centre | Leicester | See community section above |
| Derby Museum and Art Gallery | Derby | |
| Birmingham Museum & Art Gallery | Birmingham | |
| Ikon Gallery | Birmingham | ❌ Re-attempted, still blocked — `/whats-on` (268KB page) has zero real date/card content; the only month-name match was a closure-notice banner, see Status table above |
| mac Birmingham | Birmingham | Midlands Art Centre — ✅ Implemented (`lib/sources/mac-birmingham.ts`) |
| Wolverhampton Art Gallery | Wolverhampton | ✅ Implemented (`lib/sources/wolverhampton-art-gallery.ts`) — also covers Bantock House |
| Herbert Art Gallery & Museum | Coventry | |
| The New Art Gallery Walsall | Walsall | ✅ Implemented — see Status table above |
| Compton Verney | Warwickshire | 🔶 Re-attempted, still inconclusive — see Status table above |

---

## East of England

| Name | City | Notes |
|---|---|---|
| Sainsbury Centre | Norwich | UEA — ✅ Implemented (`lib/sources/sainsbury-centre.ts`) |
| Norwich Castle Museum & Art Gallery | Norwich | |
| Fitzwilliam Museum | Cambridge | ✅ Implemented (`lib/sources/fitzwilliam-museum.ts`) |
| Kettle's Yard | Cambridge | ✅ Implemented (`lib/sources/kettles-yard.ts`) |
| Firstsite | Colchester | ✅ Implemented (`lib/sources/firstsite.ts`) |
| Heong Gallery | Cambridge | Downing College |

---

## South East

| Name | City | Notes |
|---|---|---|
| Turner Contemporary | Margate | ❌ Not attempted — robots.txt explicitly blocks `GPTBot` (and by the same policy block likely other AI crawlers) with `Disallow: /`; skipping per the operator's stated signal, same policy as NPG/NHM/Wallace Collection |
| Pallant House Gallery | Chichester | ✅ Implemented (`lib/sources/pallant-house.ts`) — `/exhibitions` cards' `<time datetime>` attribute is always empty in practice, so the visible text is parsed instead; a "Spring 2027"-style unparseable end date degrades to a null `endAt` rather than dropping the event |
| Towner Eastbourne | Eastbourne | ❌ Attempted, blocked — `/whats-on` cards are Alpine.js/Vue-driven (`@click`, `:class`); zero real exhibition/event links in the raw HTML, see Status table above |
| De La Warr Pavilion | Bexhill-on-Sea | |
| Ashmolean Museum | Oxford | 🔶 Not pursued further this round — `/exhibitions` has some real date text but wasn't inspected closely enough to confirm a scrapable structure |
| Modern Art Oxford | Oxford | 🔶 Not pursued further this round — `/whats-on/` heuristic scan showed real `data-start`/`data-end` attrs and hundreds of month-name matches, a promising lead not yet followed up |
| Pitt Rivers Museum | Oxford | 🔶 Not pursued further this round — `/events` reachable but zero date content found in a first pass |
| Royal Pavilion & Museums | Brighton | |
| ONCA Gallery | Brighton | Climate/environment-focused art — ❌ Blocked, org permanently wound down, see Status table above |
| Fabrica | Brighton | ✅ Implemented (`lib/sources/fabrica.ts`) |
| Hastings Contemporary | Hastings | Formerly Jerwood Gallery |

---

## South West

| Name | City | Notes |
|---|---|---|
| Bristol Museum & Art Gallery | Bristol | ❌ Not attempted — robots.txt explicitly blocks `ClaudeBot`/`GPTBot`/etc. via a Cloudflare "Content-Signal" block, see Status table above |
| Arnolfini | Bristol | ✅ Implemented (`lib/sources/arnolfini.ts`) |
| Spike Island | Bristol | ✅ Implemented (`lib/sources/spike-island.ts`) |
| RWA (Royal West of England Academy) | Bristol | ❌ Attempted, blocked — client-rendered Shopify collection template, see Status table above |
| Holburne Museum | Bath | ✅ Implemented (`lib/sources/holburne-museum.ts`) |
| Victoria Art Gallery | Bath | ✅ Implemented (`lib/sources/victoria-art-gallery.ts`) |
| RAMM (Royal Albert Memorial Museum) | Exeter | ❌ Not attempted — robots.txt explicitly blocks `ClaudeBot`/`anthropic-ai`/`GPTBot`/etc. via an enormous named-bot blocklist, see Status table above |
| The Box | Plymouth | ❌ Attempted, blocked — zero real date content in the raw HTML, see Status table above |

---

## Scotland

| Name | City | Notes |
|---|---|---|
| National Museum of Scotland | Edinburgh | National Museums Scotland |
| Scottish National Gallery | Edinburgh | National Galleries of Scotland — ❌ Attempted, blocked — `403` to Node fetch on the homepage itself (Cloudflare/WAF), same failure mode as Royal Academy/Manchester Art Gallery |
| Scottish National Portrait Gallery | Edinburgh | National Galleries of Scotland — same `403` block as above |
| Scottish National Gallery of Modern Art | Edinburgh | Modern One & Two — same `403` block as above |
| Fruitmarket Gallery | Edinburgh | ✅ Implemented (`lib/sources/fruitmarket-gallery.ts`) |
| Talbot Rice Gallery | Edinburgh | University of Edinburgh — ✅ Implemented (`lib/sources/talbot-rice-gallery.ts`) |
| Stills | Edinburgh | Photography — 🔶 Attempted, inconclusive — `/exhibitions/` and `/events/` both return `200` with real month-name text but weren't inspected closely enough to confirm a scrapable card structure this round |
| Kelvingrove Art Gallery and Museum | Glasgow | |
| Gallery of Modern Art (GoMA) | Glasgow | ✅ Implemented (`lib/sources/goma.ts`) |
| The Burrell Collection | Glasgow | ✅ Implemented (`lib/sources/burrell-collection.ts`) |
| Riverside Museum | Glasgow | ✅ Implemented (`lib/sources/riverside-museum.ts`) |
| Hunterian Museum & Art Gallery | Glasgow | University of Glasgow — ✅ Implemented (`lib/sources/hunterian.ts`) |
| Street Level Photoworks | Glasgow | ✅ Implemented (`lib/sources/street-level-photoworks.ts`) |
| Dundee Contemporary Arts (DCA) | Dundee | ✅ Implemented (`lib/sources/dca.ts`) |
| V&A Dundee | Dundee | ✅ Implemented (`lib/sources/vam-dundee.ts`) — higher-risk RSC-stream extraction, see Status table above |
| Aberdeen Art Gallery | Aberdeen | ✅ Implemented (`lib/sources/aberdeen-art-gallery.ts`) |

---

## Wales

| Name | City | Notes |
|---|---|---|
| National Museum Cardiff | Cardiff | Amgueddfa Cymru / National Museum Wales — ✅ Implemented (`lib/sources/national-museum-cardiff.ts`) |
| St Fagans National Museum of History | Cardiff | Amgueddfa Cymru — ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) |
| National Waterfront Museum | Swansea | Amgueddfa Cymru — ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) |
| National Wool Museum | Drefach Felindre | Amgueddfa Cymru — ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) |
| National Roman Legion Museum | Caerleon, Newport | Amgueddfa Cymru — ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) |
| National Slate Museum | Llanberis | Amgueddfa Cymru — ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) |
| Big Pit National Coal Museum | Blaenavon | Amgueddfa Cymru — ✅ Implemented (`lib/sources/amgueddfa-cymru.ts`) |
| Glynn Vivian Art Gallery | Swansea | ❌ Blocked — `/whats-on/` has zero real date content, only a jQuery datepicker widget's config array, see Status table above |
| Ffotogallery | Cardiff/Penarth | Photography — ❌ Blocked, AI-bot robots.txt block, see Status table above |
| Chapter Arts Centre | Cardiff | ❌ Blocked, AI-bot robots.txt block, see Status table above |
| MOSTYN | Llandudno | ❌ Blocked — intermittent Cloudflare JS challenge, see Status table above |
| Oriel Davies | Newtown | ❌ Blocked — zero real date content, see Status table above |

---

## Northern Ireland

| Name | City | Notes |
|---|---|---|
| Ulster Museum | Belfast | National Museums NI — ❌ Blocked, client-rendered (Next.js, but event data not in initial props), see Status table above |
| MAC (Metropolitan Arts Centre) | Belfast | ❌ Blocked, client-rendered, see Status table above |
| Golden Thread Gallery | Belfast | ✅ Implemented (`lib/sources/golden-thread-gallery.ts`) |
| Ulster Folk Museum / Ulster Transport Museum | Cultra | National Museums NI — ❌ Blocked, same NMNI backend as Ulster Museum |
| Void Gallery | Derry/Londonderry | ❌ Blocked, client-rendered listing, see Status table above |
| CCA Derry~Londonderry | Derry/Londonderry | ❌ Blocked — `/exhibitions` only returns a historical archive (2005-2011), see Status table above |

---

## Sources

- [National Museums of the United Kingdom — Wikipedia](https://en.wikipedia.org/wiki/National_Museums_of_the_United_Kingdom)
- [DCMS-sponsored Museums and Galleries Annual Performance Indicators 2024/25 — GOV.UK](https://www.gov.uk/government/statistics/dcms-sponsored-museums-and-galleries-annual-performance-indicators-202425)
- [BLK ART MAP directory](https://www.blkartmap.co.uk/directory)
