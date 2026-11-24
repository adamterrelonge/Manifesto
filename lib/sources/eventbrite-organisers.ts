// Curated list of community organisers/movements known to run events via
// Eventbrite. Eventbrite deprecated public event search (GET /v3/events/search/)
// in Dec 2019 — see lib/sources/eventbrite.ts — so there is no way to
// discover their events by location like Skiddle/Ticketmaster. Listing a
// known organization's events is the only remaining path, hence this
// seed list instead of a live query.
//
// How to find an organiser's `id`: open their public Eventbrite page
// (e.g. https://www.eventbrite.co.uk/o/some-collective-123456789) — the
// number at the end of the URL is the organization ID.

export interface EventbriteOrganiser {
  id: string;
  name: string;
}

export const EVENTBRITE_ORGANISERS: EventbriteOrganiser[] = [
  { id: "11347103582", name: "Black Ballad" },
  { id: "37663218863", name: "London LGBTQ+ Community Centre" },
  { id: "48548878793", name: "Exilio LGBTQ+ Latinx Party" },
  { id: "37469169963", name: "Skate Gals & Pals CIC & Melanin Skate Gals & Pals" },
  { id: "32367103763", name: "Black Minds Matter" },
  { id: "29636506451", name: "Black Girls Hike CIC" },
  { id: "26461743593", name: "Black Culture Market" },
  { id: "68181723383", name: "Black Pub Quiz" },
  { id: "11899923421", name: "BYP Network" },
  { id: "43436027623", name: "Dope Black Queers" },
  { id: "21020223735", name: "Coding Black Females" },
  { id: "17255335716", name: "UK Black Business Week & Show" },
  { id: "11345718957", name: "Black South West Network (BSWN)" },
  { id: "114770088981", name: "Black in Fintech" },
  { id: "6817237943", name: "Latin Elephant" },
  { id: "20081526531", name: "Latin American Women's Rights Service (LAWRS)" },
  { id: "34414600611", name: "FILMLOCOS (Latin American Creatives)" },
  { id: "28006687021", name: "Como No (La Linea Latin Music Festival)" },
  { id: "27216359183", name: "Latino Life UK" },
  { id: "10679852291", name: "Instituto Cervantes - London" },
  { id: "17398079980", name: "The Ubele Initiative" },
  { id: "15389742341", name: "Black Girl Fest" },
  { id: "31779821363", name: "Club Kali Network" },
  { id: "81453439603", name: "Korean Cultural Centre UK" },
  { id: "52102481093", name: "Dear Asia" },
  { id: "14758260697", name: "The New Black Film Collective" },
  { id: "15315822499", name: "Black Comedy UK" },
  { id: "2142778181", name: "Akwaaba UK" },
  { id: "17316640869", name: "Caribbean Party UK" },
  { id: "1419200345", name: "South Asian Women's Creative Collective (SAWCC)" },
  { id: "55057129863", name: "Asian Leadership Collective" },
  { id: "36744049403", name: "Hong Kong Cultural Community C.I.C." },
  { id: "38513509523", name: "Trafford Hongkongers CIC" },
  { id: "78188070913", name: "Black Marketplace UK" },
  { id: "120708302526", name: "London Latino Film Festival CIC" },
  { id: "50945458233", name: "The Great Nepali Diaspora" },
  { id: "109370987991", name: "The UK Zambian Events Ltd" },
  { id: "114613520621", name: "Ethiopian Community in Britain (ECB)" },
  { id: "8593033100", name: "Eritrean Diaspora Network" },
  { id: "7546982647", name: "The Anglo-Ethiopian Society" },
  { id: "36437367553", name: "Black Muslim Collective UK" },
  { id: "30904174443", name: "The Black Muslim Women Healing Collective" },
  { id: "37930889533", name: "The Black Muslim Awards" },
  { id: "7292292207", name: "Windrush Foundation and The Equiano Society" },
  { id: "26081441987", name: "Sarbat & Taraki (Sikh LGBTQ+ / Punjabi mental health)" },
  { id: "46463029343", name: "UK Taiwanese Chamber of Commerce - Junior Chapter" },
  { id: "17166534428", name: "LSE Latin America and Caribbean Centre" },
  { id: "89864447383", name: "Organization of Latin American Students" },
  { id: "533877162", name: "esea contemporary (Centre for Chinese Contemporary Art)" },
  { id: "18473445210", name: "Manchester China Institute" },
  { id: "12777156366", name: "UK Black Tech" },
  { id: "72970239993", name: "The Birmingham Black Box Theatre and Events Venue" },
  { id: "59721241693", name: "Black History Film Festival" },
  { id: "63507571763", name: "Black Deaf UK" },
  { id: "86992090653", name: "Vietnamese Family Partnership (VFP)" },
  { id: "8507776452", name: "Voices Beyond Gospel Collective" },
  { id: "51485733873", name: "Nourishment" },
  { id: "13374735341", name: "Hoopla Impro" },
  { id: "45275655503", name: "Rain On Me" },
  { id: "78943935183", name: "The Meals Collective" },
  { id: "2638283608", name: "BTWSC Events/African Histories Revisited" },
  { id: "121562149910", name: "The South Asian Textiles Collective" },
  { id: "18130540563", name: "Battersea Power Station" },
  { id: "11149134431", name: "British Library Learning" },
  { id: "46661055893", name: "Mile Rainbow C.I.C" },
  { id: "2849465606", name: "Black History Walks" },
  { id: "121617085788", name: "Mother Tongue" },
  { id: "121167621408", name: "Femme Circle London" },
  { id: "74076943063", name: "Wakuda" },
  { id: "26471263771", name: "Merton Libraries" },
  { id: "20103751021", name: "Grand Junction" },
  { id: "120923991856", name: "Monolithic Studio" },
  { id: "31107759633", name: "Oya Heart Warrior" },
  { id: "14605628700", name: "Tony Cealy" },
  { id: "108729317521", name: "Itonisha Rowe" },
  { id: "54402358323", name: "Hypha Studios" },
  { id: "105544176521", name: "Aswatna Studio" },
  { id: "21728722753", name: "Sober Girl Society" },
  { id: "10830367574", name: "Feminist Library" },
  { id: "7299335165", name: "Shape Arts" }, // Major UK disability-led arts org — old id 30514125867 started 404ing (org moved/re-created its Eventbrite profile), updated 2026-09-11
  { id: "6347401953", name: "MARSM UK" }, // Arab & North African music/cultural events — old id 30232298271 404ing, replaced 2026-09-11
  // Retired 2026-11-24 after 404ing on every run since 2026-09-11 (no
  // replacement profile found then). Removed so they stop showing up as
  // errors in the daily source-health report — re-add with a fresh id if
  // the org turns up on Eventbrite again (and restore Deaf Rave's entry in
  // lib/source-missions.ts):
  //   Deaf Rave (was 18317789304) — Deaf-led music, arts & cultural events
  //   MENA Arts UK (was 33827581123)
  //   Brain Injury & Neurodivergence Network (was 33358399311)
  { id: "121118620788", name: "Playing Outside" }, // Independent pop-up craft/maker market, Corner Corner, SE16
  { id: "14978114979", name: "Barking Riverside Limited" }, // Runs Emerge East, the annual free Barking Riverside festival
  { id: "112394878081", name: "Esteni Market by Esteni & Co" }, // POC-owned-business pop-up market, Shoreditch EC2A 3AY
];
