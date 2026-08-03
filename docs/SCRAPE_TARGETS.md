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
| Autograph ABP | London (Shoreditch) | Black British photography/film, race & representation — mission-critical |
| 198 Contemporary Arts and Learning | London (Brixton) | Black/POC-led visual arts and education space |
| Black Cultural Archives | London (Brixton) | African & Caribbean diaspora history — smaller event cadence, high relevance |
| New Art Exchange | Nottingham | One of the UK's largest dedicated culturally-diverse contemporary art spaces |
| International Slavery Museum | Liverpool | Part of National Museums Liverpool — directly mission-relevant |
| Queer Britain | London (King's Cross) | UK's first LGBTQ+ museum |
| Shape Arts | London | Disability-led arts organisation, runs public programming |
| DaDaFest | Liverpool | Disability and Deaf-led arts festival/organisation — check for a standing venue vs festival-only calendar |
| Cartwright Hall Art Gallery | Bradford | Strong South Asian collection/community programming given local demographics |
| Doyle Wham | London | UK's first gallery dedicated to contemporary African photography |
| CasildART | London | Black-led, addresses underrepresentation of Black artists |
| Gasworks | London (Vauxhall) | International contemporary art with strong Global South/diaspora focus |
| Attenborough Arts Centre | Leicester | Venue built around accessible/inclusive arts practice |

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
| Tate Modern | |
| Tate Britain | |
| Tate Liverpool | Major redevelopment closure in progress — verify reopen status before building |
| Tate St Ives | |
| Victoria and Albert Museum (V&A) | Plus **V&A East** (Stratford) — new site, opened 2025/26 |
| Natural History Museum | |
| Science Museum | Part of Science Museum Group, alongside Science & Industry Museum (Manchester) and National Science and Media Museum (Bradford) |
| Design Museum | |
| Imperial War Museum London | Also IWM Duxford, IWM North (Manchester) |
| Royal Museums Greenwich | National Maritime Museum, Cutty Sark, Royal Observatory, Queen's House |
| London Museum | Formerly Museum of London — relocating to Smithfield, reopening ~2026, verify live listing URL |
| Wallace Collection | |
| Sir John Soane's Museum | |
| Horniman Museum | |
| Museum of the Home | Formerly Geffrye Museum, Hoxton |
| Royal Armouries | Leeds (plus Tower of London, Fort Nelson) |
| National Museums Liverpool | Umbrella for Walker Art Gallery, World Museum, Museum of Liverpool, International Slavery Museum, Lady Lever Art Gallery |

---

## London (independent/non-DCMS)

| Name | Notes |
|---|---|
| Whitechapel Gallery | |
| Hayward Gallery | Southbank Centre |
| ICA (Institute of Contemporary Arts) | |
| The Photographers' Gallery | |
| Dulwich Picture Gallery | |
| Courtauld Gallery | |
| Wellcome Collection | Health/medicine themes, strong disability-relevant programming |
| Somerset House | Embankment Galleries |
| South London Gallery | |
| Camden Art Centre | |
| Saatchi Gallery | |
| National Army Museum | |
| Migration Museum | |
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
| Arnolfini | Bristol | |
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
