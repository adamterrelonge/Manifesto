"use client";

import { useMemo, useState } from "react";
import Header, { type ViewMode } from "@/app/components/Header";
import Sidebar, { type DateFilter } from "@/app/components/Sidebar";
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

export default function AppShell({ events, error }: AppShellProps) {
  const [view, setView] = useState<ViewMode>("list");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");

  const filteredEvents = useMemo(() => {
    const now = new Date();
    return events.filter((event) => matchesDateFilter(event.start_at, dateFilter, now));
  }, [events, dateFilter]);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <Header view={view} onViewChange={setView} />
      <div className="flex flex-1">
        <Sidebar dateFilter={dateFilter} onDateFilterChange={setDateFilter} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black">
          {view === "list" && <EventsListView events={filteredEvents} error={error} />}
          {view === "map" && <MapView events={filteredEvents} error={error} />}
          {view === "cards" && <CardsView events={filteredEvents} error={error} />}
        </main>
      </div>
    </div>
  );
}
