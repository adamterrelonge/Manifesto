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

// Same path data as app/components/icons.tsx's FavouritesIcon — duplicated
// as a plain constant (not imported) because the popup below is built with
// raw DOM APIs, not React, so it can't render the icon component directly.
const HEART_PATH_D =
  "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";

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
  signedIn: boolean;
  favouriteEventIds: Set<string>;
  favouriteVenueIds: Set<string>;
  onToggleEventFavourite: (eventId: string) => void;
  onToggleVenueFavourite: (venueId: string) => void;
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

function heartButton(favourited: boolean, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", String(favourited));
  btn.style.cssText = "border:none;background:none;padding:0;cursor:pointer;line-height:0;";
  btn.style.color = favourited ? "#dc2626" : "#a1a1aa";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("fill", favourited ? "currentColor" : "none");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", HEART_PATH_D);
  svg.appendChild(path);
  btn.appendChild(svg);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  return btn;
}

// Built with real DOM APIs (not an HTML string via .setHTML) so the
// favourite-toggle buttons can carry real click listeners instead of
// inline JS in a markup string — also means user-sourced text (title,
// venue name) goes through textContent, sidestepping the escapeHtml/
// safeHref dance entirely for everything except the one <a> href.
function buildPopupElement(
  event: EventListItem,
  venueName: string,
  venueId: string | null,
  opts: {
    signedIn: boolean;
    eventFavourited: boolean;
    venueFavourited: boolean;
    onToggleEvent: () => void;
    onToggleVenue: () => void;
  }
): HTMLElement {
  const price = formatEventPrice(event);
  const href = safeHref(event.source_url);

  const container = document.createElement("div");
  container.style.cssText = "font-family: inherit; max-width: 220px;";

  const header = document.createElement("div");
  header.style.cssText = "display:flex; align-items:flex-start; justify-content:space-between; gap:8px;";

  const textCol = document.createElement("div");
  textCol.style.cssText = "min-width:0;";

  const dateEl = document.createElement("p");
  dateEl.style.cssText = "margin: 0 0 2px; font-size: 12px; color: #71717a;";
  dateEl.textContent = formatEventDate(event.start_at);
  textCol.appendChild(dateEl);

  const titleEl = document.createElement("p");
  titleEl.style.cssText = "margin: 0 0 2px; font-weight: 600;";
  titleEl.textContent = event.title;
  textCol.appendChild(titleEl);

  const venueEl = document.createElement("p");
  venueEl.style.cssText = "margin: 0; font-size: 13px; color: #52525b;";
  venueEl.textContent = venueName;
  textCol.appendChild(venueEl);

  header.appendChild(textCol);

  if (opts.signedIn) {
    const heartsCol = document.createElement("div");
    heartsCol.style.cssText = "display:flex; flex-direction:column; gap:6px; shrink:0;";
    heartsCol.appendChild(
      heartButton(
        opts.eventFavourited,
        opts.eventFavourited ? "Remove event from favourites" : "Add event to favourites",
        opts.onToggleEvent
      )
    );
    if (venueId) {
      heartsCol.appendChild(
        heartButton(
          opts.venueFavourited,
          opts.venueFavourited ? "Remove venue from favourites" : "Add venue to favourites",
          opts.onToggleVenue
        )
      );
    }
    header.appendChild(heartsCol);
  }

  container.appendChild(header);

  if (price) {
    const priceEl = document.createElement("p");
    priceEl.style.cssText = "margin: 4px 0 0; font-size: 13px; font-weight: 500;";
    priceEl.textContent = price;
    container.appendChild(priceEl);
  }

  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.cssText = "display:inline-block;margin-top:6px;font-size:13px;text-decoration:underline;";
    link.textContent = "View source ↗";
    container.appendChild(link);
  }

  return container;
}

export default function MapView({
  events,
  error,
  signedIn,
  favouriteEventIds,
  favouriteVenueIds,
  onToggleEventFavourite,
  onToggleVenueFavourite,
}: MapViewProps) {
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

      const popupEl = buildPopupElement(event, event.venues!.name, event.venues!.id, {
        signedIn,
        eventFavourited: favouriteEventIds.has(event.id),
        venueFavourited: favouriteVenueIds.has(event.venues!.id),
        onToggleEvent: () => onToggleEventFavourite(event.id),
        onToggleVenue: () => onToggleVenueFavourite(event.venues!.id),
      });

      const marker = new Marker({ color: "#16a34a" })
        .setLngLat([lng, lat])
        .setPopup(new Popup({ offset: 24 }).setDOMContent(popupEl))
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([lng, lat]);
    }

    map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 0 });
  }, [
    located,
    signedIn,
    favouriteEventIds,
    favouriteVenueIds,
    onToggleEventFavourite,
    onToggleVenueFavourite,
  ]);

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
