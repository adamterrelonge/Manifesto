import * as cheerio from "cheerio";

export const REQUEST_HEADERS = {
  "User-Agent": "ManifestoEventsBot/1.0 (+mailto:terrelonge63@googlemail.com)",
};

export const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

// If the resolved date is more than 60 days in the past, assume next year.
export function inferYear(month: number, day: number): number {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), month, day);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  if (candidate < sixtyDaysAgo) {
    return now.getFullYear() + 1;
  }
  return now.getFullYear();
}

// "16 September 2026" / "16 September" / "Thu 6 August 2026"
export function parseDMY(text: string, defaultYear?: number): Date | null {
  const clean = text.trim();
  // Allow an optional leading day-of-week abbreviation
  const m = clean.match(
    /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+)?(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/i
  );
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;

  const year = m[3] ? parseInt(m[3], 10) : (defaultYear ?? inferYear(month, day));
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

// "September 16, 2026" / "July 15, 2026"
export function parseMDY(text: string, defaultYear?: number): Date | null {
  const clean = text.trim();
  const m = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(m[2], 10);
  const year = m[3] ? parseInt(m[3], 10) : (defaultYear ?? inferYear(month, day));
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

// Parses "6pm", "6:30pm", "18:00", "2:15 PM", "6.30PM"
// Returns [hours24, minutes] or null.
export function parseTime(s: string): [number, number] | null {
  const m = s
    .trim()
    .match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3]?.toLowerCase();

  if (meridiem === "am") {
    if (h === 12) h = 0;
  } else if (meridiem === "pm") {
    if (h !== 12) h += 12;
  } else {
    // No meridiem — if hour < 12 assume PM (all venues are evening-focused)
    if (h < 12) h += 12;
  }

  if (h > 23 || min > 59) return null;
  return [h, min];
}

export function applyTime(date: Date, timeStr: string): Date {
  const parsed = parseTime(timeStr);
  if (!parsed) return date;
  const [h, min] = parsed;
  const d = new Date(date);
  d.setHours(h, min, 0, 0);
  return d;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

// Re-export cheerio so adapters don't need a separate import.
export { cheerio };
