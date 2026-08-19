"use client";

import { useEffect, useMemo, useState } from "react";
import Header, { type ViewMode } from "@/app/components/Header";
import Sidebar, { type FilterState, type HomeLocation, DEFAULT_FILTERS } from "@/app/components/Sidebar";
import type { Category } from "@/lib/categories";
import { matchesDateFilter, type DateFilter } from "@/lib/date-filter";
import EventsListView from "@/app/components/views/EventsListView";
import MapView from "@/app/components/views/MapView";
import CardsView from "@/app/components/views/CardsView";
import type { EventListItem } from "@/lib/types";
import { groupEvents } from "@/lib/group-events";
import { useUser } from "@/lib/hooks/useUser";
import { haversineDistanceKm } from "@/lib/geo";
import {
  fetchFavouriteEventIds,
  fetchFavouriteVenueIds,
  fetchProfileLocation,
  setEventFavourited,
  setVenueFavourited,
} from "@/lib/favourites";
import { flagBucketTag } from "@/lib/moderation";

interface AppShellProps {
  events: EventListItem[];
  error: string | null;
}

function matchesFilters(
  event: EventListItem,
  filters: FilterState,
  homeLocation: HomeLocation | null
): boolean {
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

  // No-op without a saved home location — same "bucket-only, radius is an
  // opt-in refinement" behaviour as lib/notifications.ts's matching, rather
  // than hiding everything just because the toggle is on but unusable yet.
  if (filters.nearMeOnly && homeLocation) {
    const venue = event.venues;
    if (!venue || venue.lat == null || venue.lng == null) return false;
    const distanceKm = haversineDistanceKm(homeLocation.lat, homeLocation.lng, venue.lat, venue.lng);
    if (distanceKm > homeLocation.radiusKm) return false;
  }

  return true;
}

// Plain substring match against title/venue name — no fuzzy matching or
// server round-trip, consistent with every other filter here running
// client-side over the already-fetched event list.
function matchesSearch(event: EventListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    event.title.toLowerCase().includes(q) ||
    (event.venues?.name.toLowerCase().includes(q) ?? false)
  );
}

export default function AppShell({ events, error }: AppShellProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");

  const user = useUser();
  const [favouriteEventIds, setFavouriteEventIds] = useState<Set<string>>(new Set());
  const [favouriteVenueIds, setFavouriteVenueIds] = useState<Set<string>>(new Set());
  // Fetched eagerly on login (like favourites) rather than lazily when
  // Settings is opened, so the Filter panel's "near me" toggle is usable
  // right away for a user who already saved a location in a past session.
  const [homeLocation, setHomeLocation] = useState<HomeLocation | null>(null);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavouriteEventIds(new Set());
      setFavouriteVenueIds(new Set());
      setHomeLocation(null);
      return;
    }
    fetchFavouriteEventIds(user.id).then(setFavouriteEventIds);
    fetchFavouriteVenueIds(user.id).then(setFavouriteVenueIds);
    fetchProfileLocation(user.id).then((location) => {
      setHomeLocation(
        location?.home_lat != null && location?.home_lng != null && location?.travel_radius_km != null
          ? { lat: location.home_lat, lng: location.home_lng, radiusKm: location.travel_radius_km }
          : null
      );
    });
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

  // Optimistic, session-only "already reported by me" state — the real
  // duplicate-report guard is the unique(event_id, bucket_id, reporter_id)
  // constraint server-side (0016_bucket_flags_and_trust.sql); this is just
  // UI feedback so the button doesn't invite a second click.
  const [flaggedBucketKeys, setFlaggedBucketKeys] = useState<Set<string>>(new Set());

  function flagBucket(eventId: string, bucketId: string) {
    if (!user) return;
    setFlaggedBucketKeys((current) => new Set(current).add(`${eventId}:${bucketId}`));
    flagBucketTag(user.id, eventId, bucketId).catch(() => {});
  }

  const filteredEvents = useMemo(() => {
    const now = new Date();
    return events.filter(
      (event) =>
        matchesDateFilter(event.start_at, event.end_at, dateFilter, now) &&
        matchesFilters(event, filters, homeLocation) &&
        matchesSearch(event, searchQuery)
    );
  }, [events, dateFilter, filters, homeLocation, searchQuery]);

  // Collapses repeat occurrences of the same production (same title/venue/
  // category — e.g. a week of showtimes) into one listing with multiple
  // dates, applied after filtering so every view (list/map/cards) groups
  // identically and never disagrees about what's currently visible.
  const groupedEvents = useMemo(() => groupEvents(filteredEvents), [filteredEvents]);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <Header
        view={view}
        onViewChange={setView}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />
      <div className="flex flex-1">
        <Sidebar
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          filters={filters}
          onFiltersChange={setFilters}
          homeLocation={homeLocation}
          onHomeLocationChange={setHomeLocation}
        />
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black">
          {view === "list" && (
            <EventsListView
              groups={groupedEvents}
              error={error}
              signedIn={!!user}
              favouriteEventIds={favouriteEventIds}
              favouriteVenueIds={favouriteVenueIds}
              onToggleEventFavourite={toggleEventFavourite}
              onToggleVenueFavourite={toggleVenueFavourite}
              flaggedBucketKeys={flaggedBucketKeys}
              onFlagBucket={flagBucket}
            />
          )}
          {view === "map" && (
            <MapView
              groups={groupedEvents}
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
              groups={groupedEvents}
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
