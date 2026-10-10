// Map layers for the twin screen: pipes (width = diameter, colour = pressure or drop), junctions,
// W7 ±position circle, labelled key locations and the leak ring. Rendered inside <BaseMap>.
import maplibregl, { type MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { useI18n, useT, withUnit } from "../../i18n";
import { useGeoJson, useMap } from "../../map/BaseMap";
import { circlePolygon } from "../../map/geo";
import { COLORS } from "../../map/style";
import type { TwinResponse } from "../../types";
import { KEY_COLORS, edgesGeoJson, nodesGeoJson, type ScenarioSummary } from "./model";
import { twinStrings } from "./strings";

const EDGE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  ["+", 0.5, ["*", 0.22, ["get", "in"]]],
  15,
  ["+", 1.2, ["*", 0.5, ["get", "in"]]],
  18,
  ["+", 2.5, ["*", 1.1, ["get", "in"]]],
];
/** Same stops plus a dark edge on both sides: the casing under the coloured pipes (legible on satellite imagery). */
const EDGE_CASING_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  ["+", 1.7, ["*", 0.22, ["get", "in"]]],
  15,
  ["+", 3.2, ["*", 0.5, ["get", "in"]]],
  18,
  ["+", 5, ["*", 1.1, ["get", "in"]]],
];

export function TwinEdges({ data, ends }: { data: TwinResponse; ends: [number, number][] }) {
  const fc = useMemo(() => edgesGeoJson(data, ends), [data, ends]);
  useGeoJson("twin-edges", fc, [
    {
      id: "twin-edges-casing",
      type: "line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": COLORS.casing, "line-width": EDGE_CASING_WIDTH as never },
    },
    {
      id: "twin-edges",
      type: "line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "col"], "line-opacity": ["get", "op"], "line-width": EDGE_WIDTH as never },
    },
  ]);
  return null;
}

export function TwinNodes({ data, onPick }: { data: TwinResponse; onPick: (i: number, lngLat: [number, number]) => void }) {
  const map = useMap();
  const fc = useMemo(() => nodesGeoJson(data), [data]);
  useGeoJson("twin-nodes", fc, [
    {
      id: "twin-nodes",
      type: "circle",
      layout: { "circle-sort-key": ["get", "k"] },
      paint: {
        "circle-color": ["get", "col"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["*", 1.8, ["get", "r"]], 15, ["*", 3.6, ["get", "r"]], 18, ["*", 6, ["get", "r"]]] as never,
        "circle-stroke-color": "#081218",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 1.4] as never,
      },
    },
  ]);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    if (!map) return;
    const click = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const c = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
      pick.current(Number(f.properties?.i), c);
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");
    map.on("click", "twin-nodes", click);
    map.on("mouseenter", "twin-nodes", enter);
    map.on("mouseleave", "twin-nodes", leave);
    return () => {
      map.off("click", "twin-nodes", click);
      map.off("mouseenter", "twin-nodes", enter);
      map.off("mouseleave", "twin-nodes", leave);
    };
  }, [map]);
  return null;
}

/** ±position-accuracy circle around the radar wet spot (from the spot file). */
export function SpotCircle({ lon, lat, radiusM }: { lon: number; lat: number; radiusM: number }) {
  const fc = useMemo(() => ({ type: "FeatureCollection" as const, features: [circlePolygon(lon, lat, radiusM)] }), [lon, lat, radiusM]);
  useGeoJson("twin-spot-acc", fc, [
    { id: "twin-spot-acc-fill", type: "fill", paint: { "fill-color": KEY_COLORS.spot, "fill-opacity": 0.14 } },
    // dark casing under the dashed edge so the circle reads on the satellite photo
    { id: "twin-spot-acc-casing", type: "line", paint: { "line-color": COLORS.casingStrong, "line-width": 4 } },
    { id: "twin-spot-acc-line", type: "line", paint: { "line-color": KEY_COLORS.spot, "line-width": 2, "line-dasharray": [2, 1.5] } },
  ]);
  return null;
}

export type KeyMark = {
  id: string;
  lon: number;
  lat: number;
  kind: "supply" | "spot" | "logger" | "break" | "main";
  label: string;
  /** label side (physical: the map does not mirror in RTL) */
  side: "n" | "s" | "e" | "w";
  dim?: boolean;
  /** keep the label on a phone (others show only their symbol there) */
  focus?: boolean;
};

/** HTML markers with labels (no glyphs on the offline map). */
export function KeyMarkers({ marks }: { marks: KeyMark[] }) {
  const map = useMap();
  const { dir } = useI18n();
  const key = JSON.stringify(marks);
  useEffect(() => {
    if (!map) return;
    const made = marks.map((m) => {
      const el = document.createElement("div");
      el.className = `twin-key twin-key-${m.kind} twin-key-${m.side}${m.dim ? " is-dim" : ""}${m.focus ? " is-focus" : ""}`;
      const sym = document.createElement("span");
      sym.className = "twin-key-sym";
      sym.setAttribute("aria-hidden", "true");
      const lab = document.createElement("span");
      lab.className = "twin-key-label";
      lab.dir = dir;
      lab.textContent = m.label;
      el.append(sym, lab);
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", m.label);
      return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([m.lon, m.lat]).addTo(map);
    });
    return () => made.forEach((mk) => mk.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, dir]);
  return null;
}

/** Pulsing ring at the leak or break location of the current scenario. */
export function LeakRing({ s }: { s: ScenarioSummary }) {
  const map = useMap();
  const at = s.leakAt;
  useEffect(() => {
    if (!map || !at) return;
    const el = document.createElement("div");
    el.className = "twin-ring";
    el.setAttribute("aria-hidden", "true");
    const inner = document.createElement("span");
    inner.className = "twin-ring-inner";
    // static core: the pulse fades to nothing, the core keeps the spot visible on the satellite photo at every frame
    const core = document.createElement("span");
    core.className = "twin-ring-core";
    el.append(inner, core);
    const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([at.lon, at.lat]).addTo(map);
    return () => {
      mk.remove();
    };
  }, [map, at]);
  return null;
}

/** Fit the zone once, leaving room for the side panel (desktop) or the bottom sheet (phone). */
export function FitZone({ bounds }: { bounds: [number, number, number, number] }) {
  const map = useMap();
  const { dir } = useI18n();
  const done = useRef(false);
  useEffect(() => {
    if (!map || done.current) return;
    done.current = true;
    const box = map.getContainer();
    const w = box.clientWidth;
    const h = box.clientHeight;
    const phone = w <= 640;
    const panel = Math.min(420, w * 0.4) + 32; // side panel (inline-start)
    const legend = w >= 1100 ? 160 : 60; // legend (inline-end, lower corner)
    const padding = phone
      ? { top: 96, bottom: Math.round(h * 0.52) + 16, left: 16, right: 16 }
      : { top: 40, bottom: 40, left: dir === "rtl" ? legend : panel, right: dir === "rtl" ? panel : legend };
    try {
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding, animate: false },
      );
    } catch {
      /* container too small to fit: keep the default view */
    }
  }, [map, bounds, dir]);
  return null;
}

/** Click a junction: elevation, normal-day pressure and (in a scenario) the drop. */
export function useJunctionPopup(data: TwinResponse | null) {
  const map = useMap();
  const t = useT(twinStrings);
  const { lang, dir } = useI18n();
  const popup = useRef<maplibregl.Popup | null>(null);
  useEffect(() => () => void popup.current?.remove(), []);
  useEffect(() => {
    popup.current?.remove();
  }, [data?.scenario, lang]);
  return (i: number, lngLat: [number, number]) => {
    if (!map || !data) return;
    const n = data.nodes[i];
    if (!n) return;
    const box = document.createElement("div");
    box.className = "twin-pop";
    box.dir = dir;
    const rows: [string, string][] = [
      [t("popElev"), withUnit(n.z, "m", lang, 1)],
      [t("popPressure"), withUnit(n.p, "m", lang, 1)],
    ];
    if (data.scenario !== "base") rows.push([t("popDrop"), withUnit(n.value, "m", lang, 2)]);
    const h = document.createElement("strong");
    h.textContent = t("popJunction");
    box.append(h);
    for (const [k, v] of rows) {
      const r = document.createElement("div");
      const a = document.createElement("span");
      a.textContent = `${k}: `;
      const b = document.createElement("span");
      b.className = "num";
      b.textContent = v;
      r.append(a, b);
      box.append(r);
    }
    popup.current?.remove();
    popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(lngLat).setDOMContent(box).addTo(map);
  };
}
