// Mission-based bucket tags: buckets an event inherits from the stated
// purpose of the curated organiser or community venue that published it.
//
// Why this exists: lib/buckets.ts only matches explicit signal in an event's
// own title/description, but community organisers rarely restate who they
// are in every listing — a Black Girls Hike walk is described as "a 10km
// loop around Box Hill", not "a hike for Black women". Before this module,
// curated sources like Black South West Network (8 live events) and Black
// Girls Hike (7) had zero events passing the gate.
//
// Relationship to docs/PROJECT_PLAN.md §9 ("never infer identity from an
// organiser's name"): that rule is about guessing from arbitrary organisers.
// Every entry here is a hand-curated source whose *published* name or
// mission statement explicitly names the community — that is explicit
// signal, just published at the organiser level instead of the event level.
// Do not add an entry on a hunch, from an individual's name, or from a
// word that is ambiguous in context ("Black Box" theatre, "Asian" alone).
//
// Confidence:
//   0.9  — the organisation's own name states the community explicitly.
//   0.85 — stated in the organisation's published mission/about text
//          (recorded in `basis`), not its name.
// Both clear lib/buckets.ts's HIGH_CONFIDENCE_THRESHOLD (0.8), so tagged
// events go public, but both stay below AUTO_APPROVE_THRESHOLD (0.95), so
// each row still appears in /admin/review where a moderator can reject it
// for a specific event the mission doesn't fit (e.g. a generic venue hire).
//
// Access-only buckets (disability-friendly, deaf-accessible, ...) are
// allowed here as enrichment, but per lib/buckets.ts's ACCESS_ONLY_BUCKETS
// they never make an event public on their own.

import type { BucketMatch, BucketSlug } from "@/lib/buckets";

type MissionBucketSlug = Exclude<BucketSlug, "free-entry" | "low-income-access">;

export interface SourceMission {
  buckets: MissionBucketSlug[];
  confidence: 0.9 | 0.85;
  /** Why: "name: ..." when the name itself states it, else the mission wording/source. */
  basis: string;
}

// Keyed by Eventbrite organiser id (see lib/sources/eventbrite-organisers.ts).
// Organisers deliberately left out (no community stated in name/mission, or
// ambiguous): Instituto Cervantes (Spain, not Latinx), Dear Asia, Akwaaba UK,
// Asian Leadership Collective, Anglo-Ethiopian Society, LSE Latin America
// and Caribbean Centre, Manchester China Institute (academic programmes),
// Birmingham Black Box Theatre ("black box" is a theatre format), Skate
// Gals & Pals, Femme Circle London, Feminist Library, MENA Arts UK / MARSM
// UK (no MENA bucket exists yet), individual artists, and general
// venues/markets/libraries.
export const EVENTBRITE_ORGANISER_MISSIONS: Record<string, SourceMission> = {
  "11347103582": { buckets: ["black"], confidence: 0.9, basis: "name: Black Ballad" },
  "37663218863": { buckets: ["queer"], confidence: 0.9, basis: "name: London LGBTQ+ Community Centre" },
  "48548878793": { buckets: ["queer", "latinx"], confidence: 0.9, basis: "name: Exilio LGBTQ+ Latinx Party" },
  "32367103763": { buckets: ["black"], confidence: 0.9, basis: "name: Black Minds Matter" },
  "29636506451": { buckets: ["black"], confidence: 0.9, basis: "name: Black Girls Hike CIC" },
  "26461743593": { buckets: ["black"], confidence: 0.9, basis: "name: Black Culture Market" },
  "68181723383": { buckets: ["black"], confidence: 0.9, basis: "name: Black Pub Quiz" },
  "11899923421": { buckets: ["black"], confidence: 0.85, basis: "mission: BYP = Black Young Professionals Network" },
  "43436027623": { buckets: ["black", "queer"], confidence: 0.9, basis: "name: Dope Black Queers" },
  "21020223735": { buckets: ["black", "womxn-led"], confidence: 0.9, basis: "name: Coding Black Females" },
  "17255335716": { buckets: ["black"], confidence: 0.9, basis: "name: UK Black Business Week & Show" },
  "11345718957": { buckets: ["black"], confidence: 0.9, basis: "name: Black South West Network" },
  "114770088981": { buckets: ["black"], confidence: 0.9, basis: "name: Black in Fintech" },
  "6817237943": { buckets: ["latinx"], confidence: 0.85, basis: "mission: Latin Elephant, Latin American community organisation" },
  "20081526531": { buckets: ["latinx", "womxn-led"], confidence: 0.9, basis: "name: Latin American Women's Rights Service" },
  "34414600611": { buckets: ["latinx"], confidence: 0.9, basis: "name: FILMLOCOS (Latin American Creatives)" },
  "28006687021": { buckets: ["latinx"], confidence: 0.9, basis: "name: La Linea Latin Music Festival" },
  "27216359183": { buckets: ["latinx"], confidence: 0.9, basis: "name: Latino Life UK" },
  "17398079980": { buckets: ["black"], confidence: 0.85, basis: "mission: Ubele Initiative, African diaspora-led community organisation" },
  "15389742341": { buckets: ["black"], confidence: 0.9, basis: "name: Black Girl Fest" },
  "31779821363": { buckets: ["queer", "south-asian"], confidence: 0.85, basis: "mission: Club Kali, LGBTQ+ South Asian club night" },
  "81453439603": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: Korean Cultural Centre UK" },
  "14758260697": { buckets: ["black"], confidence: 0.9, basis: "name: The New Black Film Collective" },
  "15315822499": { buckets: ["black"], confidence: 0.9, basis: "name: Black Comedy UK" },
  "17316640869": { buckets: ["black"], confidence: 0.85, basis: "name: Caribbean Party UK (Caribbean diaspora, as lib/buckets.ts)" },
  "1419200345": { buckets: ["south-asian", "womxn-led"], confidence: 0.9, basis: "name: South Asian Women's Creative Collective" },
  "36744049403": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: Hong Kong Cultural Community C.I.C." },
  "38513509523": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: Trafford Hongkongers CIC" },
  "78188070913": { buckets: ["black"], confidence: 0.9, basis: "name: Black Marketplace UK" },
  "120708302526": { buckets: ["latinx"], confidence: 0.9, basis: "name: London Latino Film Festival" },
  "50945458233": { buckets: ["south-asian"], confidence: 0.9, basis: "name: The Great Nepali Diaspora" },
  "109370987991": { buckets: ["black"], confidence: 0.85, basis: "name: UK Zambian Events (African diaspora)" },
  "114613520621": { buckets: ["black"], confidence: 0.85, basis: "name: Ethiopian Community in Britain (African diaspora)" },
  "8593033100": { buckets: ["black"], confidence: 0.85, basis: "name: Eritrean Diaspora Network (African diaspora)" },
  "36437367553": { buckets: ["black"], confidence: 0.9, basis: "name: Black Muslim Collective UK" },
  "30904174443": { buckets: ["black", "womxn-led"], confidence: 0.9, basis: "name: The Black Muslim Women Healing Collective" },
  "37930889533": { buckets: ["black"], confidence: 0.9, basis: "name: The Black Muslim Awards" },
  "7292292207": { buckets: ["black"], confidence: 0.85, basis: "mission: Windrush Foundation, African-Caribbean heritage" },
  "26081441987": { buckets: ["queer", "south-asian"], confidence: 0.9, basis: "name: Sarbat (Sikh LGBTQ+)" },
  "46463029343": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: UK Taiwanese Chamber of Commerce" },
  "89864447383": { buckets: ["latinx"], confidence: 0.9, basis: "name: Organization of Latin American Students" },
  "533877162": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: esea contemporary" },
  "12777156366": { buckets: ["black"], confidence: 0.9, basis: "name: UK Black Tech" },
  "59721241693": { buckets: ["black"], confidence: 0.9, basis: "name: Black History Film Festival" },
  "63507571763": { buckets: ["black", "deaf-accessible"], confidence: 0.9, basis: "name: Black Deaf UK" },
  "86992090653": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: Vietnamese Family Partnership" },
  "2638283608": { buckets: ["black"], confidence: 0.9, basis: "name: African Histories Revisited" },
  "121562149910": { buckets: ["south-asian"], confidence: 0.9, basis: "name: The South Asian Textiles Collective" },
  "2849465606": { buckets: ["black"], confidence: 0.9, basis: "name: Black History Walks" },
  "21728722753": { buckets: ["sober-friendly", "womxn-led"], confidence: 0.9, basis: "name: Sober Girl Society" },
  "7299335165": { buckets: ["disability-friendly"], confidence: 0.9, basis: "mission: Shape Arts, disability-led arts organisation" },
  "18317789304": { buckets: ["deaf-accessible"], confidence: 0.9, basis: "mission: Deaf Rave, Deaf-led music events" },
  "112394878081": { buckets: ["poc"], confidence: 0.85, basis: "curation note: POC-owned-business pop-up market" },
};

// Keyed by BioLinkSeed.handle (lib/sources/bio-link-seeds.ts), which
// lib/sources/bio-link.ts stores as the organiser name.
export const BIO_LINK_MISSIONS: Record<string, SourceMission> = {
  "@junegivannifilmarchive": { buckets: ["black"], confidence: 0.85, basis: "bio: African and African diaspora cinema" },
  "@blackcuratorscollective": { buckets: ["black", "womxn-led"], confidence: 0.9, basis: "bio: collective for Black women and non-binary curators" },
  "@blackcommsnetwork": { buckets: ["black"], confidence: 0.9, basis: "name: Black Comms Network" },
  "@blackgrowthuk": { buckets: ["black"], confidence: 0.9, basis: "name: Black Growth UK" },
  "@eseacommunitycentre": { buckets: ["east-mon-asian"], confidence: 0.9, basis: "name: East and Southeast Asian Community Centre" },
};

// Keyed by events.source_provider for single-organisation scrapers whose
// whole programme is defined by a community mission. General museums and
// galleries are deliberately absent even when they programme diverse work.
export const PROVIDER_MISSIONS: Record<string, SourceMission> = {
  "queer-britain": { buckets: ["queer"], confidence: 0.9, basis: "mission: Queer Britain, the UK's national LGBTQ+ museum" },
  "africa-centre": { buckets: ["black"], confidence: 0.9, basis: "mission: The Africa Centre, African arts and culture" },
  autograph: { buckets: ["black"], confidence: 0.85, basis: "mission: Autograph, founded as the Association of Black Photographers" },
  "198-gallery": { buckets: ["poc"], confidence: 0.85, basis: "mission: 198 Contemporary Arts and Learning, artists of colour" },
  "new-art-exchange": { buckets: ["poc"], confidence: 0.85, basis: "mission: New Art Exchange, global majority contemporary arts" },
  outsavvy: { buckets: ["queer"], confidence: 0.85, basis: "mission: OutSavvy, LGBTQ+ events platform" },
  dadafest: { buckets: ["disability-friendly"], confidence: 0.9, basis: "mission: DaDaFest, disability and Deaf arts" },
  "shape-arts": { buckets: ["disability-friendly"], confidence: 0.9, basis: "mission: Shape Arts, disability-led arts organisation" },
};

export interface SourceMissionLookup {
  sourceProvider: string;
  organiserSourceType?: string | null;
  organiserProfileUrl?: string | null;
  organiserName?: string | null;
}

export function eventbriteOrganiserId(profileUrl: string | null | undefined): string | null {
  // lib/sources/eventbrite.ts writes https://www.eventbrite.com/o/{id}; the
  // public slugged form (/o/some-collective-123) is accepted too.
  const match = profileUrl?.match(/\/o\/(?:[^/]*-)?(\d+)\/?$/);
  return match ? match[1] : null;
}

export function findSourceMission(lookup: SourceMissionLookup): SourceMission | null {
  if (lookup.organiserSourceType === "eventbrite") {
    const id = eventbriteOrganiserId(lookup.organiserProfileUrl);
    if (id && EVENTBRITE_ORGANISER_MISSIONS[id]) return EVENTBRITE_ORGANISER_MISSIONS[id];
  }
  if (lookup.organiserSourceType === "bio-link" && lookup.organiserName) {
    const mission = BIO_LINK_MISSIONS[lookup.organiserName];
    if (mission) return mission;
  }
  return PROVIDER_MISSIONS[lookup.sourceProvider] ?? null;
}

export function sourceMissionMatches(lookup: SourceMissionLookup): BucketMatch[] {
  const mission = findSourceMission(lookup);
  if (!mission) return [];
  return mission.buckets.map((bucketSlug) => ({
    bucketSlug,
    confidence: mission.confidence,
    evidence: `source mission — ${mission.basis}`,
  }));
}
