import type { EventListItem } from "@/lib/types";
import { formatEventDate, formatEventPrice } from "@/lib/format";
import FavouriteButton from "@/app/components/FavouriteButton";

interface CardsViewProps {
  events: EventListItem[];
  error: string | null;
  signedIn: boolean;
  favouriteEventIds: Set<string>;
  onToggleEventFavourite: (eventId: string) => void;
}

export default function CardsView({
  events,
  error,
  signedIn,
  favouriteEventIds,
  onToggleEventFavourite,
}: CardsViewProps) {
  if (error) {
    return (
      <div className="px-6 py-16">
        <p className="mx-auto max-w-3xl rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Failed to load events: {error}
        </p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No events yet. Trigger{" "}
          <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-800">
            /api/ingest/skiddle
          </code>{" "}
          to pull some in.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 px-6 py-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map((event) => {
        const price = formatEventPrice(event);
        const card = (
          <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-900">
              {signedIn && (
                <FavouriteButton
                  favourited={favouriteEventIds.has(event.id)}
                  onToggle={() => onToggleEventFavourite(event.id)}
                  label={
                    favouriteEventIds.has(event.id) ? "Remove from favourites" : "Add to favourites"
                  }
                  itemName={event.title}
                  className="absolute right-2 top-2 z-10 h-6 w-6 text-white drop-shadow"
                />
              )}
              {event.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized Skiddle-hosted images
                <img
                  src={event.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-600">
                  No image
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {formatEventDate(event.start_at)}
                {event.category ? ` · ${event.category}` : ""}
              </p>
              <h2 className="line-clamp-2 text-base font-medium text-black dark:text-zinc-50">
                {event.title}
              </h2>
              {event.venues && (
                <p className="line-clamp-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {event.venues.name}
                  {event.venues.city ? `, ${event.venues.city}` : ""}
                </p>
              )}
              {price && (
                <p className="mt-auto pt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {price}
                </p>
              )}
            </div>
          </div>
        );

        return event.source_url ? (
          <a
            key={event.id}
            href={event.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-full"
          >
            {card}
          </a>
        ) : (
          <div key={event.id}>{card}</div>
        );
      })}
    </div>
  );
}
