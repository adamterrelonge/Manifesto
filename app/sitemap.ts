import type { MetadataRoute } from "next";
import { fetchQualifyingEvents } from "@/lib/events-query";
import { buildPlaceIndex } from "@/lib/city-pages";

// Regenerated at most once an hour rather than force-dynamic like the pages
// it links to — a sitemap is fetched by crawlers, not users, so it doesn't
// need to reflect the DB down to the second, and this avoids an extra live
// query on every crawl.
export const revalidate = 3600;

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const { events } = await fetchQualifyingEvents();
  const cities = buildPlaceIndex(events, "city");
  const regions = buildPlaceIndex(events, "region");

  return [
    { url: base, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/events`, changeFrequency: "daily", priority: 0.8 },
    ...cities.map((city) => ({
      url: `${base}/events/city/${city.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
    ...regions.map((region) => ({
      url: `${base}/events/region/${region.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.5,
    })),
  ];
}
