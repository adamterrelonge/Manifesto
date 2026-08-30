# Venue Accessibility

A hand-researched record of each venue's own **permanent, building-level**
accessibility features — step-free access, accessible toilets, hearing
loops, BSL tours, sensory/quiet rooms — read straight from `lib/buckets.ts`
and `lib/venue-accessibility.ts`.

## Why this exists

`lib/buckets.ts`'s keyword classifier only ever matches accessibility
phrases (`"wheelchair accessible"`, `"step-free"`, `"BSL interpreted"`, ...)
that appear in an individual **event's own** scraped title/description. In
practice almost none of them repeat this — a venue's accessibility is
published once, on its own `/access` or `/visit/accessibility` page, not
copy-pasted into every listing. Without this doc, every event at a fully
step-free, hearing-looped venue silently gets zero accessibility signal
just because the organiser didn't retype it into the event blurb.

`lib/venue-accessibility.ts` closes that gap: a venue name → known
accessibility features lookup, applied to **every** event held at that
venue during classification (`lib/pipeline.ts`'s `runClassification`),
regardless of what that event's own copy says. See that file's header
comment for the exact mechanics and how it merges with keyword matches.

## Important: this does not, by itself, make an event public

`disability-friendly` / `autistic-friendly` / `deaf-accessible` are
**`ACCESS_ONLY_BUCKETS`** (`lib/buckets.ts`) — they describe an
accessibility feature of the venue/event, not who the event is *for*. Per
product decision, an event needs a real identity/community bucket match
(`black`, `queer`, `womxn-led`, `poc`, ...) to pass the "niche events only"
gate (`lib/events-query.ts`). A venue-accessibility tag alone — or several
of them together with no identity bucket — never qualifies an event on its
own. This is deliberate: most public venues have a step-free entrance or an
accessible toilet as a matter of course, so that fact alone says nothing
about the audience. It still shows as an enrichment pill once an event
already qualifies via a real identity/community match.

## Research method

**Only add an entry once you've actually read the venue's own accessibility
page.** Never infer or guess from a venue's type, size, reputation, or
"most museums have this" — an accessibility claim that turns out to be
wrong is actively harmful to the disabled visitors this is meant to help,
not just a cosmetic miscategorisation.

1. Find the venue's own accessibility/access statement — usually
   `/access`, `/visit/accessibility`, `/plan-your-visit/access`, or linked
   from the main "Visit"/"Plan your visit" nav. Government/national museum
   sites often call it an "Access Statement" (sometimes a PDF).
2. Only record a feature the statement **states outright** — "step-free
   access throughout", "hearing loop at admissions and in the theatre",
   "BSL tours available by request", "quiet room available", "Changing
   Places toilet". Partial/conditional access (e.g. "step-free to ground
   floor only, upper galleries via stairs only") should not be recorded as
   a blanket `disability-friendly` match — skip it rather than
   overstate it.
3. Map what you found to bucket slugs conservatively:
   - `disability-friendly` — general mobility/physical access: step-free
     routes, accessible toilets, lifts, wheelchair loan, ramp access.
   - `autistic-friendly` — sensory/neurodivergent accommodation: quiet
     room, sensory backpacks, relaxed/low-sensory sessions as a standing
     venue offer (not a one-off event — a one-off "Sensory Friendly
     Morning" belongs on that specific event via the keyword classifier,
     not here).
   - `deaf-accessible` — hearing loop, BSL tour availability, captioning
     as a standing venue offer.
4. Add the entry to `lib/venue-accessibility.ts`, keyed by the **exact**
   `VENUE.name` string used in the matching `lib/sources/*.ts` adapter.
   Include the `source` URL you read.
5. Update this doc's status table below.

## Status

First research pass (2026-08-29): 32 venues verified and added to
`lib/venue-accessibility.ts`, pulled from each venue's own accessibility
page (or, where a direct fetch was blocked by a 403, a search-engine
result quoting exact sentences from that same page — same underlying
source, just a different retrieval path). ~60 more implemented venues
(see `lib/sources/*.ts`) haven't been attempted yet — this is a starting
batch prioritising major national/well-documented venues, not full
coverage. An entry missing below is not a claim the venue is
inaccessible, just not yet researched.

Second research pass (2026-08-29, same day): 30 more venues verified
(including all 6 remaining Amgueddfa Cymru sites, Tate Liverpool/Tate St
Ives, Young V&A and V&A East Storehouse), plus ~20 more attempted and
explicitly skipped/blocked (no discoverable physical-access statement,
website-accessibility-only pages, or partial/conditional access per this
doc's conservative rule). ~30 implemented venues remain unattempted —
mostly small/independent orgs (October Gallery, Ibraaz, 198 Contemporary,
Street Level Photoworks) and a few umbrella groups where no per-venue
statement could be found (Tyne & Wear Archives & Museums' four North
East venues, Brighton & Hove Museums' five sites).

Third research pass (2026-08-30): the remaining gap in `lib/sources/*.ts`'s
fixed-venue adapters turned out to be smaller than estimated — cross-
referencing every adapter's exact `VENUE.name` against this table found
only 6 genuinely unattempted venues (the earlier "~30 remaining" estimate
conflated fixed-venue adapters with `lib/sources/eventbrite-organisers.ts`'s
long list of community-organiser names, which have no single fixed venue to
attach a static accessibility profile to and are out of scope for this
doc). All 6 were researched and verified: V&A East Museum, Holburne
Museum, The New Art Gallery Walsall, The Photographers' Gallery, South
London Gallery, and Victoria Art Gallery (Bath). A 7th entry, "The
Bluecoat", was also added — not new research, just a naming fix: DaDaFest's
adapter uses "The Bluecoat" as its `VENUE.name` (confirmed the same
building as the already-researched "Bluecoat" entry, per that adapter's own
comment), so it needed a duplicate entry under that exact key to actually
match at classification time. With this pass, every fixed-venue adapter in
`lib/sources/*.ts` now has either a ✅ or ❌ row below.

| Venue | Status |
|---|---|
| Wellcome Collection | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Tate Modern | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Tate Britain | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Tate Liverpool | ✅ disability-friendly, autistic-friendly — BSL "offered where possible" is conditional, not a fixed hearing loop, so deaf-accessible wasn't recorded |
| Tate St Ives | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Barbican Centre | ✅ disability-friendly, deaf-accessible |
| National Army Museum | ✅ disability-friendly, deaf-accessible |
| Horniman Museum and Gardens | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Design Museum | ✅ disability-friendly only — BSL/relaxed-opening features found were tied to specific temporary exhibitions, not a standing offer, so not counted as deaf-accessible/autistic-friendly per this doc's conservative rule |
| The National Gallery | ✅ disability-friendly — no hearing loop/BSL feature found |
| ICA | ✅ deaf-accessible only — "limited step-free access to the Nash and Brandon Rooms" is explicitly partial, so disability-friendly was not recorded |
| Whitechapel Gallery | ✅ disability-friendly, deaf-accessible |
| Queer Britain | ✅ disability-friendly — no hearing loop/BSL feature found |
| Autograph ABP | ✅ disability-friendly — no hearing loop/BSL feature found |
| Victoria and Albert Museum, South Kensington | ✅ disability-friendly only — the one hearing loop mention found was scoped to the Prints and Drawings Study Room, not a general-visitor feature |
| Young V&A | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| V&A East Storehouse | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| National Museum of Scotland | ✅ disability-friendly, deaf-accessible |
| National Museum Cardiff | ✅ disability-friendly, deaf-accessible |
| St Fagans National Museum of History | ✅ disability-friendly, deaf-accessible |
| National Waterfront Museum | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| National Wool Museum | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| National Roman Legion Museum | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| National Slate Museum | ✅ disability-friendly, deaf-accessible, autistic-friendly — the Pattern Loft specifically is stairs-only, but the main museum is level/step-free so the blanket match still holds |
| Big Pit National Coal Museum | ✅ disability-friendly, deaf-accessible, autistic-friendly — some internal ramps are noted as "long and steep", but overall site access and accessible toilets on all 3 levels clear the bar |
| Birmingham Museum & Art Gallery | ✅ disability-friendly only via the Gas Hall entrance (the main Chamberlain Square entrance has ~50 steps) — no hearing loop confirmed |
| Manchester Museum | ✅ disability-friendly, deaf-accessible |
| HOME | ✅ disability-friendly, deaf-accessible |
| Kelvingrove Art Gallery and Museum | ✅ disability-friendly, deaf-accessible |
| Gallery of Modern Art (GoMA) | ✅ disability-friendly, deaf-accessible |
| The Burrell Collection | ✅ disability-friendly only — no hearing loop specifically confirmed for this venue (only for "Glasgow's museums" generally) |
| Riverside Museum | ❌ inconclusive — only "wheelchairs available for loan" found specifically for this venue; a general "Glasgow Life museums are accessible" summary isn't specific enough evidence per this doc's rule |
| V&A Dundee | ✅ disability-friendly, deaf-accessible |
| Arnolfini | ✅ disability-friendly, autistic-friendly (recurring quiet hours + relaxed openings) — hearing loop sources conflicted (one said induction loop in the Theatre, AccessAble said no hearing assistance system), so deaf-accessible was not recorded |
| Spike Island | ✅ disability-friendly only — no hearing loop found |
| The Hepworth Wakefield | ✅ disability-friendly, deaf-accessible |
| Yorkshire Sculpture Park | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Kettle's Yard | ❌ skipped — the Gallery is step-free but the historic House explicitly has no lift/wheelchair access, a partial-access case this doc's method says to skip rather than overstate |
| The Fitzwilliam Museum | ✅ disability-friendly, deaf-accessible |
| Fruitmarket | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Talbot Rice Gallery | ❌ skipped — access to the Georgian Gallery specifically requires a stair lift (partial access), and its own accessibility page states no hearing assistance system |
| Sainsbury Centre | ✅ disability-friendly, autistic-friendly |
| mac Birmingham | ✅ disability-friendly, deaf-accessible |
| DCA (Dundee Contemporary Arts) | ✅ disability-friendly only — no hearing loop confirmed (BSL relay service found is for phone bookings, not an in-venue feature) |
| New Art Exchange | ✅ deaf-accessible only — step-free access wasn't explicitly confirmed as blanket |
| Migration Museum | ❌ not applicable — currently has no open public site (between venues, planned reopening ~2028) |
| Shape Arts | ❌ not applicable — a disability-led organisation whose events run at other venues (no single fixed venue of its own, per `docs/SCRAPE_TARGETS.md`) |
| Museum of the Home | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Pallant House Gallery | ✅ disability-friendly, deaf-accessible |
| Serpentine Galleries / Serpentine North Gallery / Serpentine South Gallery | ✅ disability-friendly, autistic-friendly (relaxed hours) — no hearing loop found, one shared statement covers both gallery buildings |
| Sir John Soane's Museum | ✅ deaf-accessible only — Grade I listed building has explicitly conditional physical access (pre-booked platform lift, custom narrow wheelchairs only, "access isn't always straightforward"), so disability-friendly was skipped per this doc's partial-access rule; the induction loops and BSL tour film are unconditional |
| Fashion and Textile Museum | ✅ disability-friendly only — no hearing loop/BSL found; a "quietest time to visit" tip isn't a standing sensory accommodation |
| Attenborough Arts Centre | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Golden Thread Gallery | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Herbert Art Gallery & Museum | ✅ disability-friendly, autistic-friendly — no hearing loop/BSL found |
| Firstsite | ✅ disability-friendly, deaf-accessible — no standing sensory/quiet feature found |
| FACT Liverpool | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Gasworks | ✅ disability-friendly, autistic-friendly (quiet times for neurodivergent audiences on request) — page explicitly states no BSL/captioning currently offered |
| De La Warr Pavilion | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Factory International (Aviva Studios) | ✅ disability-friendly, deaf-accessible, autistic-friendly |
| Hastings Contemporary | ✅ disability-friendly, autistic-friendly — no hearing loop/BSL found |
| The Bowes Museum | ✅ disability-friendly, deaf-accessible — no BSL/dedicated sensory space found |
| Fabrica | ✅ disability-friendly, autistic-friendly (quiet space for some exhibitions) — no hearing loop/BSL found |
| Henry Moore Institute | ✅ disability-friendly, deaf-accessible, autistic-friendly — a doorway width limit affects only the library, not general access |
| Bluecoat | ✅ deaf-accessible only — its own page states full wheelchair access to the new wing but "limited access to the older parts" as a Listed building, a partial-access case skipped per this doc's rule |
| Hunterian Art Gallery | ✅ disability-friendly, autistic-friendly — BSL only offered as occasional "What's On" tour events, not a standing feature, so deaf-accessible wasn't recorded; the Art Gallery's accessible toilet has some caveats but the Museum's own is unconditional |
| Wolverhampton Art Gallery / Bantock House | ❌ not found — no accessibility page discoverable from the site |
| Nottingham Contemporary | ❌ only a website-accessibility statement found, no physical access info |
| Leicester Museums (New Walk Museum / Newarke Houses) | ❌ only a website-accessibility statement found, no physical access info |
| Cartwright Hall Art Gallery | ❌ inconclusive — page references AccessAble/Visual Story resources but no specific facts were extractable |
| Africa Centre | ❌ only a website-accessibility (WCAG conformance) statement found, no physical access info |
| DaDaFest | ✅ deaf-accessible — the adapter's fixed venue is "The Bluecoat" (same building as the "Bluecoat" entry above), see that entry |
| Royal Pavilion & Garden / Brighton Museum & Art Gallery / Preston Manor & Gardens / Hove Museum of Creativity / Booth Museum of Natural History | ❌ not found — the umbrella Brighton & Hove Museums site states per-venue access statements exist "in the Plan your visit section" but none could be located from any of the 5 venue pages |
| Laing Art Gallery / Hatton Gallery / Great North Museum: Hancock / Discovery Museum | ❌ not found — no accessibility page discoverable on the shared northeastmuseums.org.uk platform |
| Leeds Art Gallery | ❌ not found — the shared Leeds Museums & Galleries access page redirects to "each venue page" but no Leeds Art Gallery-specific URL was found |
| October Gallery | ❌ not found — no accessibility page discoverable |
| Ibraaz | ❌ not attempted — site returned a server error (504) |
| 198 Contemporary Arts and Learning | ❌ not found — no accessibility page discoverable |
| Street Level Photoworks | ❌ not found — no accessibility page discoverable |
| V&A East Museum | ✅ disability-friendly, autistic-friendly — no hearing loop/BSL found on its own visit-info page |
| Holburne Museum | ✅ disability-friendly, deaf-accessible |
| The New Art Gallery Walsall | ✅ disability-friendly only — no hearing loop/BSL/sensory feature found |
| The Photographers' Gallery | ✅ disability-friendly, deaf-accessible (regular BSL-led/interpreted tours) |
| South London Gallery | ✅ disability-friendly, autistic-friendly — no hearing loop/BSL found |
| Victoria Art Gallery (Bath) | ✅ disability-friendly, autistic-friendly (monthly Relaxed Hours) — BSL interpretation is "arranged in advance" (on request, not a standing feature), so deaf-accessible wasn't recorded |
| The Bluecoat (DaDaFest's venue key) | ✅ deaf-accessible — see the "Bluecoat"/DaDaFest note above |
