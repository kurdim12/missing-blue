// Basemap sources, layers and the shared "which basemap" store.
//
// Named basemaps.ts (not basemap.ts): on a case-insensitive file system "./basemap.ts" would shadow "./BaseMap.tsx"
// for `import ... from "./BaseMap"` (bundlers try .ts before .tsx).
//
// Every map declares all basemap sources up front and only toggles layer visibility (no setStyle), so screen data
// layers are never lost. A hidden layer's source requests no tiles.
//
//   const kind = useBasemap();          // "satellite" | "map" (persisted in localStorage "mb.basemap", default satellite)
//   setBasemap("map");                  // every mounted map follows
import { useSyncExternalStore } from "react";
import type { LayerSpecification, RasterDEMSourceSpecification, SourceSpecification } from "maplibre-gl";

export type BasemapKind = "satellite" | "map";
export const BASEMAP_KINDS: BasemapKind[] = ["satellite", "map"];

// ------------------------------------------------------------------ store (module level, shared by every map)

const KEY = "mb.basemap";
const DEFAULT_KIND: BasemapKind = "satellite";

function readStored(): BasemapKind {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "map" || v === "satellite" ? v : DEFAULT_KIND;
  } catch {
    return DEFAULT_KIND;
  }
}

let current: BasemapKind = readStored();
const listeners = new Set<() => void>();

export function getBasemap(): BasemapKind {
  return current;
}

export function setBasemap(kind: BasemapKind) {
  if (kind !== "satellite" && kind !== "map") return;
  try {
    window.localStorage.setItem(KEY, kind);
  } catch {
    /* private mode / blocked storage: the choice still applies for this page */
  }
  if (kind === current) return;
  current = kind;
  for (const fn of [...listeners]) fn();
  try {
    // same-tab broadcast for code that listens on window (detail = the new kind)
    window.dispatchEvent(new CustomEvent("mb:basemap", { detail: kind }));
  } catch {
    /* no window */
  }
}

export function subscribeBasemap(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The chosen basemap ("satellite" by default). Works inside and outside a map. */
export function useBasemap(): BasemapKind {
  return useSyncExternalStore(subscribeBasemap, getBasemap, getBasemap);
}

// another tab changed the choice
try {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const v = readStored();
    if (v === current) return;
    current = v;
    for (const fn of [...listeners]) fn();
  });
} catch {
  /* no window (never in the browser build) */
}

// ------------------------------------------------------------------ sources

export const SRC_OSM = "osm";
export const SRC_SAT = "esri-imagery";
export const SRC_SAT_ROADS = "esri-roads";
export const SRC_SAT_PLACES = "esri-places";
export const SRC_TERRAIN = "terrain-dem";

export const LAYER_GROUND = "basemap-ground";
export const LAYER_OSM = "basemap-osm";
export const LAYER_SAT = "basemap-sat";
export const LAYER_SAT_ROADS = "basemap-sat-roads";
export const LAYER_SAT_PLACES = "basemap-sat-places";
/** Topmost basemap layer: data layers go above it. */
export const BASEMAP_TOP_LAYER = LAYER_SAT_PLACES;

/** Credits shown in the map attribution while each basemap is drawn (plain text + one link). */
export const CREDIT = {
  map: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  satellite: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  labels: "Labels © Esri",
  terrain: "Terrain: Mapzen / AWS Terrain Tiles (SRTM, GMTED2010, ETOPO1 and others)",
} as const;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/** All basemap sources; attribution is handled by BaseMap (it follows the visible basemap). */
export function basemapSources(): Record<string, SourceSpecification> {
  return {
    [SRC_OSM]: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 },
    // Esri tile URLs are {z}/{y}/{x}
    [SRC_SAT]: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
    [SRC_SAT_ROADS]: { type: "raster", tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
    [SRC_SAT_PLACES]: { type: "raster", tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
  };
}

/** Terrain (3D): AWS Terrain Tiles, Terrarium encoding, {z}/{x}/{y}. Added only when 3D is first switched on. */
export const TERRAIN_SOURCE: RasterDEMSourceSpecification = {
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  tileSize: 256,
  maxzoom: 15,
  encoding: "terrarium",
};
export const TERRAIN_EXAGGERATION = 1.4;
export const TERRAIN_PITCH = 55;

/** Which basemap layers are visible for a kind; `tiles` false = plain dark ground (offline / tiles failing). */
export function basemapVisibility(kind: BasemapKind, tiles: boolean, labels: boolean): Record<string, boolean> {
  const sat = tiles && kind === "satellite";
  return {
    [LAYER_OSM]: tiles && kind === "map",
    [LAYER_SAT]: sat,
    [LAYER_SAT_ROADS]: sat && labels,
    [LAYER_SAT_PLACES]: sat && labels,
  };
}

/** Basemap layers, bottom to top. Data layers added later sit above all of them. */
export function basemapLayers(ground: string, kind: BasemapKind, tiles: boolean): LayerSpecification[] {
  const vis = basemapVisibility(kind, tiles, true);
  const v = (id: string) => (vis[id] ? "visible" : "none") as "visible" | "none";
  return [
    { id: LAYER_GROUND, type: "background", paint: { "background-color": ground } },
    {
      id: LAYER_OSM,
      type: "raster",
      source: SRC_OSM,
      layout: { visibility: v(LAYER_OSM) },
      // "Map": dimmed and desaturated so data layers read on a projector (unchanged from the first build)
      paint: { "raster-opacity": 0.85, "raster-saturation": -0.75, "raster-brightness-max": 0.42, "raster-contrast": 0.1, "raster-fade-duration": 0 },
    },
    {
      id: LAYER_SAT,
      type: "raster",
      source: SRC_SAT,
      layout: { visibility: v(LAYER_SAT) },
      // "Satellite": natural colour, only a light darkening so pipes and markers stay legible
      paint: { "raster-opacity": 1, "raster-brightness-max": 0.9, "raster-fade-duration": 150 },
    },
    { id: LAYER_SAT_ROADS, type: "raster", source: SRC_SAT_ROADS, layout: { visibility: v(LAYER_SAT_ROADS) }, paint: { "raster-opacity": 0.8, "raster-fade-duration": 150 } },
    { id: LAYER_SAT_PLACES, type: "raster", source: SRC_SAT_PLACES, layout: { visibility: v(LAYER_SAT_PLACES) }, paint: { "raster-opacity": 1, "raster-fade-duration": 150 } },
  ];
}
