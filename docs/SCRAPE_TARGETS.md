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
| British Museum | |
| National Gallery | |
| National Portrait Gallery | |
| Tate Modern | ✅ Implemented (`lib/sources/tate.ts`) |
| Tate Britain | ✅ Implemented (`lib/sources/tate.ts`) |
| Tate Liverpool | Major redevelopment closure in progress — verify reopen status before building |
| Tate St Ives | |
| Victoria and Albert Museum (V&A) | Main South Kensington site not yet implemented. **V&A East** (Stratford) — ✅ Implemented (`lib/sources/vam-east.ts`) |
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
| Royal Armouries | Leeds (plus Tower of London, Fort Nelson) |
| National Museums Liverpool | Umbrella for Walker Art Gallery, World Museum, Museum of Liverpool, International Slavery Museum, Lady Lever Art Gallery |

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
| Somerset House | Embankment Galleries |
| South London Gallery | ✅ Implemented (`lib/sources/south-london-gallery.ts`) |
| Camden Art Centre | |
| Saatchi Gallery | |
| National Army Museum | |
| Migration Museum | ✅ Implemented (`lib/sources/migration-museum.ts`) |
| Fashion and Textile Museum | |
| Estorick Collection | Islington |

---

## North West

| Name | City | Notes |
|---|---|---|
| Manchester Art Gallery | Manchester | |
| The Whitworth | Manchester | University of Manchester |
| Manchester Museum | Manchester | |
| HOME | Manchester | Contemporary art, theatre, cinema |
| Castlefield Gallery | Manchester | |
| Walker Art Gallery | Liverpool | National Museums Liverpool |
| World Museum | Liverpool | National Museums Liverpool |
| Museum of Liverpool | Liverpool | National Museums Liverpool |
| Bluecoat | Liverpool | |
| FACT Liverpool | Liverpool | Art + creative technology |
| Open Eye Gallery | Liverpool | Photography |
| Lady Lever Art Gallery | Port Sunlight, Wirral | National Museums Liverpool |
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
| MIMA (Middlesbrough Institute of Modern Art) | Middlesbrough | |

---

## Yorkshire & Humber

| Name | City | Notes |
|---|---|---|
| Leeds Art Gallery | Leeds | |
| Henry Moore Institute | Leeds | |
| The Hepworth Wakefield | Wakefield | |
| Yorkshire Sculpture Park | Wakefield | |
| York Art Gallery | York | |
| Millennium Gallery | Sheffield | |
| Graves Gallery | Sheffield | |
| Site Gallery | Sheffield | Contemporary art |
| National Science and Media Museum | Bradford | Science Museum Group |
| Cartwright Hall Art Gallery | Bradford | See community section above |

---

## East & West Midlands

| Name | City | Notes |
|---|---|---|
| New Art Exchange | Nottingham | See community section above |
| Nottingham Contemporary | Nottingham | |
| Djanogly Gallery | Nottingham | |
| New Walk Museum & Art Gallery | Leicester | |
| Attenborough Arts Centre | Leicester | See community section above |
| Derby Museum and Art Gallery | Derby | |
| Birmingham Museum & Art Gallery | Birmingham | |
| Ikon Gallery | Birmingham | |
| mac Birmingham | Birmingham | Midlands Art Centre |
| Wolverhampton Art Gallery | Wolverhampton | |
| Herbert Art Gallery & Museum | Coventry | |
| Compton Verney | Warwickshire | |

---

## East of England

| Name | City | Notes |
|---|---|---|
| Sainsbury Centre | Norwich | UEA |
| Norwich Castle Museum & Art Gallery | Norwich | |
| Fitzwilliam Museum | Cambridge | |
| Kettle's Yard | Cambridge | |
| Firstsite | Colchester | |
| Heong Gallery | Cambridge | Downing College |

---

## South East

| Name | City | Notes |
|---|---|---|
| Turner Contemporary | Margate | |
| Pallant House Gallery | Chichester | |
| Towner Eastbourne | Eastbourne | |
| De La Warr Pavilion | Bexhill-on-Sea | |
| Ashmolean Museum | Oxford | |
| Modern Art Oxford | Oxford | |
| Pitt Rivers Museum | Oxford | |
| Royal Pavilion & Museums | Brighton | |
| ONCA Gallery | Brighton | Climate/environment-focused art |
| Fabrica | Brighton | |
| Hastings Contemporary | Hastings | Formerly Jerwood Gallery |

---

## South West

| Name | City | Notes |
|---|---|---|
| Bristol Museum & Art Gallery | Bristol | |
| Arnolfini | Bristol | ✅ Implemented (`lib/sources/arnolfini.ts`) |
| Spike Island | Bristol | |
| RWA (Royal West of England Academy) | Bristol | |
| Holburne Museum | Bath | |
| Victoria Art Gallery | Bath | |
| RAMM (Royal Albert Memorial Museum) | Exeter | |
| The Box | Plymouth | |

---

## Scotland

| Name | City | Notes |
|---|---|---|
| National Museum of Scotland | Edinburgh | National Museums Scotland |
| Scottish National Gallery | Edinburgh | National Galleries of Scotland |
| Scottish National Portrait Gallery | Edinburgh | National Galleries of Scotland |
| Scottish National Gallery of Modern Art | Edinburgh | Modern One & Two |
| Fruitmarket Gallery | Edinburgh | |
| Talbot Rice Gallery | Edinburgh | University of Edinburgh |
| Stills | Edinburgh | Photography |
| Kelvingrove Art Gallery and Museum | Glasgow | |
| Gallery of Modern Art (GoMA) | Glasgow | |
| The Burrell Collection | Glasgow | |
| Riverside Museum | Glasgow | |
| Hunterian Museum & Art Gallery | Glasgow | University of Glasgow |
| Street Level Photoworks | Glasgow | |
| Dundee Contemporary Arts (DCA) | Dundee | |
| V&A Dundee | Dundee | |
| Aberdeen Art Gallery | Aberdeen | |

---

## Wales

| Name | City | Notes |
|---|---|---|
| National Museum Cardiff | Cardiff | Amgueddfa Cymru / National Museum Wales |
| St Fagans National Museum of History | Cardiff | Amgueddfa Cymru |
| National Waterfront Museum | Swansea | Amgueddfa Cymru |
| Glynn Vivian Art Gallery | Swansea | |
| Ffotogallery | Cardiff/Penarth | Photography |
| Chapter Arts Centre | Cardiff | |
| MOSTYN | Llandudno | |
| Oriel Davies | Newtown | |

---

## Northern Ireland

| Name | City | Notes |
|---|---|---|
| Ulster Museum | Belfast | National Museums NI |
| MAC (Metropolitan Arts Centre) | Belfast | |
| Golden Thread Gallery | Belfast | |
| Ulster Folk Museum / Ulster Transport Museum | Cultra | National Museums NI |
| Void Gallery | Derry/Londonderry | |
| CCA Derry~Londonderry | Derry/Londonderry | |

---

## Sources

- [National Museums of the United Kingdom — Wikipedia](https://en.wikipedia.org/wiki/National_Museums_of_the_United_Kingdom)
- [DCMS-sponsored Museums and Galleries Annual Performance Indicators 2024/25 — GOV.UK](https://www.gov.uk/government/statistics/dcms-sponsored-museums-and-galleries-annual-performance-indicators-202425)
- [BLK ART MAP directory](https://www.blkartmap.co.uk/directory)
