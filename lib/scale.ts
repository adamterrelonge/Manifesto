// Event scale — keeps mass-market events out of the public feed.
//
// Product rule (docs/INGESTION_EXPANSION_PLAN.md, agreed 2026-11-25): only
// community-scale events are shown. Any venue holding 300+ people is out,
// as are arena/stadium tours and commercial attractions. Deterministic and
// free; run by runScale (lib/pipeline.ts) before classification, and
// enforced by lib/public-gate.ts.
//
// Neither Ticketmaster nor Skiddle exposes venue capacity, so the main
// signal is a curated list of venues known to be 300+ (built from the venues
// actually seen in live data, 2026-11-25), plus venues.capacity where
// someone has entered it. Most events end up 'unknown' — which the gate
// treats as community-scale — rather than guessing.

export type EventScale = "community" | "large" | "unknown";

export const LARGE_VENUE_CAPACITY = 300;

export interface ScaleInput {
  title: string;
  description: string | null;
  sourceProvider: string;
  venueName: string | null;
  venueCapacity: number | null;
  priceMax: number | null;
}

export interface ScaleResult {
  scale: EventScale;
  reasons: string[];
}

// Matched case-insensitively against the venue name. Each entry is a venue
// (or venue family) known to hold 300+; keep entries specific enough not to
// catch small namesakes (e.g. "The Playhouse" alone would hit small-town
// playhouses, so only the large ones are listed).
const LARGE_VENUE_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Arenas, stadiums, big halls and convention centres
  { pattern: /\barena\b/i, label: "arena" },
  { pattern: /\bstadium\b/i, label: "stadium" },
  { pattern: /\bthe o2\b|\bo2 (?:academy|arena|forum|institute|ritz|city hall|shepherd'?s bush|apollo|victoria)|\bo2 academy\d/i, label: "O2 venue" },
  { pattern: /\bovo hydro\b|\bsec armadillo\b|\bco-op live\b|\bbp pulse\b|\bwembley\b|\balexandra palace\b|\bexcel london\b|\bolympia london\b|\bnec\b/i, label: "arena/convention venue" },
  { pattern: /\b(?:eventim|hammersmith) apollo\b|\bapollo victoria\b|\broyal albert hall\b|\broundhouse\b|\bbrixton academy\b|\bclub academy\b/i, label: "large concert venue" },
  { pattern: /\belectric (?:brixton|ballroom)\b|\bforum kentish town\b|\bshepherd'?s bush empire\b|\bkoko\b|\bprintworks\b|\bdrumsheds\b/i, label: "large concert venue" },
  { pattern: /\bbrighton (?:centre|dome)\b|\binternational centre\b|\bcity hall\b|\bphilharmonic hall\b|\bnew century hall\b|\bthe anvil\b/i, label: "large hall" },
  // Large theatres: the West End houses and big regional receiving houses
  {
    pattern:
      /\b(?:phoenix|lyric|cambridge|vaudeville|sondheim|noel coward|duchess|judi dench|prince edward|his majest(?:y'?s|ies)|novello|gielgud|wyndham'?s|harold pinter|apollo|gillian lynne|queen'?s|shaftesbury|ambassadors|garrick|aldwych|prince of wales|savoy|duke of york'?s|peacock|tom stoppard|dominion|adelphi|piccadilly|criterion|palace|playhouse|old vic|hawth|alhambra) theat(?:re|er)\b/i,
    label: "large theatre",
  },
  { pattern: /\btheatre royal\b|\bopera house\b|\blondon palladium\b|\blondon coliseum\b|\bthe old vic\b|\bedinburgh playhouse\b|\bhippodrome\b|\bsadler'?s wells\b|\bthe arts at marble arch\b/i, label: "large theatre" },
  { pattern: /^the playhouse$/i, label: "large theatre" },
  // Commercial attractions — mass-market by nature, whatever the headcount
  { pattern: /\bsea life\b|\blegoland\b|\bdungeon\b|\bmadame tussauds\b|\blondon eye\b|\bwarwick castle\b/i, label: "commercial attraction" },
];

// Title phrases that mean a touring or mass-market production.
const LARGE_TITLE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(?:uk|world|european|arena|stadium|farewell|anniversary) tour\b/i, label: "touring production" },
  { pattern: /\btour 20\d\d\b/i, label: "touring production" },
  { pattern: /\b(?:arena|stadium) show\b/i, label: "arena show" },
];

// Above this, the ticket price itself says mass-market (West End/arena
// pricing). Skiddle's p90 price_max on live data was £44; small workshops
// rarely pass £100.
export const LARGE_PRICE_THRESHOLD = 100;

// Providers whose inventory is mass-market by construction. Ticketmaster's
// 811 live events (2026-11-25) were spread over 274 venues — West End
// theatres, arenas and O2 Academies — with none shown to users.
const LARGE_BY_PROVIDER: Record<string, string> = {
  ticketmaster: "Ticketmaster: mass-market ticketing inventory",
};

export function assessScale(input: ScaleInput): ScaleResult {
  const reasons: string[] = [];

  if (input.venueCapacity !== null) {
    if (input.venueCapacity >= LARGE_VENUE_CAPACITY) {
      reasons.push(`venue capacity ${input.venueCapacity}`);
    } else {
      // A known small capacity beats every heuristic below.
      return { scale: "community", reasons: [`venue capacity ${input.venueCapacity}`] };
    }
  }

  const venue = input.venueName?.trim() ?? "";
  for (const { pattern, label } of LARGE_VENUE_PATTERNS) {
    if (venue && pattern.test(venue)) {
      reasons.push(`${label}: ${venue}`);
      break;
    }
  }
  for (const { pattern, label } of LARGE_TITLE_PATTERNS) {
    const match = input.title.match(pattern);
    if (match) {
      reasons.push(`${label}: "${match[0]}"`);
      break;
    }
  }
  if (input.priceMax !== null && input.priceMax >= LARGE_PRICE_THRESHOLD) {
    reasons.push(`ticket price up to £${input.priceMax}`);
  }
  const providerReason = LARGE_BY_PROVIDER[input.sourceProvider];
  if (providerReason) reasons.push(providerReason);

  return reasons.length > 0 ? { scale: "large", reasons } : { scale: "unknown", reasons: [] };
}
