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
];
