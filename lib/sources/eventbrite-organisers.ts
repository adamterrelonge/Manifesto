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
  // { id: "123456789", name: "Example Collective" },
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
];
