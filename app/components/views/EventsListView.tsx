import type { EventListItem } from "@/lib/types";
import { formatEventDate, formatEventPrice } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";

interface EventsListViewProps {
  events: EventListItem[];
  error: string | null;
}

export default function EventsListView({ events, error }: EventsListViewProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          What&apos;s on
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Aggregated from Skiddle and Ticketmaster.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Failed to load events: {error}
        </p>
      )}

      {!error && events.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No events yet. Trigger{" "}
          <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-800">
            /api/ingest/skiddle
          </code>{" "}
          to pull some in.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {events.map((event) => (
          <li
            key={event.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {formatEventDate(event.start_at)}
                  </p>
                  {categoryLabel(event.category) && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {categoryLabel(event.category)}
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-lg font-medium text-black dark:text-zinc-50">
                  {event.source_url ? (
                    <a
                      href={event.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {event.title}
                    </a>
                  ) : (
                    event.title
                  )}
                </h2>
                {event.venues && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {event.venues.name}
                    {event.venues.city ? `, ${event.venues.city}` : ""}
                  </p>
                )}
              </div>
              {formatEventPrice(event) && (
                <span className="whitespace-nowrap text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {formatEventPrice(event)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
