// Map layers for the Overview and Spot detail maps. Each renders nothing; it adds sources/layers to the BaseMap.
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { radar, type RadarBounds } from "../../api";
import { useI18n } from "../../i18n";
import { useGeoJson, useImageOverlay, useMap } from "../../map/BaseMap";
import { circlePolygon } from "../../map/geo";
import { COLORS, pipeLineLayer } from "../../map/style";
import type { LngLat, PipesFC, SpotFeature } from "../../types";

export const PIPES_LAYER = "ov-pipes";
const ACC_FILL = "ov-acc-fill";

/** Real pipes styled by class (colours and widths from src/map/style.ts). */
export function PipesLayer({ data, id = PIPES_LAYER, beforeId = ACC_FILL }: { data: PipesFC | null; id?: string; beforeId?: string }) {
  useGeoJson(id, data, [pipeLineLayer(id)], { beforeId });
  return null;
}

/** Highlight of one pipe (the nearest pipe on the spot page). */
export function HighlightPipe({ coords }: { coords: LngLat[] | null }) {
  const data = useMemo(
    () => (coords && coords.length > 1 ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] } : null),
    [coords],
  );
  useGeoJson(
    "ov-near",
    data,
    [
      { id: "ov-near-halo", type: "line", layout: { "line-cap": "round" }, paint: { "line-color": "#E6EEF1", "line-width": 7, "line-opacity": 0.25 } },
      { id: "ov-near-line", type: "line", layout: { "line-cap": "round" }, paint: { "line-color": "#E6EEF1", "line-width": 2.5 } },
    ],
    { beforeId: ACC_FILL },
  );
  return null;
}

export type RadarState = { on: boolean; date: string; pol: "hh" | "hv"; mask: boolean };

/** Dates of the HH backscatter PNGs listed in public/radar/bounds.json (hh_<date>.png), sorted. */
export const radarDates = (b: RadarBounds | null) =>
  (b?.files ?? [])
    .map((f) => /^hh_(\d{4}-\d{2}-\d{2})\.png$/.exec(f)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort();

export const changeFile = (b: RadarBounds | null, pol: "hh" | "hv", date: string) => {
  const f = `change_${pol}_${date}.png`;
  return b?.files.includes(f) ? f : null;
};

/** Grey HH backscatter for the chosen pass + the change overlay (16 / 28 Sep) + the persistent wet mask. */
export function RadarLayers({ bounds, state }: { bounds: RadarBounds; state: RadarState }) {
  const map = useMap();
  // always below the pipes; if the pipes have not loaded yet, at least below the ±50 m circle
  const below = map?.getLayer(PIPES_LAYER) ? PIPES_LAYER : ACC_FILL;
  const bb: [number, number, number, number] = [bounds.bounds.west, bounds.bounds.south, bounds.bounds.east, bounds.bounds.north];
  const hh = bounds.files.includes(`hh_${state.date}.png`) ? radar.url(`hh_${state.date}.png`) : null;
  const ch = changeFile(bounds, state.pol, state.date);
  const mask = bounds.files.includes("wet_mask.png") ? radar.url("wet_mask.png") : null;
  useImageOverlay("ov-radar-hh", hh, bb, { opacity: 0.88, visible: state.on, beforeId: below });
  // the change layer sits under the wet mask (and both under the pipes)
  useImageOverlay("ov-radar-change", ch ? radar.url(ch) : null, bb, { opacity: 0.95, visible: state.on && Boolean(ch), beforeId: "ov-radar-mask" });
  useImageOverlay("ov-radar-mask", mask, bb, { opacity: 1, visible: state.on && state.mask, beforeId: below });
  return null;
}

/** ±position_accuracy_m circle around the selected spot. */
export function AccuracyCircle({ spot }: { spot: SpotFeature | null }) {
  const data = useMemo(() => {
    const p = spot?.properties;
    return { type: "FeatureCollection", features: p ? [circlePolygon(p.lon, p.lat, p.position_accuracy_m)] : [] };
  }, [spot]);
  useGeoJson("ov-acc", data, [
    { id: ACC_FILL, type: "fill", paint: { "fill-color": COLORS.uncertainty } },
    { id: "ov-acc-line", type: "line", paint: { "line-color": COLORS.uncertaintyLine, "line-width": 1.6, "line-dasharray": [2, 1.5] } },
  ]);
  return null;
}

/** W1–W7 as HTML markers with labels (no glyphs needed, works offline). */
export function SpotMarkers({ spots, selected, onSelect }: { spots: SpotFeature[]; selected: string | null; onSelect?: (id: string) => void }) {
  const map = useMap();
  const { t } = useI18n();
  const els = useRef(new Map<string, HTMLElement>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    els.current.clear();
    for (const f of spots) {
      const id = f.properties.spot_id;
      const el = document.createElement(onSelectRef.current ? "button" : "div");
      if (el instanceof HTMLButtonElement) el.type = "button";
      el.className = "ov-marker";
      el.dir = "ltr";
      el.setAttribute("aria-label", t({ en: `Wet spot ${id}`, ar: `البقعة الرطبة ${id}` }));
      const dot = document.createElement("span");
      dot.className = "ov-marker-dot";
      const label = document.createElement("span");
      label.className = "ov-marker-label";
      label.textContent = id;
      el.append(dot, label);
      if (onSelectRef.current)
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current?.(id);
        });
      markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(f.geometry.coordinates).addTo(map));
      els.current.set(id, el);
    }
    return () => {
      for (const m of markers) m.remove();
      els.current.clear();
    };
  }, [map, spots, t]);

  useEffect(() => {
    for (const [id, el] of els.current) {
      el.classList.toggle("is-selected", id === selected);
      if (el instanceof HTMLButtonElement) el.setAttribute("aria-pressed", String(id === selected));
    }
  }, [selected, spots, t]);
  return null;
}
