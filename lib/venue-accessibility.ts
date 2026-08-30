// A venue's own accessibility statement (step-free access, accessible
// toilets, hearing loops, BSL tours, sensory/quiet rooms, ...) describes the
// building, not any one event — but almost nothing in a scraped event's own
// title/description ever repeats it, so lib/buckets.ts's keyword classifier
// has no way to catch it from event text alone. This is a hand-researched
// supplement: known accessibility features per venue, sourced from each
// venue's own public access statement, applied to every event held there.
//
// See docs/VENUE_ACCESSIBILITY.md for the research method, provenance
// requirements, and per-venue status. Only add an entry once you've read
// the venue's own accessibility page yourself — never infer/guess a
// venue's accessibility from its type, size, or reputation.
//
// Deliberately produces the same shape as lib/buckets.ts's BucketMatch so
// lib/pipeline.ts can merge both sources with one code path. Confidence is
// fixed high (0.95) — this is sourced from the venue's own published
// statement, not inferred — but these are still ACCESS_ONLY_BUCKETS slugs
// (see lib/buckets.ts), so on their own they never make an event public;
// they only enrich an event that already qualifies via a real identity
// bucket, or sit alongside one once a moderator/keyword match adds it.

import type { BucketMatch, BucketSlug } from "@/lib/buckets";

type AccessBucketSlug = Extract<
  BucketSlug,
  "disability-friendly" | "autistic-friendly" | "deaf-accessible"
>;

export interface VenueAccessibilityEntry {
  /** Which access buckets this venue's own statement supports. */
  buckets: AccessBucketSlug[];
  /** Short human-readable facts backing the buckets above (shown as evidence). */
  features: string[];
  /** The venue's own accessibility/access-statement page this was read from. */
  source: string;
}

// Keyed by venue name exactly as set in the matching lib/sources/*.ts
// adapter's VENUE.name (case-sensitive) — this is how event_buckets rows
// get matched back to a venue at classification time (see
// lib/pipeline.ts's runClassification). If an adapter's VENUE.name ever
// changes, update the key here too.
//
// See docs/VENUE_ACCESSIBILITY.md's status table for the full picture,
// including venues that were researched and explicitly skipped (partial/
// conditional access, conflicting sources, or no statement found) — an
// entry missing here is not a claim the venue is inaccessible, just that
// it hasn't been researched (or didn't clear the conservative bar) yet.
export const VENUE_ACCESSIBILITY: Record<string, VenueAccessibilityEntry> = {
  "Wellcome Collection": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free access throughout the building",
      "Accessible toilets on all floors",
      "Fixed induction loops at the Information Point, café and library enquiry desk",
      "Regular BSL tours of exhibitions, plus free in-person BSL tours on request",
      "A chill-out space usually available with low lighting, sensory tools and ear defenders",
    ],
    source: "https://wellcomecollection.org/visit-us/accessibility",
  },
  "Tate Modern": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free entrances, lifts to every floor of the Natalie Bell and Blavatnik Buildings",
      "Fully accessible toilets on every floor; Changing Places toilet on Level 0",
      "Hearing loop at the ticket desks",
      "Two quiet rooms (Level 2 and Level 4 of the Natalie Bell Building) for neurodiverse people",
    ],
    source: "https://www.tate.org.uk/visit/tate-modern",
  },
  "Tate Britain": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Ramped Manton entrance, lift and stair access to gallery floors, level access to the Linbury Galleries",
      "Accessible toilets on the Lower Floor",
      "Hearing loop in the Auditorium and Manton Studio",
      "Quiet room on the main floor, adjacent to the Play Studio, for neurodiverse people",
    ],
    source: "https://www.tate.org.uk/visit/tate-britain",
  },
  "Barbican Centre": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Accessible routes to all venues, lifts available throughout",
      "Accessible toilets across multiple levels",
      "Induction loop in every auditorium and at the ticket desk counter",
    ],
    source: "https://www.barbican.org.uk/your-visit/accessibility/accessible-facilities",
  },
  "National Army Museum": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Level access at the main entrance, ramped group entrance, lift access to every floor",
      "Disabled-access toilets on the ground and lower ground floor, plus a Changing Places facility",
      "Induction loops at the Welcome Desk, Templer Study Centre and Foyle Centre",
    ],
    source: "https://www.nam.ac.uk/plan-visit/access-and-equality",
  },
  "Horniman Museum and Gardens": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Fully accessible from the main public entrance, accessible toilets in Gallery Square",
      "Audio induction loop at the Ticket Desk",
      "Ear defenders available to borrow from the front desk (two sets)",
    ],
    source: "https://www.horniman.ac.uk/plan-your-visit/access/",
  },
  "Design Museum": {
    buckets: ["disability-friendly"],
    features: [
      "All areas accessible by lift (four lifts serving every floor)",
      "Wheelchair-accessible toilets on multiple levels",
    ],
    source: "https://designmuseum.org/plan-your-visit/access-information",
  },
  "The National Gallery": {
    buckets: ["disability-friendly"],
    features: [
      "Step-free entrances (Getty entrance, Roden Centre entrance, Sainsbury Wing)",
      "Disabled/ambulant toilets on the Ground Floor, lift access to galleries",
    ],
    source: "https://www.nationalgallery.org.uk/visiting/access",
  },
  ICA: {
    buckets: ["deaf-accessible"],
    features: [
      "Induction loop system at the Information & Sales desk and in the Cinemas",
    ],
    source: "https://www.ica.art/access",
  },
  "Whitechapel Gallery": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Passenger lift gives step-free access to all floors; wheelchairs available to borrow",
      "Hearing induction loops available on request",
    ],
    source: "https://www.whitechapelgallery.org/visit-2/access/",
  },
  "Queer Britain": {
    buckets: ["disability-friendly"],
    features: [
      "Step-free throughout, display cabinets at wheelchair height",
      "Two accessible toilets, loan wheelchairs available",
    ],
    source: "https://queerbritain.org.uk/visit",
  },
  "Autograph ABP": {
    buckets: ["disability-friendly"],
    features: [
      "Step-free street-level entrance, lift to all floors",
      "Accessible unisex toilets on all floors",
    ],
    source: "https://autograph.org.uk/visit-us/access-information/",
  },
  "Victoria and Albert Museum, South Kensington": {
    buckets: ["disability-friendly"],
    features: [
      "Cromwell Road and Exhibition Road entrances are step-free and wheelchair accessible",
      "Accessible toilets on levels 0, 1, 2 and 3, fitted with grab rails",
    ],
    source: "https://vam.ac.uk/info/disability-access",
  },
  "National Museum of Scotland": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Lifts and ramps to all floors",
      "Accessible toilets on all floors, Changing Places toilet in the Entrance Hall",
      "Induction loops at the Main/Tower Entrance info desks, Auditorium and Dunfermline Room",
    ],
    source: "https://www.nms.ac.uk/national-museum-of-scotland/plan-your-visit/accessibility",
  },
  "National Museum Cardiff": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Level access path to the entrance, self-operated glass lift, lift to all galleries",
      "Disability toilets including a Changing Places toilet with hoist",
      "Induction loops in the Evolution of Wales gallery, information desk, shop, restaurant and Reardon Smith Theatre",
    ],
    source: "https://museum.wales/cardiff/visit/accessibility-national-museum-cardiff/",
  },
  "Birmingham Museum & Art Gallery": {
    buckets: ["disability-friendly"],
    features: [
      "Step-free/lift access via the Gas Hall entrance on Edmund Street (the main Chamberlain Square entrance has steps)",
    ],
    source: "https://www.birminghammuseums.org.uk/birmingham-museum-and-art-gallery/visit/accessibility",
  },
  "Manchester Museum": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Ramped entrance from Oxford Road, lifts to all floors, level access to all public spaces",
      "Hearing loop at the reception desk",
    ],
    source: "https://www.museum.manchester.ac.uk/accessibility",
  },
  HOME: {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Step-free lift access to all three levels, all spaces (Gallery and Theatres) wheelchair accessible",
      "Audio induction loop at the Box Office, cinemas and theatres; Sennheiser infra-red amplification in theatres",
    ],
    source: "https://homemcr.org/access/",
  },
  "Kelvingrove Art Gallery and Museum": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Level entrance on Argyle Street, lifts to all public areas",
      "Accessible toilets on all floors",
      "Hearing loop within the venue",
    ],
    source: "https://www.glasgowlife.org.uk/museums/venues/kelvingrove-art-gallery-and-museum",
  },
  "Gallery of Modern Art (GoMA)": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Ramped access, accessible toilets",
      "Assistive listening system",
    ],
    source: "https://www.glasgowlife.org.uk/museums",
  },
  "The Burrell Collection": {
    buckets: ["disability-friendly"],
    features: ["Completely step-free"],
    source: "https://www.glasgowlife.org.uk/museums",
  },
  "V&A Dundee": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Step-free main entrance with automatic doors, spacious lifts throughout",
      "Induction loops in all teaching spaces and learning suites, and wherever staff give information",
    ],
    source: "https://www.vam.ac.uk/dundee/visit",
  },
  Arnolfini: {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Level access from Prince Street and Narrow Quay, lifts to all floors",
      "Accessible toilets on floors -1, 0 and 2",
      "Quieter 1-2pm slot Tue/Wed/Thu, plus relaxed exhibition openings for visitors needing a quieter visit",
    ],
    source: "https://arnolfini.org.uk/plan-your-visit/accessibility/",
  },
  "Spike Island": {
    buckets: ["disability-friendly"],
    features: [
      "Street-level, step-free main entrance and reception",
      "Wheelchair-accessible entrance, café, gallery and toilets; lift to first/mezzanine floors",
    ],
    source: "https://www.spikeisland.org.uk/plan-your-visit/access-guide/",
  },
  "The Hepworth Wakefield": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Step-free access throughout via ramps/slopes",
      "Fixed induction loops at the Welcome Desk, Café and Auditorium",
    ],
    source: "https://hepworthwakefield.org/your-visit/access/",
  },
  "Yorkshire Sculpture Park": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free level access throughout, wide paths, mobility scooters to hire",
      "Portable hearing loop, staff trained to use it",
      "Ear defenders (child and adult) available to borrow from the Information Desk",
    ],
    source: "https://ysp.org.uk/visit-us/accessibility",
  },
  "The Fitzwilliam Museum": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Step-free ground floor galleries, café and shop; Courtyard Entrance with lift to all floors",
      "Portable hearing loop available on request for talks and events",
    ],
    source: "https://fitzmuseum.cam.ac.uk/plan-your-visit/accessibility-and-facilities",
  },
  Fruitmarket: {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free access, all spaces wheelchair accessible, three accessible toilets",
      "Portable hearing loop with headsets available to borrow",
      "Sensory backpacks available",
    ],
    source: "https://www.fruitmarket.co.uk/accessibility/",
  },
  "Sainsbury Centre": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Step-free level-access entrances, lift to the mezzanine, lift/ramp to the basement",
      "Sensory backpacks available",
    ],
    source: "https://sainsburycentre.ac.uk/visit-us/",
  },
  "mac Birmingham": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Step-free access, accessible toilets, Blue Badge parking",
      "Fixed and infra-red hearing loop systems at the Welcome Desk, MAC Bar, KILN Café and all indoor performance venues",
    ],
    source: "https://macbirmingham.co.uk/visit/access/venue-access-guide",
  },
  "DCA (Dundee Contemporary Arts)": {
    buckets: ["disability-friendly"],
    features: ["Level or lift access to all public areas of the building"],
    source: "https://www.dca.org.uk/plan-your-visit/accessibility/",
  },
  "New Art Exchange": {
    buckets: ["deaf-accessible"],
    features: ["Building fitted with induction loops"],
    source: "https://www.nae.org.uk/visit-us/access-information/",
  },
  "Museum of the Home": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free access to all galleries; small passenger lifts and a vertical platform lift to the Gardens Through Time",
      "Accessible toilet in reception plus two more across the museum",
      "Induction loops at Reception, Studio, Learning Pavilion and Georgian Suite",
      "Child-sized ear defenders and sensory-toy backpacks available to borrow from Reception",
    ],
    source: "https://www.museumofthehome.org.uk/visit/access/",
  },
  "Pallant House Gallery": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Street-level main entrance via automatic doors; large lift from reception to all levels",
      "Two accessible toilets on the ground floor, one with a level-access shower",
      "Induction loop at the Welcome Desk, Room 11 and the Studio",
    ],
    source: "https://pallant.org.uk/your-visit/access/",
  },
  "Serpentine Galleries": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Step-free access, all spaces wheelchair accessible, wheelchair to borrow at each gallery",
      "Wheelchair-accessible/gender-neutral toilets at both galleries",
      "Relaxed hours with reduced sensory stimulation",
    ],
    source: "https://www.serpentinegalleries.org/visit/facilities-access/",
  },
  "Serpentine North Gallery": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Step-free access, all spaces wheelchair accessible, wheelchair to borrow at each gallery",
      "Wheelchair-accessible/gender-neutral toilets at both galleries",
      "Relaxed hours with reduced sensory stimulation",
    ],
    source: "https://www.serpentinegalleries.org/visit/facilities-access/",
  },
  "Serpentine South Gallery": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Step-free access, all spaces wheelchair accessible, wheelchair to borrow at each gallery",
      "Wheelchair-accessible/gender-neutral toilets at both galleries",
      "Relaxed hours with reduced sensory stimulation",
    ],
    source: "https://www.serpentinegalleries.org/visit/facilities-access/",
  },
  "Sir John Soane's Museum": {
    buckets: ["deaf-accessible"],
    features: [
      "Induction loops at the front desk and in the shop, plus portable loops for booked seated lectures/talks",
      "A British Sign Language tour film is available",
    ],
    source: "https://www.soane.org/visit/accessibility",
  },
  "Fashion and Textile Museum": {
    buckets: ["disability-friendly"],
    features: [
      "Step-free entrance with a ramp to the ticket desk, wheelchair-accessible lift to the mezzanine",
      "Wheelchair-accessible toilets on the ground floor",
    ],
    source: "https://fashiontextilemuseum.org/visit/access/",
  },
  "Attenborough Arts Centre": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Ramped entrance and lift, all public areas wheelchair accessible",
      "Four wheelchair-accessible toilets across ground and first floor",
      "Induction loop hearing system in all rooms; a number of events are BSL-interpreted and staff have basic BSL/Deaf-awareness training",
      "Relaxed-performance option with muted lighting, quieter audio and freedom to make noise",
    ],
    source: "https://attenborougharts.com/accessibility/",
  },
  "Golden Thread Gallery": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free wheelchair access to the upper floor via an accessible lift",
      "Level-access accessible toilet",
      "Portable hearing loop system",
      "Ear defenders to borrow, plus sensory information published for every exhibition",
    ],
    source: "https://goldenthreadgallery.co.uk/accessibility/",
  },
  "Herbert Art Gallery & Museum": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Level access to each gallery floor, lift between floors",
      "Accessible toilets on ground and first floors",
      "Sensory backpacks available to support visitors",
    ],
    source: "https://www.theherbert.org/visiting/accessibility.aspx",
  },
  Firstsite: {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Street-level, step-free access throughout; a wheelchair available first-come first-served",
      "Three accessible toilets",
      "Hearing loops in the cinema, meeting rooms and learning spaces; Hard of Hearing film screenings",
    ],
    source: "https://firstsite.uk/your-visit/access-and-facilities/",
  },
  "FACT Liverpool": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Level/ramp access to the building, all areas including screens and galleries wheelchair accessible",
      "Accessible toilets on the ground, first and second floors",
      "Personal induction-loop body packs for hearing aid users ('T' setting)",
      "Sensory bags with ear defenders and PECS cards; relaxed screenings with lights up and lower volume",
    ],
    source: "https://www.fact.co.uk/visit/accessibility",
  },
  Gasworks: {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Wheelchair-accessible ground-floor entrance; lift to studios on the first and second floors",
      "All-gender accessible toilet with baby changing on the ground floor",
      "Quiet times for neurodivergent audiences available on request, with lowered lights and reduced audio volume",
    ],
    source: "https://gasworks.org.uk/accessibility/",
  },
  "De La Warr Pavilion": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Ramped front entrance, lift to all floors, two travel wheelchairs available",
      "Disabled toilets on two floors",
      "Induction loop in the auditorium (flag when booking)",
      "Sensory bags with ear defenders, fidget toys and a magnifying glass available from the ground or first floor gallery",
    ],
    source: "https://www.dlwp.com/visit-us/accessibility/",
  },
  "Factory International": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free access routes throughout all public areas, touch-to-open automatic doors at both entrances",
      "Accessible toilets on all public levels bar one, plus a Changing Places facility with tracking hoist",
      "Auracast-enabled 'Auri' broadcast system in both performance spaces, with borrowable receivers/induction neck loops",
      "A Chill Out Space with weighted blankets, fidget toys and ear defenders; sensory kits to borrow",
    ],
    source: "https://factoryinternational.org/aviva-studios/access/",
  },
  "Hastings Contemporary": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Wheelchair-accessible building, step-free with a lift serving both floors; two wheelchairs available to book",
      "Accessible toilet on the ground floor",
      "Ear defenders and sensory bags available to borrow",
    ],
    source: "https://www.hastingscontemporary.org/visit/",
  },
  "The Bowes Museum": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Lift and stairs to all floors; wheelchairs and portable folding stools available free of charge",
      "Accessible toilets on ground and first floors",
      "Audio induction loops fitted at reception and the shop/café tills, plus portable loops on all three floors",
    ],
    source: "https://thebowesmuseum.org.uk/visit/access-for-all/",
  },
  Fabrica: {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Ramped access at the Duke Street entrance (temporary ramp at Ship Street)",
      "Two wheelchair-accessible toilets, sized for a mobile hoist",
      "A designated private quiet space provided for some exhibitions, with other accommodations for complex needs on request",
    ],
    source: "https://fabrica.org.uk/accessibility",
  },
  "Henry Moore Institute": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Accessible lift entrance from Cookridge Street to the ground floor",
      "Three gender-neutral accessible toilets",
      "Induction loops at the welcome desk, library reception, the Studio and the seminar room",
      "A quiet space off the Studio on the second floor",
    ],
    source: "https://henry-moore.org/henry-moore-institute/plan-your-visit-to-the-henry-moore-institute/accessibility-henry-moore-institute/",
  },
  "Young V&A": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free access to all public areas; wheelchairs bookable 24 hours ahead or on request at the Welcome Desk",
      "Accessible toilet (with ceiling track hoist) on the lower-ground floor",
      "Induction loops at the Welcome Desk, most interactives and event spaces",
      "A quiet space (the Reading Room) on the lower-ground floor, plus Sensory Design Bags and tactile books",
    ],
    source: "https://www.vam.ac.uk/info/access-at-young-va",
  },
  "V&A East Storehouse": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free access to all public areas, lifts to all floors",
      "Accessible toilets on the ground, second and third floors",
      "Induction loop at the café counter; Auracast system used elsewhere; BSL captions on all films with speech",
      "A designated quiet space; ear defenders and wheelchairs to borrow",
    ],
    source: "https://www.vam.ac.uk/info/access-at-east-storehouse/",
  },
  "Tate Liverpool": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "No steep gradients on approaches, level access to the gallery, wheelchairs to borrow",
      "Accessible toilet behind gallery 2 on the first floor",
      "A quiet space on request; ear defenders to borrow from the front desk",
    ],
    source: "https://www.tate.org.uk/visit/tate-liverpool",
  },
  "Tate St Ives": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Ramped main entrance, lift access, level access to most areas; three wheelchairs to reserve",
      "A fully accessible Changing Places toilet, plus another accessible toilet near Gallery 6",
      "Hearing loops fitted at the Information desks, also available on most talks/tours",
      "Ear defenders to borrow, plus a visual story and communication cards for neurodivergent visitors",
    ],
    source: "https://www.tate.org.uk/visit/tate-st-ives",
  },
  "Aberdeen Art Gallery": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Automatic-door entrance, accessible lift to all floors and level access to all spaces, two wheelchairs to borrow",
      "Gendered and non-gendered toilets on every floor, plus a Changing Places toilet on Level 2",
      "Induction hearing loops at the Welcome Desk, ground-floor café servery and Cowdray Hall; a Deaf-led BSL tour",
      "Sensory bags from the front desk; a quiet space in the McBey Library",
    ],
    source: "https://sites.aberdeencity.gov.uk/AAGM/plan-your-visit/access",
  },
  "St Fagans National Museum of History": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Level access to the building and site; manual wheelchairs free from the welcome desk",
      "Accessible toilets downstairs in the main building and at the Weston Centre; two Changing Places facilities",
      "Induction loops at the welcome desk, museum shop and Weston Centre reception",
    ],
    source: "https://museum.wales/stfagans/visit/accessibility-st-fagans-national-history-museum/",
  },
  "National Waterfront Museum": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Step-free entrances with automatic/push-button doors; most lifts wheelchair accessible with audio announcements",
      "Accessible toilets on both floors, plus Changing Places facilities",
      "Induction loops (T-setting) at the Welcome Desk, shop and café counters",
      "A ground-floor quiet room, sensory backpacks to borrow, and a weekly Monday 3-4pm relaxed quiet hour",
    ],
    source: "https://museum.wales/swansea/visit/accessibility-national-waterfront-museum/",
  },
  "National Wool Museum": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Both entrances step-free; most lifts wheelchair/mobility-scooter accessible with audio announcements",
      "Accessible toilets off the main reception and in the Resource and Collections Centre",
      "Induction loops (T-setting) at the information desk, shop and café counters",
      "Sensory backpacks to borrow; a quiet sitting area upstairs near the Village mural",
    ],
    source: "https://museum.wales/wool/visit/accessibility-national-wool-museum/",
  },
  "National Roman Legion Museum": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Level glass-door entrance for wheelchair users; portable ramp for slight internal floor-level changes",
      "Two accessible toilets (standard wheelchair size)",
      "Induction loop for hearing aids at the Welcome Desk",
      "Sensory backpacks with sound-cancelling headphones/fidget toys; a monthly relaxed quiet hour",
    ],
    source: "https://museum.wales/roman/visit/accessibility-national-roman-legion-museum/",
  },
  "National Slate Museum": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Level, step-free main entrance from Padarn Country Park (the Pattern Loft is stairs-only and not wheelchair accessible)",
      "Accessible toilet at the Ffowntan Café with a pull-cord alarm",
      "Induction loops in the Cinema, Exhibition room, Slate Splitting Area, Shop and Café",
      "Sensory backpacks from the learning room or welcome desk",
    ],
    source: "https://museum.wales/slate/visit/accessibility-national-slate-museum/",
  },
  "Big Pit National Coal Museum": {
    buckets: ["disability-friendly", "deaf-accessible", "autistic-friendly"],
    features: [
      "Level entrance and access for most buildings (some internal ramps are long/steep; assistance may be needed)",
      "Accessible toilets on all three levels",
      "Induction loops for hearing aids in the Reception and Enquiries building",
      "A limited number of sensory backpacks with sound-cancelling headphones and fidget toys",
    ],
    source: "https://museum.wales/bigpit/visit/accessibility-big-pit/",
  },
  Bluecoat: {
    buckets: ["deaf-accessible"],
    features: [
      "Induction loops fitted in Tickets & Information, Espresso, the Performance Space and the Sandon Room",
    ],
    source: "https://www.thebluecoat.org.uk/plan-your-visit/accessibility",
  },
  "Hunterian Art Gallery": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Ramp to the ground floor, lift to the basement and Gallery 2",
      "Sensory bags/aprons with ear defenders, fidget toys and colour-changing glasses",
    ],
    source: "https://www.gla.ac.uk/hunterian/accessibility/",
  },
  // Third research pass (2026-08-30)
  "V&A East Museum": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Two step-free, wheelchair-accessible entrances",
      "Passenger lifts on each floor",
      "Accessible toilets on each floor",
      "Wheelchairs available to borrow (book 24h ahead)",
      "A private quiet space available for anyone who needs it",
    ],
    source: "https://www.vam.ac.uk/east/museum/visit",
  },
  "Holburne Museum": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "Level access to the automatic front door, lift to all floors",
      "Wheelchair-accessible toilet on the ground floor, more via the lift",
      "Hearing induction loop at Reception, in the Picture Gallery and the Clore Learning Space",
      "Wheelchairs available to pre-book",
    ],
    source: "https://www.holburne.org/plan-your-visit/access/",
  },
  "The New Art Gallery Walsall": {
    buckets: ["disability-friendly"],
    features: [
      "Street-level access with automatic doors",
      "Lift access to all floors",
      "Three accessible toilets (Ground, Floor 1, Floor 4)",
      "Two manual wheelchairs available to borrow",
    ],
    source: "https://thenewartgallerywalsall.org.uk/visit/access",
  },
  "The Photographers' Gallery": {
    buckets: ["disability-friendly", "deaf-accessible"],
    features: [
      "DDA-compliant building with a lift to all floors",
      "Wheelchair-accessible toilets on the third and fifth floors",
      "Free BSL-led/interpreted exhibition tours programmed regularly",
    ],
    source: "https://thephotographersgallery.org.uk/accessibility",
  },
  "South London Gallery": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Step-free access throughout the gallery spaces, Clore Studio, café and gardens",
      "Accessible toilets by the Main Gallery, café, Clore Studio and Fire Station",
      "Folding wheelchair available to borrow",
      "Free sensory bags (ear defenders, fidget toys) at the Main Gallery and Fire Station; a quiet space available on request",
    ],
    source: "https://www.southlondongallery.org/visit/access/",
  },
  "Victoria Art Gallery": {
    buckets: ["disability-friendly", "autistic-friendly"],
    features: [
      "Ramped Bridge Street entrance with automatic doors",
      "Lift to the Upper Gallery",
      "Sensory bag available (ear defenders, fidget toys)",
      "Monthly Relaxed Hours (first Saturday, 9.30-10.30am) for a quieter visit",
    ],
    source: "https://www.victoriagal.org.uk/accessibility",
  },
  // Same physical building as "Bluecoat" (see lib/sources/bluecoat.ts) —
  // lib/sources/dadafest.ts uses "The Bluecoat" as its own VENUE.name
  // (confirmed against the address on live DaDaFest event pages), which is
  // a different lookup key, so it needs its own entry with the same data
  // rather than being silently unmatched.
  "The Bluecoat": {
    buckets: ["deaf-accessible"],
    features: [
      "Induction loops fitted in Tickets & Information, Espresso, the Performance Space and the Sandon Room",
    ],
    source: "https://www.thebluecoat.org.uk/plan-your-visit/accessibility",
  },
};

export function venueAccessibilityMatches(
  venueName: string | null | undefined
): BucketMatch[] {
  if (!venueName) return [];
  const entry = VENUE_ACCESSIBILITY[venueName];
  if (!entry) return [];
  return entry.buckets.map((bucketSlug) => ({
    bucketSlug,
    confidence: 0.95,
    evidence: entry.features.join("; "),
  }));
}
