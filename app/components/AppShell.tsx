"use client";

import { useMemo, useState } from "react";
import Header, { type ViewMode } from "@/app/components/Header";
import Sidebar, {
  type DateFilter,
  type FilterState,
  DEFAULT_FILTERS,
} from "@/app/components/Sidebar";
import type { Category } from "@/lib/categories";
import EventsListView from "@/app/components/views/EventsListView";
import MapView from "@/app/components/views/MapView";
import CardsView from "@/app/components/views/CardsView";
import type { EventListItem } from "@/lib/types";

interface AppShellProps {
  events: EventListItem[];
  error: string | null;
}

function matchesDateFilter(startAt: string, filter: DateFilter, now: Date): boolean {
  const start = new Date(startAt);
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
      return start >= now && start < tomorrowStart;
    case "tomorrow":
      return start >= tomorrowStart && start < dayAfterTomorrowStart;
    case "week":
      return start >= now && start <= weekEnd;
  }
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

  const filteredEvents = useMemo(() => {
    const now = new Date();
    return events.filter(
      (event) =>
        matchesDateFilter(event.start_at, dateFilter, now) && matchesFilters(event, filters)
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
          {view === "list" && <EventsListView events={filteredEvents} error={error} />}
          {view === "map" && <MapView events={filteredEvents} error={error} />}
          {view === "cards" && <CardsView events={filteredEvents} error={error} />}
        </main>
      </div>
    </div>
  );
}
