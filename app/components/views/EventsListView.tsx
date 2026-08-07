import type { EventListItem } from "@/lib/types";
import { formatEventDate, formatEventPrice } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { GappedArrowIcon } from "@/app/components/icons";
import FavouriteButton from "@/app/components/FavouriteButton";

interface EventsListViewProps {
  events: EventListItem[];
  error: string | null;
  signedIn: boolean;
  favouriteEventIds: Set<string>;
  favouriteVenueIds: Set<string>;
  onToggleEventFavourite: (eventId: string) => void;
  onToggleVenueFavourite: (venueId: string) => void;
}

// Community bucket labels come straight off the event_buckets join (each
// row already carries buckets.label) — no need to re-derive from
// lib/buckets, and it keeps this view decoupled from the classifier.
function bucketChips(event: EventListItem): string[] {
  const labels = event.event_buckets
    .map((eb) => eb.buckets?.label)
    .filter((label): label is string => Boolean(label));
  return Array.from(new Set(labels)).slice(0, 2);
}

export default function EventsListView({
  events,
  error,
  signedIn,
  favouriteEventIds,
  favouriteVenueIds,
  onToggleEventFavourite,
  onToggleVenueFavourite,
}: EventsListViewProps) {
  return (
    <div className="flex w-full flex-col gap-4 px-4 py-6 sm:px-6">
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

      {events.length > 0 && (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const price = formatEventPrice(event);
            const chips = [categoryLabel(event.category), ...bucketChips(event)].filter(
              (chip): chip is string => Boolean(chip)
            );
            const venueLabel = event.venues
              ? `${event.venues.name}${event.venues.city ? `, ${event.venues.city}` : ""}`
              : null;

            const rowContent = (
              <>
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                  {event.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized source images
                    <img
                      src={event.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">
                      {event.title}
                    </p>
                    {signedIn && (
                      <FavouriteButton
                        favourited={favouriteEventIds.has(event.id)}
                        onToggle={() => onToggleEventFavourite(event.id)}
                        label={
                          favouriteEventIds.has(event.id)
                            ? "Remove event from favourites"
                            : "Add event to favourites"
                        }
                        itemName={event.title}
                        className="h-3.5 w-3.5 shrink-0 text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"
                      />
                    )}
                  </div>

                  <p className="mt-1 truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                    {formatEventDate(event.start_at)}
                  </p>

                  {venueLabel && event.venues && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="min-w-0 truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                        {venueLabel}
                      </p>
                      {signedIn && (
                        <FavouriteButton
                          favourited={favouriteVenueIds.has(event.venues.id)}
                          onToggle={() => onToggleVenueFavourite(event.venues!.id)}
                          label={
                            favouriteVenueIds.has(event.venues.id)
                              ? "Remove venue from favourites"
                              : "Add venue to favourites"
                          }
                          itemName={event.venues.name}
                          className="h-3.5 w-3.5 shrink-0 text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"
                        />
                      )}
                    </div>
                  )}

                  {chips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full bg-[#1f271a]/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#1f271a]/80 dark:bg-white/10 dark:text-zinc-300"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {price && (
                    <span className="whitespace-nowrap text-[13px] font-medium text-zinc-600 dark:text-zinc-300">
                      {price}
                    </span>
                  )}
                  <GappedArrowIcon className="h-3.5 w-3.5 text-zinc-300 transition-colors group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400" />
                </div>
              </>
            );

            const rowClassName =
              "group flex items-center gap-4 rounded-2xl bg-white/80 px-4 py-4 ring-black/5 backdrop-blur-sm transition-colors hover:bg-black/[0.03] dark:bg-zinc-900/60 dark:ring-white/10 dark:hover:bg-white/[0.04] sm:px-5 sm:py-5";

            return (
              <li key={event.id}>
                {event.source_url ? (
                  <a
                    href={event.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={rowClassName}
                  >
                    {rowContent}
                  </a>
                ) : (
                  <div className={rowClassName}>{rowContent}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
