// The `community-culture` bucket ("Culture & Lates") — the second way into
// the public feed, alongside identity buckets (docs/INGESTION_EXPANSION_PLAN.md
// Phase 2, decision C):
//
//   1. Format: the event's own title says it's a Late, an artist talk, a
//      community screening, a zine fair... — small-scale culture whoever
//      it's for. Matched from the event's own copy only.
//   2. Source: it comes from a curated community-anchored source — a small,
//      community-rooted venue or organiser whose whole programme fits.
//
// Never applied to a 'large' event (lib/scale.ts) — runClassification skips
// it, and lib/public-gate.ts hides large events regardless.
//
// Confidence: 0.9 for Lates, 0.85 otherwise — both clear the 0.8 public
// gate but stay under the 0.95 auto-approve bar, so every tag is still
// visible in /admin/review for a moderator to reject.

import type { BucketMatch } from "@/lib/buckets";
import { eventbriteOrganiserId, type SourceMissionLookup } from "@/lib/source-missions";

const SLUG = "community-culture" as const;
const LATE_CONFIDENCE = 0.9;
const FORMAT_CONFIDENCE = 0.85;
const SOURCE_CONFIDENCE = 0.85;

// "Tate Modern Late", "LATE at Kettle's Yard", "Soane Late: ...",
// "Holburne Up Late", "Wellcome Collection Lates", "Museum Late: ...".
// Title only — "late" in a description is almost always ordinary English.
const LATE_TITLE = /\b(?:up late|lates?)\b/i;
// Titles where "late" is not a museum/gallery Late (all seen in live data or
// obvious): bar crawls, "late night" club/drinks nights, art-historical
// periods, and "late" as plain timing.
const NOT_A_LATE =
  /\bbar crawl\b|\blate[- ]night (?:bar|drinks|club|party|rave|comedy|dj)\b|\blate (?:medieval|antique|antiquity|bronze|iron|roman|georgian|victorian|period|style|works|gothic|romantic|renaissance|modern(?:ism|ist)?)\b|\blate (?:checkout|breakfast|entry|arrival|booking)s?\b|\bto late\b|\bfrom late\b/i;

// Formats that are inherently small-scale culture. Title only: in
// descriptions these phrases often mean something else ("the works are in
// conversation with...").
const TITLE_FORMATS = [
  "artist talk",
  "artist's talk",
  "artists' talk",
  "in conversation",
  "curator talk",
  "curator's talk",
  "book launch",
  "zine fair",
  "zine workshop",
  "zine making",
  "open studio",
  "reading group",
  "book club",
  "community screening",
  "film club",
  "poetry night",
  "open mic",
  "spoken word",
  "life drawing",
  "ceilidh",
  "supper club",
  "skill share",
  "skillshare",
  "makers market",
  "maker's market",
  "makers' market",
  "craft fair",
  "community choir",
  "print fair",
];

// Unambiguous enough to also match in a description.
const DESCRIPTION_FORMATS = ["museum late", "gallery late", "late opening", "late-night opening", "book launch", "zine fair", "open mic", "life drawing class", "poetry night"];

function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`, "i");
}
const TITLE_FORMAT_RES = TITLE_FORMATS.map((p) => [p, phraseRegex(p)] as const);
const DESCRIPTION_FORMAT_RES = DESCRIPTION_FORMATS.map((p) => [p, phraseRegex(p)] as const);

/** Format-based match from the event's own copy (rule 1). */
export function communityCultureFormatMatch(title: string, description: string | null): BucketMatch | null {
  const lateMatch = title.match(LATE_TITLE);
  if (lateMatch && !NOT_A_LATE.test(title)) {
    return { bucketSlug: SLUG, confidence: LATE_CONFIDENCE, evidence: `title: "${lateMatch[0]}"` };
  }
  for (const [phrase, re] of TITLE_FORMAT_RES) {
    if (re.test(title)) return { bucketSlug: SLUG, confidence: FORMAT_CONFIDENCE, evidence: `title: ${phrase}` };
  }
  if (description) {
    for (const [phrase, re] of DESCRIPTION_FORMAT_RES) {
      if (re.test(description)) {
        return { bucketSlug: SLUG, confidence: FORMAT_CONFIDENCE, evidence: `description: ${phrase}` };
      }
    }
  }
  return null;
}

// Rule 2 — curated community-anchored sources. Same curation bar as
// lib/source-missions.ts: a recorded basis, nothing on a hunch. Small,
// community-rooted spaces only; big institutions (Tate, Barbican, V&A,
// National Gallery...) are deliberately absent — their individual events
// qualify through rule 1 instead.

/** Keyed by events.source_provider. */
export const COMMUNITY_ANCHORED_PROVIDERS: Record<string, string> = {
  gasworks: "artist-led studios and gallery, Vauxhall",
  hope93: "independent community gallery and events space",
  cubitt: "artist-run studios and gallery, Islington",
  "spike-island": "artist studios and gallery, Bristol",
  "street-level-photoworks": "community photography centre, Glasgow",
  "golden-thread-gallery": "artist-led gallery, Belfast",
  "brixton-house": "community theatre (successor to Ovalhouse), spaces under 300",
  "yard-theatre": "independent theatre, Hackney Wick, ~250 seats",
  "migration-museum": "small community museum, Lewisham",
  "october-gallery": "small independent gallery, Holborn",
  fabrica: "small contemporary art gallery, Brighton",
  ibraaz: "independent arts platform, small gallery",
  "south-london-gallery": "free community-focused gallery, Peckham",
  "attenborough-arts": "inclusive community arts centre, Leicester",
  "mac-birmingham": "community arts centre, Cannon Hill Park",
  "198-gallery": "community arts centre for artists of colour, Herne Hill",
  autograph: "small photography gallery, Shoreditch",
  "africa-centre": "community arts and culture centre, Southwark",
  "new-art-exchange": "community arts centre, Nottingham",
  "queer-britain": "small community museum, King's Cross",
  "shape-arts": "disability-led arts organisation",
  dadafest: "disability and Deaf arts organisation",
  "bio-link": "curated independent creators (lib/sources/bio-link-seeds.ts)",
  // Phase 4 platform venues (lib/sources/platform-venues.ts). Left out on
  // purpose: Broadway, Hyde Park Picture House and QUAD (indie cinemas whose
  // weeks are mostly mainstream releases — their Q&As, film clubs and Lates
  // still qualify by format), Kiln (292 seats, a receiving house), The Place
  // (mostly classes), Contact (main house ~300), The MAC (panto and touring),
  // Tyneside Cinema (as the cinemas above), Soho Theatre (commercial comedy
  // club), Battersea Arts Centre (Grand Hall ~600) and artsdepot (main
  // house ~395).
  "chats-palace": "community arts centre, Homerton",
  housmans: "radical bookshop, talks and book launches, King's Cross",
  "the-stove": "artist-led community arts network, Dumfries",
  "wharf-chambers": "workers' co-operative members' club and venue, Leeds",
  "rich-mix": "independent community arts centre, Bethnal Green",
  artsadmin: "artist-led organisation, Toynbee Studios",
  "bishopsgate-institute": "independent library and archive: talks, tours, classes",
  theatre503: "new-writing theatre above a pub, ~60 seats",
  "bush-theatre": "new-writing theatre, ~180 seats",
  "tobacco-factory-theatres": "independent theatre, ~250 seats, Bristol",
  "exeter-phoenix": "community arts centre, Exeter",
  "camden-peoples-theatre": "fringe theatre for new and local work, ~60 seats",
  "the-albany": "community arts centre, Deptford",
  "arcola-theatre": "independent community theatre, Dalston",
  "jacksons-lane": "community arts centre, Highgate",
  "omnibus-theatre": "independent theatre, ~100 seats, Clapham",
  "park-theatre": "independent theatre, 200 + 90 seats, Finsbury Park",
  "southwark-playhouse": "independent theatre, Elephant & Castle",
};

/** Keyed by Eventbrite organiser id (lib/sources/eventbrite-organisers.ts).
 *  Organisers left out: institutions (Instituto Cervantes, LSE, Manchester
 *  China Institute, British Library), venue hire/commercial (Birmingham
 *  Black Box Theatre, Battersea Power Station, Wakuda), and festivals
 *  (Barking Riverside). Organisers with an identity mission already pass
 *  the gate through it and don't need listing here. */
export const COMMUNITY_ANCHORED_EVENTBRITE: Record<string, string> = {
  "37469169963": "Skate Gals & Pals: community skate collective",
  "52102481093": "Dear Asia: ESEA community events",
  "2142778181": "Akwaaba UK: community social centre",
  "55057129863": "Asian Leadership Collective: community network",
  "7546982647": "Anglo-Ethiopian Society: community society",
  "8507776452": "Voices Beyond Gospel Collective: community choir",
  "51485733873": "Nourishment: community events",
  "13374735341": "Hoopla Impro: small improv club nights and classes",
  "45275655503": "Rain On Me: community events",
  "78943935183": "The Meals Collective: community supper clubs",
  "46661055893": "Mile Rainbow C.I.C: community interest company",
  "121617085788": "Mother Tongue: community events",
  "121167621408": "Femme Circle London: community circle",
  "26471263771": "Merton Libraries: free library programme",
  "20103751021": "Grand Junction: community arts venue, Paddington",
  "120923991856": "Monolithic Studio: independent studio events",
  "31107759633": "Oya Heart Warrior: community wellbeing events",
  "14605628700": "Tony Cealy: independent artist",
  "108729317521": "Itonisha Rowe: independent artist",
  "54402358323": "Hypha Studios: artist-led spaces in empty buildings",
  "105544176521": "Aswatna Studio: independent studio",
  "10830367574": "Feminist Library: volunteer-run community library",
  "6347401953": "MARSM UK: Arab & North African community culture",
  "121118620788": "Playing Outside: independent maker market",
};

/** Source-based match (rule 2). */
export function communityCultureSourceMatch(lookup: SourceMissionLookup): BucketMatch | null {
  if (lookup.organiserSourceType === "eventbrite") {
    const id = eventbriteOrganiserId(lookup.organiserProfileUrl);
    const basis = id ? COMMUNITY_ANCHORED_EVENTBRITE[id] : undefined;
    if (basis) return { bucketSlug: SLUG, confidence: SOURCE_CONFIDENCE, evidence: `community-anchored source — ${basis}` };
  }
  const basis = COMMUNITY_ANCHORED_PROVIDERS[lookup.sourceProvider];
  return basis ? { bucketSlug: SLUG, confidence: SOURCE_CONFIDENCE, evidence: `community-anchored source — ${basis}` } : null;
}
