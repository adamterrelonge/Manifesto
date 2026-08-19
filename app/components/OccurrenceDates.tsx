import type { EventOccurrence } from "@/lib/group-events";
import { formatEventDate, formatShortDate } from "@/lib/format";

interface OccurrenceDatesProps {
  occurrences: EventOccurrence[];
  max?: number;
  className?: string;
}

// A single occurrence keeps the existing full "Thu 16 Aug, 19:30" treatment
// — grouped events (more than one occurrence) switch to a row of short date
// chips instead, capped at `max` with a "+N more" tail so a long-running
// week-of-showtimes production doesn't blow out the card.
export default function OccurrenceDates({ occurrences, max = 4, className }: OccurrenceDatesProps) {
  if (occurrences.length <= 1) {
    return (
      <span className={className}>{formatEventDate(occurrences[0].start_at)}</span>
    );
  }

  const shown = occurrences.slice(0, max);
  const remaining = occurrences.length - shown.length;

  return (
    <span className={["inline-flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}>
      {shown.map((occurrence) => (
        <span
          key={occurrence.id}
          className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {formatShortDate(occurrence.start_at)}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-[11px] text-zinc-400">+{remaining} more</span>
      )}
    </span>
  );
}
