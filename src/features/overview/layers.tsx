// Map layers for the Overview and Spot detail maps. Each renders nothing; it adds sources/layers to the BaseMap.
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { radar, type RadarBounds } from "../../api";
import { useI18n } from "../../i18n";
import { useGeoJson, useImageOverlay, useMap } from "../../map/BaseMap";
import { circlePolygon } from "../../map/geo";
import { COLORS, casingId, pipeLayers } from "../../map/style";
import type { LngLat, PipesFC, SpotFeature } from "../../types";
import { useBasemapKind } from "./basemapKind";

export const PIPES_LAYER = "ov-pipes";
const ACC_FILL = "ov-acc-fill";

/** Real pipes styled by class (colours and widths from src/map/style.ts), on a dark casing so they read over satellite imagery. */
export function PipesLayer({ data, id = PIPES_LAYER, beforeId = ACC_FILL }: { data: PipesFC | null; id?: string; beforeId?: string }) {
  const layers = useMemo(() => pipeLayers(id), [id]);
  useGeoJson(id, data, layers, { beforeId });
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
      // dark halo (not white) so the white line stands out on bright imagery as well as on the dark map
      { id: "ov-near-halo", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.casingStrong, "line-width": 7.5 } },
      { id: "ov-near-line", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FFFFFF", "line-width": 3 } },
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

/**
 * HH backscatter opacity per basemap. On the dark map the grey radar image is the ground (0.88). On satellite imagery it is
 * lowered so the photo still reads under it, while the change and wet-mask pixels (drawn above it at full strength) stay clear.
 */
export const RADAR_HH_OPACITY = { map: 0.88, satellite: 0.42 } as const;

/** Grey HH backscatter for the chosen pass + the change overlay (16 / 28 Sep) + the persistent wet mask. */
export function RadarLayers({ bounds, state }: { bounds: RadarBounds; state: RadarState }) {
  const map = useMap();
  const kind = useBasemapKind();
  // always below the pipes and their casing; if the pipes have not loaded yet, at least below the ±50 m circle
  const below = map?.getLayer(casingId(PIPES_LAYER)) ? casingId(PIPES_LAYER) : map?.getLayer(PIPES_LAYER) ? PIPES_LAYER : ACC_FILL;
  const bb: [number, number, number, number] = [bounds.bounds.west, bounds.bounds.south, bounds.bounds.east, bounds.bounds.north];
  const hh = bounds.files.includes(`hh_${state.date}.png`) ? radar.url(`hh_${state.date}.png`) : null;
  const ch = changeFile(bounds, state.pol, state.date);
  const mask = bounds.files.includes("wet_mask.png") ? radar.url("wet_mask.png") : null;
  // Order bottom → top: HH grey, change, wet mask, then the pipes. The hooks run in this order, so the mask is added first
  // (under the pipes), the change goes under the mask and the HH grey under the change (or under the mask on the baseline pass).
  useImageOverlay("ov-radar-mask", mask, bb, { opacity: 1, visible: state.on && state.mask, beforeId: below });
  useImageOverlay("ov-radar-change", ch ? radar.url(ch) : null, bb, { opacity: 0.95, visible: state.on && Boolean(ch), beforeId: mask ? "ov-radar-mask" : below });
  useImageOverlay("ov-radar-hh", hh, bb, {
    opacity: RADAR_HH_OPACITY[kind],
    visible: state.on,
    beforeId: ch ? "ov-radar-change" : mask ? "ov-radar-mask" : below,
  });
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
    // solid dark casing under the dashed blue edge: the circle reads on bright imagery and on the dark map
    { id: "ov-acc-casing", type: "line", paint: { "line-color": COLORS.casingStrong, "line-width": 4 } },
    { id: "ov-acc-line", type: "line", paint: { "line-color": COLORS.uncertaintyLine, "line-width": 2, "line-dasharray": [2, 1.5] } },
  ]);
  return null;
}

const NEAR_DEG = 0.004; // ~400 m: labels of two spots this close overlap the other dot at the whole-grid zoom

/**
 * Label side per spot: in a close pair the western spot gets its label on the left of its dot, the eastern one keeps it on
 * the right, so no label sits under the other spot's dot (W1 / W2, W5 / W6). Map space: not mirrored in RTL.
 */
export function labelSides(spots: SpotFeature[]): Map<string, "left" | "side"> {
  const out = new Map<string, "left" | "side">();
  const sorted = [...spots].sort((a, b) => a.properties.spot_id.localeCompare(b.properties.spot_id));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (out.has(a.properties.spot_id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (out.has(b.properties.spot_id)) continue;
      const [ax, ay] = a.geometry.coordinates;
      const [bx, by] = b.geometry.coordinates;
      if (Math.abs(ax - bx) < NEAR_DEG && Math.abs(ay - by) < NEAR_DEG) {
        out.set(a.properties.spot_id, ax <= bx ? "left" : "side");
        out.set(b.properties.spot_id, ax <= bx ? "side" : "left");
        break;
      }
    }
    if (!out.has(a.properties.spot_id)) out.set(a.properties.spot_id, "side");
  }
  return out;
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
    const sides = labelSides(spots);
    els.current.clear();
    for (const f of spots) {
      const id = f.properties.spot_id;
      const el = document.createElement(onSelectRef.current ? "button" : "div");
      if (el instanceof HTMLButtonElement) el.type = "button";
      el.className = `ov-marker${sides.get(id) === "left" ? " ov-label-left" : ""}`;
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
