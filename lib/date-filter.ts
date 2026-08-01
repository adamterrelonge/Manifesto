export type DateFilter = "today" | "tomorrow" | "week";

export function matchesDateFilter(
  startAt: string,
  endAt: string | null,
  filter: DateFilter,
  now: Date
): boolean {
  const start = new Date(startAt);
  // Point-in-time events (no end_at) fall back to treating start as end too,
  // which reduces every case below to the original start-only comparison.
  // Multi-day/month events (exhibitions) instead get checked for whether
  // their run overlaps the window at all, not just whether they started
  // inside it — otherwise an exhibition that opened weeks ago but is still
  // running would never show up again after its opening day.
  const end = endAt ? new Date(endAt) : start;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(tomorrowStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 1);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  switch (filter) {
    case "today":
      return start < tomorrowStart && end >= now;
    case "tomorrow":
      return start < dayAfterTomorrowStart && end >= tomorrowStart;
    case "week":
      return start <= weekEnd && end >= now;
  }
}
