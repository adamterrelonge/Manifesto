import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import PlaceBanner from "@/app/components/PlaceBanner";
import { fetchQualifyingEvents } from "@/lib/events-query";
import { filterEventsByPlace } from "@/lib/city-pages";

export const dynamic = "force-dynamic";

interface RegionPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RegionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { events } = await fetchQualifyingEvents();
  const regionEvents = filterEventsByPlace(events, "region", slug);
  const regionName = regionEvents[0]?.venues?.region;

  if (!regionName) {
    return { title: "Region not found — Manifesto" };
  }

  return {
    title: `What's on in ${regionName} — Manifesto`,
    description: `Community and accessibility-tagged events across ${regionName}: queer, Black, disability-friendly, and more — aggregated from independent organisers and mainstream listings.`,
  };
}

export default async function RegionPage({ params }: RegionPageProps) {
  const { slug } = await params;
  const { events, error } = await fetchQualifyingEvents();
  const regionEvents = filterEventsByPlace(events, "region", slug);

  if (regionEvents.length === 0 && !error) notFound();

  const regionName = regionEvents[0]?.venues?.region ?? slug;

  return (
    <div className="flex min-h-screen flex-col">
      <PlaceBanner heading={`Events in ${regionName}`} />
      <AppShell events={regionEvents} error={error} />
    </div>
  );
}
