// MapLibre base map. Default background = SATELLITE (Esri World Imagery, natural colour, Esri roads + place labels on top);
// "Map" = the dark, dimmed OpenStreetMap style. The choice is shared by every map and persisted (src/map/basemaps.ts).
// Offline (navigator.onLine) or >= 3 tile errors on the active basemap -> plain dark ground + a note; data layers keep working.
// Optional 3D relief (allow3d): AWS terrain tiles, off at start, never persisted.
// Children render inside the map's context and add their own sources/layers with the hooks below.
//
//   <BaseMap bounds={KARAK_BOUNDS} onReady={(map) => ...}>
//     <PipesLayer />            // a component that calls useGeoJson("pipes", data, [pipeLineLayer()])
//   </BaseMap>
//
// Layer code can adapt paint to the background:
//   const { photo } = useBasemapView();   // true while the satellite photo is actually drawn under the data
//   const kind = useBasemap();            // "satellite" | "map" (the user's choice, also outside a map)
//
// No glyphs are configured (offline-safe), so do not use symbol text layers: use maplibregl.Marker / HTML overlays for labels.
import maplibregl, {
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
  type ImageSource,
  type LayerSpecification,
  type Map as MlMap,
  type StyleSpecification,
} from "maplibre-gl";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n, useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";
import { COLORS, KARAK_BOUNDS } from "./style";
import {
  BASEMAP_KINDS,
  CREDIT,
  SRC_OSM,
  SRC_SAT,
  SRC_SAT_PLACES,
  SRC_SAT_ROADS,
  SRC_TERRAIN,
  TERRAIN_EXAGGERATION,
  TERRAIN_PITCH,
  TERRAIN_SOURCE,
  basemapLayers,
  basemapSources,
  basemapVisibility,
  getBasemap,
  setBasemap,
  useBasemap,
  type BasemapKind,
} from "./basemaps";

export { getBasemap, setBasemap, subscribeBasemap, useBasemap, type BasemapKind } from "./basemaps";

const MapCtx = createContext<MlMap | null>(null);
/** The loaded map (null until the style has loaded). */
export const useMap = () => useContext(MapCtx);

/** What is drawn under the data layers of the enclosing <BaseMap>. */
export type BasemapView = {
  /** the user's choice */
  kind: BasemapKind;
  /** background tiles are drawn (false = offline / tiles failing: plain dark ground) */
  tiles: boolean;
  /** the satellite photo is drawn (kind === "satellite" && tiles) */
  photo: boolean;
  /** 3D relief is on */
  terrain: boolean;
};
const ViewCtx = createContext<BasemapView | null>(null);
/** Inside <BaseMap>: what the background currently shows. Outside a map: derived from the stored choice. */
export function useBasemapView(): BasemapView {
  const v = useContext(ViewCtx);
  const kind = useBasemap();
  return v ?? { kind, tiles: true, photo: kind === "satellite", terrain: false };
}

type Failed = { satellite: boolean; map: boolean; labels: boolean; terrain: boolean };
const NONE_FAILED: Failed = { satellite: false, map: false, labels: false, terrain: false };

function sourceGroup(sourceId: string | undefined): keyof Failed | null {
  if (sourceId === SRC_SAT) return "satellite";
  if (sourceId === SRC_OSM) return "map";
  if (sourceId === SRC_SAT_ROADS || sourceId === SRC_SAT_PLACES) return "labels";
  if (sourceId === SRC_TERRAIN) return "terrain";
  return null;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function baseStyle(kind: BasemapKind, online: boolean): StyleSpecification {
  return { version: 8, sources: basemapSources(), layers: basemapLayers(COLORS.ground, kind, online) };
}

export type BaseMapProps = {
  /** Initial view [west, south, east, north]; defaults to the Karak radar grid. */
  bounds?: [number, number, number, number];
  padding?: number;
  maxZoom?: number;
  interactive?: boolean;
  /** Extra attribution, e.g. "NISAR: NASA/ISRO (ASF DAAC)". The basemap credit is added automatically. */
  attribution?: string;
  className?: string;
  /** Show the Satellite | Map switch (default: on interactive maps). */
  basemapSwitch?: boolean;
  /** Offer the 3D relief toggle (large desktop maps). Starts 2D; not persisted. */
  allow3d?: boolean;
  /** Called once with the loaded map. */
  onReady?: (map: MlMap) => void;
  children?: ReactNode;
};

export function BaseMap({
  bounds = KARAK_BOUNDS,
  padding = 24,
  maxZoom = 18,
  interactive = true,
  attribution,
  className = "",
  basemapSwitch,
  allow3d = false,
  onReady,
  children,
}: BaseMapProps) {
  const t = useT(shellStrings);
  const { dir } = useI18n();
  const kind = useBasemap();
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [failed, setFailed] = useState<Failed>(NONE_FAILED);
  const [terrain, setTerrain] = useState(false);
  const errors = useRef<Record<keyof Failed, number>>({ satellite: 0, map: 0, labels: 0, terrain: 0 });
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // create once (all basemap sources declared up front; only layer visibility changes later)
  useEffect(() => {
    if (!ref.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: baseStyle(getBasemap(), navigator.onLine),
      bounds,
      fitBoundsOptions: { padding },
      maxZoom,
      interactive,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.on("error", (e: { sourceId?: string; error?: Error }) => {
      const g = sourceGroup(e.sourceId);
      if (!g) return;
      const limit = g === "terrain" ? 2 : 3;
      if (++errors.current[g] >= limit) setFailed((f) => (f[g] ? f : { ...f, [g]: true }));
    });
    m.on("load", () => {
      setMap(m);
      (window as unknown as { __mbMap?: MlMap }).__mbMap = m; // latest map, for console / browser checks
      onReadyRef.current?.(m);
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      setMap(null);
      const w = window as unknown as { __mbMap?: MlMap };
      if (w.__mbMap === m) delete w.__mbMap;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // online / offline (coming back online retries every basemap)
  useEffect(() => {
    const up = () => {
      errors.current = { satellite: 0, map: 0, labels: 0, terrain: 0 };
      setFailed(NONE_FAILED);
      setOnline(true);
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // zoom buttons on the inline-end side (top-left in Arabic) so start-side overlays never cover them
  useEffect(() => {
    if (!map || !interactive) return;
    const ctl = new maplibregl.NavigationControl({ showCompass: false });
    map.addControl(ctl, dir === "rtl" ? "top-left" : "top-right");
    return () => {
      try {
        map.removeControl(ctl);
      } catch {
        /* map removed */
      }
    };
  }, [map, dir, interactive]);

  const tiles = online && !failed[kind];
  const labels = !failed.labels;
  const terrainAvailable = allow3d && online && !failed.terrain;
  const terrainOn = terrain && terrainAvailable;

  // basemap layer visibility (a hidden layer requests no tiles)
  useEffect(() => {
    if (!map) return;
    const vis = basemapVisibility(kind, tiles, labels);
    for (const [id, on] of Object.entries(vis)) {
      if (!map.getLayer(id)) continue;
      const want = on ? "visible" : "none";
      if (map.getLayoutProperty(id, "visibility") !== want) map.setLayoutProperty(id, "visibility", want);
    }
  }, [map, kind, tiles, labels]);

  // attribution follows what is drawn: screen credits + imagery (satellite) or OSM (map) + terrain (3D)
  useEffect(() => {
    if (!map) return;
    const parts: string[] = [];
    if (attribution) parts.push(attribution);
    if (tiles && kind === "satellite") parts.push(labels ? `${CREDIT.satellite} · ${CREDIT.labels}` : CREDIT.satellite);
    if (tiles && kind === "map") parts.push(CREDIT.map);
    if (terrainOn) parts.push(CREDIT.terrain);
    const ctl = new maplibregl.AttributionControl({ compact: true, customAttribution: parts.length ? parts : undefined });
    map.addControl(ctl, "bottom-right");
    return () => {
      try {
        map.removeControl(ctl);
      } catch {
        /* map removed */
      }
    };
  }, [map, attribution, kind, tiles, labels, terrainOn]);

  // 3D relief: terrain + pitch on; flat and pitch 0 off (also when terrain tiles fail or the connection drops)
  useEffect(() => {
    if (!map) return;
    const duration = reducedMotion() ? 0 : 900;
    try {
      if (terrainOn) {
        if (!map.getSource(SRC_TERRAIN)) map.addSource(SRC_TERRAIN, TERRAIN_SOURCE);
        map.setTerrain({ source: SRC_TERRAIN, exaggeration: TERRAIN_EXAGGERATION });
        map.easeTo({ pitch: TERRAIN_PITCH, duration });
      } else {
        if (map.getTerrain()) map.setTerrain(null);
        if (map.getPitch() !== 0) map.easeTo({ pitch: 0, duration });
      }
    } catch {
      /* map removed mid-change */
    }
  }, [map, terrainOn]);

  useEffect(() => {
    if (terrain && !terrainAvailable) setTerrain(false);
  }, [terrain, terrainAvailable]);

  const choose = (k: BasemapKind) => {
    // picking a basemap again retries it after tile errors
    errors.current[k] = 0;
    if (k === "satellite") errors.current.labels = 0;
    setFailed((f) => (f[k] || (k === "satellite" && f.labels) ? { ...f, [k]: false, ...(k === "satellite" ? { labels: false } : {}) } : f));
    setBasemap(k);
  };

  const view = useMemo<BasemapView>(() => ({ kind, tiles, photo: tiles && kind === "satellite", terrain: terrainOn }), [kind, tiles, terrainOn]);
  const showSwitch = basemapSwitch ?? interactive;

  return (
    <div className={`basemap ${className}`}>
      <div ref={ref} className="basemap-canvas" />
      {showSwitch ? (
        <div className={`basemap-switch${interactive ? "" : " basemap-switch-nozoom"}`} role="group" aria-label={t("basemapGroup")}>
          <div className="basemap-switch-seg">
            {BASEMAP_KINDS.map((k) => {
              const tip = k === "satellite" ? t("basemapSatelliteTip") : t("basemapMapTip");
              const down = !online || failed[k];
              return (
                <button
                  key={k}
                  type="button"
                  className="basemap-switch-btn"
                  aria-pressed={kind === k}
                  title={down ? `${tip} (${t("basemapUnavailable")})` : tip}
                  onClick={() => choose(k)}
                >
                  {k === "satellite" ? t("basemapSatellite") : t("basemapMap")}
                </button>
              );
            })}
          </div>
          {allow3d ? (
            <button
              type="button"
              className="basemap-switch-btn basemap-switch-3d"
              aria-pressed={terrainOn}
              aria-disabled={!terrainAvailable}
              title={terrainAvailable ? t("terrain3dTip") : t("terrain3dOff")}
              onClick={() => {
                if (terrainAvailable) setTerrain((v) => !v);
              }}
            >
              {t("terrain3d")}
            </button>
          ) : null}
        </div>
      ) : null}
      {!tiles ? (
        <div
          className={`basemap-offline${showSwitch ? "" : " basemap-offline-noswitch"}${interactive ? "" : " basemap-offline-nozoom"}`}
          role="status"
        >
          <span className="basemap-offline-long">{t("mapOffline")}</span>
          <span className="basemap-offline-short">{t("mapOfflineShort")}</span>
        </div>
      ) : null}
      <ViewCtx.Provider value={view}>
        <MapCtx.Provider value={map}>{map ? children : null}</MapCtx.Provider>
      </ViewCtx.Provider>
    </div>
  );
}

// ------------------------------------------------------------------ hooks for screens

type LayerNoSource = Omit<LayerSpecification, "source"> & { id: string };

/**
 * Add/update a GeoJSON source and its layers; removed on unmount.
 *   useGeoJson("spots", spotsFC, [{ id: "spots-dot", type: "circle", paint: {...} }]);
 * Passing new `data` calls setData (cheap). Changing `layers` re-adds them.
 */
export function useGeoJson(
  id: string,
  data: GeoJSONSourceSpecification["data"] | object | null | undefined,
  layers: LayerNoSource[],
  opts: { beforeId?: string; promoteId?: string } = {},
) {
  const map = useMap();
  const layerIds = useRef<string[]>([]);
  const layersKey = JSON.stringify(layers);

  useEffect(() => {
    if (!map || !data) return;
    const src = map.getSource(id) as GeoJSONSource | undefined;
    if (src) src.setData(data as Parameters<GeoJSONSource["setData"]>[0]);
    else map.addSource(id, { type: "geojson", data: data as GeoJSONSourceSpecification["data"], ...(opts.promoteId ? { promoteId: opts.promoteId } : {}) });
  }, [map, id, data, opts.promoteId]);

  useEffect(() => {
    if (!map || !data || !map.getSource(id)) return;
    for (const l of layerIds.current) if (map.getLayer(l)) map.removeLayer(l);
    const before = opts.beforeId && map.getLayer(opts.beforeId) ? opts.beforeId : undefined;
    for (const l of layers) map.addLayer({ ...l, source: id } as LayerSpecification, before);
    layerIds.current = layers.map((l) => l.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, layersKey, Boolean(data), opts.beforeId]);

  useEffect(
    () => () => {
      if (!map) return;
      try {
        for (const l of layerIds.current) if (map.getLayer(l)) map.removeLayer(l);
        if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map already removed */
      }
      layerIds.current = [];
    },
    [map, id],
  );
}

/**
 * Image overlay (radar PNGs) on [west, south, east, north] bounds; removed on unmount.
 *   useImageOverlay("radar", radar.url("change_hh_2026-09-16.png"), KARAK_BOUNDS, { opacity: 0.7, beforeId: "pipes" });
 */
export function useImageOverlay(
  id: string,
  url: string | null,
  bounds: [number, number, number, number],
  opts: { opacity?: number; visible?: boolean; beforeId?: string } = {},
) {
  const map = useMap();
  const { opacity = 0.75, visible = true, beforeId } = opts;
  const [w, s, e, n] = bounds;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];

  useEffect(() => {
    if (!map || !url) return;
    const src = map.getSource(id) as ImageSource | undefined;
    if (src) src.updateImage({ url, coordinates });
    else {
      map.addSource(id, { type: "image", url, coordinates });
      const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": opacity, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, before);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, url, w, s, e, n]);

  useEffect(() => {
    if (!map || !map.getLayer(id)) return;
    map.setPaintProperty(id, "raster-opacity", opacity);
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }, [map, id, opacity, visible, url]);

  useEffect(
    () => () => {
      if (!map) return;
      try {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map already removed */
      }
    },
    [map, id],
  );
}
