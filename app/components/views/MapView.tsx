"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Popup,
  NavigationControl,
  LngLatBounds,
  setWorkerUrl,
  type StyleSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EventGroup } from "@/lib/group-events";
import { formatEventDate, formatEventPrice, formatShortDate } from "@/lib/format";

// maplibre-gl's clustering (GeoJSON source with cluster:true) runs
// supercluster in a Web Worker. Its default worker-URL resolution derives
// from `import.meta.url` and requires that to be an absolute http(s) URL —
// under Turbopack's bundling it isn't, so the worker URL silently resolves
// to "" and clustering never initializes (confirmed via devtools: source
// stayed permanently unloaded, 0 rendered features, no console error at
// all — this is a bundler quirk, not a thrown exception). Pointing at a
// plain static copy of the worker bundle sidesteps that resolution path
// entirely. The worker bundle itself dynamically imports a "shared" chunk
// relative to its own URL, so both files have to be copied to public/ and
// kept side by side. Re-copy public/maplibre-gl-worker.mjs AND
// public/maplibre-gl-shared.mjs from node_modules/maplibre-gl/dist/ if
// maplibre-gl is ever upgraded.
setWorkerUrl("/maplibre-gl-worker.mjs");

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

// GeoJSON clustering source + layers (MapLibre's built-in supercluster
// integration) replace the old one-Marker-per-event approach — at a few
// thousand events, individual DOM-backed Markers get visibly slow to
// create/remove on every filter change, where a single vector source just
// gets `.setData()`'d. See docs/PROJECT_PLAN.md Phase 6.
const SOURCE_ID = "events";
const CLUSTER_LAYER_ID = "clusters";
const CLUSTER_COUNT_LAYER_ID = "cluster-count";
const UNCLUSTERED_LAYER_ID = "unclustered-point";

interface MapViewProps {
  groups: EventGroup[];
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
  group: EventGroup,
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
  const price = formatEventPrice(group);
  const href = safeHref(group.source_url);

  const container = document.createElement("div");
  container.style.cssText = "font-family: inherit; max-width: 220px;";

  const header = document.createElement("div");
  header.style.cssText = "display:flex; align-items:flex-start; justify-content:space-between; gap:8px;";

  const textCol = document.createElement("div");
  textCol.style.cssText = "min-width:0;";

  // A single occurrence gets the usual full date; more than one renders as
  // a wrapped row of short date chips (mirrors OccurrenceDates.tsx's
  // React version — this popup is plain DOM, built imperatively by
  // maplibre-gl, so it can't render that component directly).
  if (group.occurrences.length <= 1) {
    const dateEl = document.createElement("p");
    dateEl.style.cssText = "margin: 0 0 2px; font-size: 12px; color: #71717a;";
    dateEl.textContent = formatEventDate(group.occurrences[0].start_at);
    textCol.appendChild(dateEl);
  } else {
    const datesEl = document.createElement("div");
    datesEl.style.cssText = "display:flex; flex-wrap:wrap; gap:3px; margin: 0 0 4px;";
    const shown = group.occurrences.slice(0, 4);
    for (const occurrence of shown) {
      const chip = document.createElement("span");
      chip.style.cssText =
        "background:#f4f4f5; color:#52525b; border-radius:4px; padding:1px 5px; font-size:11px; font-weight:500;";
      chip.textContent = formatShortDate(occurrence.start_at);
      datesEl.appendChild(chip);
    }
    const remaining = group.occurrences.length - shown.length;
    if (remaining > 0) {
      const more = document.createElement("span");
      more.style.cssText = "font-size:11px; color:#a1a1aa; align-self:center;";
      more.textContent = `+${remaining} more`;
      datesEl.appendChild(more);
    }
    textCol.appendChild(datesEl);
  }

  const titleEl = document.createElement("p");
  titleEl.style.cssText = "margin: 0 0 2px; font-weight: 600;";
  titleEl.textContent = group.title;
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

interface PopupOpts {
  signedIn: boolean;
  favouriteEventIds: Set<string>;
  favouriteVenueIds: Set<string>;
  onToggleEventFavourite: (eventId: string) => void;
  onToggleVenueFavourite: (venueId: string) => void;
}

// Thin wrapper around buildPopupElement that reads favourite state from the
// PopupOpts shape stored in a ref (see popupOptsRef below) — kept as a
// standalone function (not a closure over component state) so click
// handlers registered once, at map creation, can call it with whatever the
// ref currently holds instead of a stale snapshot from mount time.
function buildPopupElementFor(group: EventGroup, opts: PopupOpts): HTMLElement {
  const venueId = group.venues!.id;
  return buildPopupElement(group, group.venues!.name, venueId, {
    signedIn: opts.signedIn,
    eventFavourited: opts.favouriteEventIds.has(group.primaryEventId),
    venueFavourited: opts.favouriteVenueIds.has(venueId),
    onToggleEvent: () => opts.onToggleEventFavourite(group.primaryEventId),
    onToggleVenue: () => opts.onToggleVenueFavourite(venueId),
  });
}

function toFeatureCollection(groups: EventGroup[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: groups.map((group) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [group.venues!.lng!, group.venues!.lat!],
      },
      properties: { key: group.key },
    })),
  };
}

export default function MapView({
  groups,
  error,
  signedIn,
  favouriteEventIds,
  favouriteVenueIds,
  onToggleEventFavourite,
  onToggleVenueFavourite,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const located = groups.filter(
    (group) => group.venues?.lat != null && group.venues?.lng != null
  );

  // Refs read by click handlers that are registered once (at map creation)
  // rather than re-registered every render — each ref is refreshed after
  // every commit below, so a handler invoked later always sees current
  // data/favourite state despite the handler closure itself being "stale".
  const groupsByKeyRef = useRef<Map<string, EventGroup>>(new Map());
  const popupOptsRef = useRef<PopupOpts>({
    signedIn,
    favouriteEventIds,
    favouriteVenueIds,
    onToggleEventFavourite,
    onToggleVenueFavourite,
  });
  // At most one popup is ever open at a time (MapLibre closes the previous
  // one when a new one opens) — tracking it lets favourite toggles update
  // the open popup's content in place instead of only affecting the next
  // click, with no marker/source rebuild and no fitBounds involved.
  const openPopupRef = useRef<{ popup: Popup; groupKey: string } | null>(null);

  useEffect(() => {
    groupsByKeyRef.current = new Map(located.map((group) => [group.key, group]));
  });

  useEffect(() => {
    popupOptsRef.current = {
      signedIn,
      favouriteEventIds,
      favouriteVenueIds,
      onToggleEventFavourite,
      onToggleVenueFavourite,
    };
    const open = openPopupRef.current;
    if (!open) return;
    const group = groupsByKeyRef.current.get(open.groupKey);
    if (!group) return;
    open.popup.setDOMContent(buildPopupElementFor(group, popupOptsRef.current));
  });

  // Map + clustering layers are created once. Click handlers are registered
  // here too, reading groupsByKeyRef/popupOptsRef at call time rather than
  // closing over any per-render value, so they never need to be re-attached.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: OSM_STYLE,
      center: UK_CENTER,
      zoom: 5,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#16a34a",
          "circle-opacity": 0.85,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#16a34a",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", CLUSTER_LAYER_ID, async (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const clusterId = feature.properties?.cluster_id as number | undefined;
        if (clusterId == null) return;

        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
      });

      map.on("click", UNCLUSTERED_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const key = feature.properties?.key as string | undefined;
        const group = key ? groupsByKeyRef.current.get(key) : undefined;
        if (!group) return;

        const popup = new Popup({ offset: 12 })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setDOMContent(buildPopupElementFor(group, popupOptsRef.current))
          .addTo(map);
        openPopupRef.current = { popup, groupKey: group.key };
        popup.on("close", () => {
          if (openPopupRef.current?.popup === popup) openPopupRef.current = null;
        });
      });

      for (const layerId of [CLUSTER_LAYER_ID, UNCLUSTERED_LAYER_ID]) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setMapLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Keeps the clustering source's data in sync with which events currently
  // have coordinates, and fits the map to them. Deliberately does NOT
  // depend on favourite/signedIn state — those only affect on-demand popup
  // content (built at click time from the refs above), so toggling a
  // favourite can never re-trigger a source rebuild or re-fit here.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!map || !mapLoaded || !source) return;

    source.setData(toFeatureCollection(located));

    if (located.length === 0) return;
    const bounds = new LngLatBounds();
    for (const group of located) {
      bounds.extend([group.venues!.lng!, group.venues!.lat!]);
    }
    map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 0 });
  }, [located, mapLoaded]);

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
