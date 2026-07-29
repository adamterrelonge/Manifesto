"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  LngLatBounds,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventListItem } from "@/lib/types";
import { formatEventDate, formatEventPrice } from "@/lib/format";

// Free OSM raster tiles — fine for development, but OSM's tile usage policy
// caps this to light/dev traffic. Swap for a proper provider (MapTiler,
// Stadia, Protomaps) before this sees real production load.
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const UK_CENTER: [number, number] = [-1.5, 52.7];

interface MapViewProps {
  events: EventListItem[];
  error: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Only allow http(s) source URLs into the popup markup — an untrusted
// upstream field (Skiddle's `link`) must never be trusted enough to end up
// as a `javascript:` href or break out of the attribute quoting.
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return escapeHtml(parsed.toString());
  } catch {
    return null;
  }
}

function buildPopupHtml(event: EventListItem, venueName: string): string {
  const price = formatEventPrice(event);
  const href = safeHref(event.source_url);

  return `
    <div style="font-family: inherit; max-width: 220px;">
      <p style="margin: 0 0 2px; font-size: 12px; color: #71717a;">${escapeHtml(
        formatEventDate(event.start_at)
      )}</p>
      <p style="margin: 0 0 2px; font-weight: 600;">${escapeHtml(event.title)}</p>
      <p style="margin: 0; font-size: 13px; color: #52525b;">${escapeHtml(venueName)}</p>
      ${price ? `<p style="margin: 4px 0 0; font-size: 13px; font-weight: 500;">${escapeHtml(price)}</p>` : ""}
      ${
        href
          ? `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:13px;text-decoration:underline;">View source ↗</a>`
          : ""
      }
    </div>
  `;
}

export default function MapView({ events, error }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const located = events.filter(
    (event) => event.venues?.lat != null && event.venues?.lng != null
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new MapLibreMap({
      container: containerRef.current,
      style: OSM_STYLE,
      center: UK_CENTER,
      zoom: 5,
    });
    mapRef.current.addControl(new NavigationControl(), "top-right");

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (located.length === 0) return;

    const bounds = new LngLatBounds();

    for (const event of located) {
      const lng = event.venues!.lng!;
      const lat = event.venues!.lat!;

      const marker = new Marker({ color: "#16a34a" })
        .setLngLat([lng, lat])
        .setPopup(
          new Popup({ offset: 24 }).setHTML(
            buildPopupHtml(event, event.venues!.name)
          )
        )
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
    }

    map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 0 });
  }, [located]);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full">
      <div ref={containerRef} className="h-full w-full" />

      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-6">
          <p className="pointer-events-auto rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 shadow dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Failed to load events: {error}
          </p>
        </div>
      )}

      {!error && located.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-6">
          <p className="pointer-events-auto rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 shadow dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No events with venue coordinates yet.
          </p>
        </div>
      )}
    </div>
  );
}
