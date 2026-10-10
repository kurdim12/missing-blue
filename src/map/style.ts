// Map styling defined ONCE: pipe classes, wet-spot colours, default view. Import from here; do not redefine colours in screens.
import type { ExpressionSpecification, LineLayerSpecification } from "maplibre-gl";
import type { Bi } from "../i18n";
import type { PipeClass } from "../types";

/** Default view: the radar grid (public/radar/bounds.json) = Karak, Mu'tah and al-Mazar. [west, south, east, north] */
export const KARAK_BOUNDS: [number, number, number, number] = [35.63, 31.03, 35.79, 31.24];
/** Mazar twin area around W7 (for the twin screen's first view). */
export const MAZAR_CENTER: [number, number] = [35.6947, 31.0672];

export type PipeClassDef = { key: PipeClass; color: string; width: number; label: Bi; range: Bi };

/** Classes as defined in CLAUDE.md: trunk >= 8", main 4–6", distribution 1.5–3", service < 1.5", unknown = numeric CAD layers. */
export const PIPE_CLASSES: PipeClassDef[] = [
  { key: "trunk", color: "#FF5A4E", width: 3, label: { en: "Trunk main", ar: "خط ناقل رئيسي" }, range: { en: '≥ 8"', ar: "8 إنش فأكثر" } },
  { key: "main", color: "#FFB547", width: 2.2, label: { en: "Main", ar: "خط رئيسي" }, range: { en: '4–6"', ar: "4–6 إنش" } },
  { key: "distribution", color: "#6FE3C7", width: 1.5, label: { en: "Distribution", ar: "خط توزيع" }, range: { en: '1.5–3"', ar: "1.5–3 إنش" } },
  { key: "service", color: "#9FB4BE", width: 1, label: { en: "Service line", ar: "خط خدمة" }, range: { en: '< 1.5"', ar: "أقل من 1.5 إنش" } },
  { key: "unknown", color: "#6E838D", width: 1, label: { en: "Unknown size", ar: "قطر غير معروف" }, range: { en: "CAD layer without size", ar: "طبقة CAD دون قطر" } },
];
export const pipeClass = (k: string) => PIPE_CLASSES.find((c) => c.key === k) ?? PIPE_CLASSES[PIPE_CLASSES.length - 1];

/** Same rule as the pipeline, for twin edges that carry only a diameter. */
export function pipeClassOfDiameter(inch: number | null | undefined): PipeClass {
  if (inch === null || inch === undefined || !Number.isFinite(inch)) return "unknown";
  if (inch >= 8) return "trunk";
  if (inch >= 4) return "main";
  if (inch >= 1.5) return "distribution";
  return "service";
}

const matchClass = (prop: "color" | "width"): ExpressionSpecification =>
  ["match", ["get", "class"], ...PIPE_CLASSES.flatMap((c) => [c.key, c[prop]]), PIPE_CLASSES[PIPE_CLASSES.length - 1][prop]] as unknown as ExpressionSpecification;

export const PIPE_COLOR_EXPR = matchClass("color");
export const PIPE_WIDTH_EXPR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  ["*", 0.5, matchClass("width")],
  15,
  ["*", 1.4, matchClass("width")],
  18,
  ["*", 3, matchClass("width")],
];

/** Ready-made line layer for a pipes GeoJSON source (feature property `class`). Put pipeCasingLayer(id) under it. */
export const pipeLineLayer = (id = "pipes"): Omit<LineLayerSpecification, "source"> => ({
  id,
  type: "line",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": PIPE_COLOR_EXPR, "line-width": PIPE_WIDTH_EXPR, "line-opacity": 0.95 },
});

/** Dark casing width: the class width at each zoom plus a dark edge on both sides (same stops as PIPE_WIDTH_EXPR). */
export const PIPE_CASING_WIDTH_EXPR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  ["+", 1.2, ["*", 0.5, matchClass("width")]],
  15,
  ["+", 2.2, ["*", 1.4, matchClass("width")]],
  18,
  ["+", 3, ["*", 3, matchClass("width")]],
];

/** The id of the casing that pipeCasingLayer(id) adds (radar overlays go below it). */
export const casingId = (id: string) => `${id}-casing`;

/**
 * Dark casing drawn UNDER a pipe line so the class colours read over bright satellite imagery and still over the dark map.
 * Use as [pipeCasingLayer(id, opacity), pipeLineLayer(id)] in the same useGeoJson call (casing first = below).
 */
export const pipeCasingLayer = (id = "pipes", opacity = 1): Omit<LineLayerSpecification, "source"> => ({
  id: casingId(id),
  type: "line",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": COLORS.casing, "line-width": PIPE_CASING_WIDTH_EXPR, "line-opacity": opacity },
});

/** Casing + coloured line for a pipes source; `opacity` dims both (context pipes on the crew and HydroFingerprint maps). */
export const pipeLayers = (id = "pipes", opacity = 0.95): Omit<LineLayerSpecification, "source">[] => {
  const line = pipeLineLayer(id);
  return [pipeCasingLayer(id, Math.min(1, opacity + 0.05)), { ...line, paint: { ...line.paint, "line-opacity": opacity } }];
};

/** Wet spots and AI verdict colours. */
export const COLORS = {
  spot: "#3FA2FF",
  spotHalo: "rgba(63,162,255,0.25)",
  dispatch: "#FF5A4E",
  reject: "#8FA3AC",
  uncertainty: "rgba(63,162,255,0.16)", // ±50 m circle fill
  uncertaintyLine: "#3FA2FF",
  logger: "#B79CFF",
  gap: "#FFB547",
  ground: "#081218", // map background when offline
  /** Dark edge under lines and around circles: keeps data legible over bright satellite imagery (and on the dark map). */
  casing: "rgba(3, 10, 14, 0.62)",
  /** Stronger dark edge for single highlighted features (nearest pipe, ±50 m circle outline). */
  casingStrong: "rgba(3, 10, 14, 0.78)",
};

/** Sequential ramp for pressure / drop (dark → bright). Use with ["interpolate", ["linear"], ["get", "value"], ...]. */
export const RAMP = ["#123A5A", "#1667D9", "#3FA2FF", "#6FE3C7", "#FFB547", "#FF5A4E"];
