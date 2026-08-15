import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import PlaceBanner from "@/app/components/PlaceBanner";
import { fetchQualifyingEvents } from "@/lib/events-query";
import { filterEventsByPlace } from "@/lib/city-pages";

export const dynamic = "force-dynamic";

interface CityPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { events } = await fetchQualifyingEvents();
  const cityEvents = filterEventsByPlace(events, "city", slug);
  const cityName = cityEvents[0]?.venues?.city;

  if (!cityName) {
    return { title: "City not found — Manifesto" };
  }

  return {
    title: `What's on in ${cityName} — Manifesto`,
    description: `Community and accessibility-tagged events in ${cityName}: queer, Black, disability-friendly, and more — aggregated from independent organisers and mainstream listings.`,
  };
}

export default async function CityPage({ params }: CityPageProps) {
  const { slug } = await params;
  const { events, error } = await fetchQualifyingEvents();
  const cityEvents = filterEventsByPlace(events, "city", slug);

  // A city page with zero matching events (bad slug, or a city that briefly
  // had no qualifying events) is a soft-404 for SEO purposes — genuinely
  // 404 it rather than rendering an empty shell, unless it's empty because
  // the whole query failed (a real error, not "no such city").
  if (cityEvents.length === 0 && !error) notFound();

  const cityName = cityEvents[0]?.venues?.city ?? slug;

  return (
    <div className="flex min-h-screen flex-col">
      <PlaceBanner heading={`Events in ${cityName}`} />
      <AppShell events={cityEvents} error={error} />
    </div>
  );
}
