import Link from "next/link";
import type { Metadata } from "next";
import { fetchQualifyingEvents } from "@/lib/events-query";
import { buildPlaceIndex } from "@/lib/city-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse events by city & region — Manifesto",
  description:
    "Community and accessibility-tagged events across the UK, browsable by city and region.",
};

export default async function EventsIndexPage() {
  const { events, error } = await fetchQualifyingEvents();
  const cities = buildPlaceIndex(events, "city");
  const regions = buildPlaceIndex(events, "region");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-8 py-12 font-jbmono">
      <div>
        <h1 className="text-lg text-black dark:text-white">Browse by city &amp; region</h1>
        <Link href="/" className="text-sm underline underline-offset-4">
          ← Back to all events
        </Link>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">Failed to load events: {error}</p>}

      {!error && cities.length === 0 && (
        <p className="text-sm text-zinc-500">No events with a known city yet.</p>
      )}

      {cities.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500">Cities</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {cities.map((city) => (
              <li key={city.slug}>
                <Link href={`/events/city/${city.slug}`} className="underline underline-offset-4">
                  {city.name}
                </Link>{" "}
                <span className="text-zinc-500">({city.count})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {regions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500">Regions</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {regions.map((region) => (
              <li key={region.slug}>
                <Link href={`/events/region/${region.slug}`} className="underline underline-offset-4">
                  {region.name}
                </Link>{" "}
                <span className="text-zinc-500">({region.count})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
