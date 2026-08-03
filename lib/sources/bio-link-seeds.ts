// Curated seed list of UK cultural creators/organisers whose event
// announcements live behind a bio link (Linktree, Beacons, personal site)
// rather than on a ticketing platform we can query directly.
//
// How to add a seed:
//   1. Find the creator's bio link from their Instagram/TikTok profile.
//   2. Check robots.txt on the landing-page domain — if it blocks bots, skip.
//   3. Paste the actual bio-link URL (the landing page, not the Instagram URL).
//   4. Add a short note so future maintainers know why this seed is here.
//
// Platform notes:
//   linktr.ee  — JSON parsed from __NEXT_DATA__; most reliable.
//   beacons.ai — JSON parsed from __NEXT_DATA__; reliable.
//   Everything else — generic <a> link scan; works for simple sites.
//
// Source for new candidates: https://www.blkartmap.co.uk/directory

export interface BioLinkSeed {
  handle: string;  // social handle — used as organiser name and dedup key
  bioUrl: string;  // the landing-page URL to scrape (not the Instagram URL)
  notes: string;   // community context — why this seed is here
}

export const BIO_LINK_SEEDS: BioLinkSeed[] = [
  // Add verified seeds here. Examples:
   {
     handle: "@junegivannifilmarchive",
     bioUrl: "https://linktr.ee/jgpaca",
     notes: "Curating and promoting African and African diaspora cinema and culture. We are based",
   },
  // {
  //   handle: "@198gallery",
  //   bioUrl: "https://beacons.ai/198gallery",
  //   notes: "198 Contemporary Arts and Learning, Brixton — Black/POC-led",
  // },
  // {
  //   handle: "@queerblackldn",
  //   bioUrl: "https://linktr.ee/queerblackldn",
  //   notes: "Queer Black London events and socials",
  // },
];
