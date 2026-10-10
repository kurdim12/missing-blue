// MapLibre base map: OSM raster when online, plain dark ground when offline (navigator.onLine + tile errors).
// Children render inside the map's context and add their own sources/layers with the hooks below.
//
//   <BaseMap bounds={KARAK_BOUNDS} onReady={(map) => ...}>
//     <PipesLayer />            // a component that calls useGeoJson("pipes", data, [pipeLineLayer()])
//   </BaseMap>
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
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n, useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";
import { COLORS, KARAK_BOUNDS } from "./style";

const MapCtx = createContext<MlMap | null>(null);
/** The loaded map (null until the style has loaded). */
export const useMap = () => useContext(MapCtx);

const OSM_LAYER = "basemap-osm";

function baseStyle(online: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      { id: "basemap-ground", type: "background", paint: { "background-color": COLORS.ground } },
      {
        id: OSM_LAYER,
        type: "raster",
        source: "osm",
        layout: { visibility: online ? "visible" : "none" },
        // dimmed and desaturated so data layers read on a projector
        paint: { "raster-opacity": 0.85, "raster-saturation": -0.75, "raster-brightness-max": 0.42, "raster-contrast": 0.1, "raster-fade-duration": 0 },
      },
    ],
  };
}

export type BaseMapProps = {
  /** Initial view [west, south, east, north]; defaults to the Karak radar grid. */
  bounds?: [number, number, number, number];
  padding?: number;
  maxZoom?: number;
  interactive?: boolean;
  /** Extra attribution, e.g. "NISAR: NASA/ISRO (ASF DAAC)". */
  attribution?: string;
  className?: string;
  /** Called once with the loaded map. */
  onReady?: (map: MlMap) => void;
  children?: ReactNode;
};

export function BaseMap({ bounds = KARAK_BOUNDS, padding = 24, maxZoom = 18, interactive = true, attribution, className = "", onReady, children }: BaseMapProps) {
  const t = useT(shellStrings);
  const { dir } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [tilesFailed, setTilesFailed] = useState(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // create once
  useEffect(() => {
    if (!ref.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: baseStyle(navigator.onLine),
      bounds,
      fitBoundsOptions: { padding },
      maxZoom,
      interactive,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: attribution }), "bottom-right");
    m.touchZoomRotate.disableRotation();
    let failures = 0;
    m.on("error", (e: { sourceId?: string; error?: Error }) => {
      if (e.sourceId === "osm" && ++failures >= 3) setTilesFailed(true);
    });
    m.on("load", () => {
      setMap(m);
      onReadyRef.current?.(m);
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      setMap(null);
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // online / offline
  useEffect(() => {
    const up = () => {
      setOnline(true);
      setTilesFailed(false);
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

  const showTiles = online && !tilesFailed;
  useEffect(() => {
    if (map?.getLayer(OSM_LAYER)) map.setLayoutProperty(OSM_LAYER, "visibility", showTiles ? "visible" : "none");
  }, [map, showTiles]);

  return (
    <div className={`basemap ${className}`}>
      <div ref={ref} className="basemap-canvas" />
      {!showTiles ? <div className="basemap-offline">{t("mapOffline")}</div> : null}
      <MapCtx.Provider value={map}>{map ? children : null}</MapCtx.Provider>
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
