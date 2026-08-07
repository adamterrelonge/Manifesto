"use client";

import { useEffect, useMemo, useState } from "react";
import Header, { type ViewMode } from "@/app/components/Header";
import Sidebar, { type FilterState, DEFAULT_FILTERS } from "@/app/components/Sidebar";
import type { Category } from "@/lib/categories";
import { matchesDateFilter, type DateFilter } from "@/lib/date-filter";
import EventsListView from "@/app/components/views/EventsListView";
import MapView from "@/app/components/views/MapView";
import CardsView from "@/app/components/views/CardsView";
import type { EventListItem } from "@/lib/types";
import { useUser } from "@/lib/hooks/useUser";
import {
  fetchFavouriteEventIds,
  fetchFavouriteVenueIds,
  setEventFavourited,
  setVenueFavourited,
} from "@/lib/favourites";

interface AppShellProps {
  events: EventListItem[];
  error: string | null;
}

function matchesFilters(event: EventListItem, filters: FilterState): boolean {
  if (
    filters.maxPrice !== null &&
    !event.is_free &&
    (event.price_min === null || event.price_min > filters.maxPrice)
  ) {
    return false;
  }

  if (filters.categories.length > 0) {
    if (!event.category || !filters.categories.includes(event.category as Category)) {
      return false;
    }
  }

  if (filters.buckets.length > 0) {
    const eventBucketSlugs = event.event_buckets
      .map((eb) => eb.buckets?.slug)
      .filter((slug): slug is string => Boolean(slug));
    const matchesAny = filters.buckets.some((slug) => eventBucketSlugs.includes(slug));
    if (!matchesAny) return false;
  }

  return true;
}

export default function AppShell({ events, error }: AppShellProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const user = useUser();
  const [favouriteEventIds, setFavouriteEventIds] = useState<Set<string>>(new Set());
  const [favouriteVenueIds, setFavouriteVenueIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavouriteEventIds(new Set());
      setFavouriteVenueIds(new Set());
      return;
    }
    fetchFavouriteEventIds(user.id).then(setFavouriteEventIds);
    fetchFavouriteVenueIds(user.id).then(setFavouriteVenueIds);
  }, [user]);

  function toggleEventFavourite(eventId: string) {
    if (!user) return;
    const favourited = favouriteEventIds.has(eventId);
    setFavouriteEventIds((current) => {
      const next = new Set(current);
      if (favourited) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    setEventFavourited(user.id, eventId, !favourited);
  }

  function toggleVenueFavourite(venueId: string) {
    if (!user) return;
    const favourited = favouriteVenueIds.has(venueId);
    setFavouriteVenueIds((current) => {
      const next = new Set(current);
      if (favourited) next.delete(venueId);
      else next.add(venueId);
      return next;
    });
    setVenueFavourited(user.id, venueId, !favourited);
  }

  const filteredEvents = useMemo(() => {
    const now = new Date();
    return events.filter(
      (event) =>
        matchesDateFilter(event.start_at, event.end_at, dateFilter, now) &&
        matchesFilters(event, filters)
    );
  }, [events, dateFilter, filters]);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <Header view={view} onViewChange={setView} />
      <div className="flex flex-1">
        <Sidebar
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          filters={filters}
          onFiltersChange={setFilters}
        />
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black">
          {view === "list" && (
            <EventsListView
              events={filteredEvents}
              error={error}
              signedIn={!!user}
              favouriteEventIds={favouriteEventIds}
              favouriteVenueIds={favouriteVenueIds}
              onToggleEventFavourite={toggleEventFavourite}
              onToggleVenueFavourite={toggleVenueFavourite}
            />
          )}
          {view === "map" && (
            <MapView
              events={filteredEvents}
              error={error}
              signedIn={!!user}
              favouriteEventIds={favouriteEventIds}
              favouriteVenueIds={favouriteVenueIds}
              onToggleEventFavourite={toggleEventFavourite}
              onToggleVenueFavourite={toggleVenueFavourite}
            />
          )}
          {view === "cards" && (
            <CardsView
              events={filteredEvents}
              error={error}
              signedIn={!!user}
              favouriteEventIds={favouriteEventIds}
              onToggleEventFavourite={toggleEventFavourite}
            />
          )}
        </main>
      </div>
    </div>
  );
}
