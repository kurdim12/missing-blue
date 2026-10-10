// Pure computations for the twin screen. Every figure shown on screen is derived here from
// GET /api/twin/mazar (data/twin/mazar_zone_results.json); nothing is typed in by hand.
import type { LngLat, TwinEdge, TwinNode, TwinPoint, TwinResponse, TwinScenario } from "../../types";
import { COLORS, RAMP, pipeClass } from "../../map/style";

export const SCENARIOS: TwinScenario[] = ["base", "svc1", "far15", "m5", "m15"];
/** Scenarios the pitch uses; m5/m15 are shown behind "more". */
export const PRIMARY: TwinScenario[] = ["base", "svc1", "far15"];
export const EXTRA: TwinScenario[] = ["m5", "m15"];

/** Same threshold as `stats.n_drop_gt1m` in the results file (a definition, not a measurement). */
export const DROP_THRESHOLD_M = 1;

// ------------------------------------------------------------------ geometry
const R = 6371008.8;
export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Index of the node nearest to a point (brute force: 850 nodes). */
export function nearestNode(nodes: TwinNode[], p: { lat: number; lon: number }) {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = metres(nodes[i], p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { index: best, distance_m: bd };
}

/** Each edge's two end junctions (node indices). Edge ends are snapped to junctions in the pipeline (within a few metres). */
export function edgeEnds(nodes: TwinNode[], edges: TwinEdge[]): [number, number][] {
  // grid hash ~ 0.001° cells so each lookup scans a handful of nodes
  const cell = (lon: number, lat: number) => `${Math.floor(lon * 1000)}:${Math.floor(lat * 1000)}`;
  const grid = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const k = cell(n.lon, n.lat);
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  const find = ([lon, lat]: LngLat) => {
    const cx = Math.floor(lon * 1000);
    const cy = Math.floor(lat * 1000);
    let best = -1;
    let bd = Infinity;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const i of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const d = metres(nodes[i], { lon, lat });
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
    return best >= 0 ? best : nearestNode(nodes, { lon, lat }).index;
  };
  return edges.map((e) => [find(e.c[0]), find(e.c[e.c.length - 1])]);
}

/** Edges touching a point (within `tolM`), e.g. the pipe at a supply point. */
export function edgesAt(edges: TwinEdge[], p: { lat: number; lon: number }, tolM = 5) {
  return edges.filter((e) => {
    const a = e.c[0];
    const b = e.c[e.c.length - 1];
    return metres({ lon: a[0], lat: a[1] }, p) <= tolM || metres({ lon: b[0], lat: b[1] }, p) <= tolM;
  });
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ------------------------------------------------------------------ per-scenario summary (computed from node values)
export type ScenarioSummary = {
  scenario: TwinScenario;
  isBase: boolean;
  leakLps: number | null;
  leakAt: (TwinPoint & { key: string }) | null;
  leakNode: number | null;
  leakNodeValue: number | null;
  /** junctions whose value (drop) exceeds the threshold, all of them */
  nAbove: number;
  /** same, without the leak junction itself */
  nOther: number;
  nNodes: number;
  maxValue: number;
  maxNode: number;
  loggerNode: number;
  loggerValue: number;
  medianPressure: number;
  nNegative: number;
};

export function summarise(r: TwinResponse, loggerAt: TwinPoint): ScenarioSummary {
  const isBase = r.scenario === "base";
  const values = r.nodes.map((n) => n.value);
  const leak = r.leak_at ? nearestNode(r.nodes, r.leak_at) : null;
  const above = values.filter((v) => v > DROP_THRESHOLD_M).length;
  const leakVal = leak ? values[leak.index] : null;
  let maxNode = 0;
  values.forEach((v, i) => {
    if (v > values[maxNode]) maxNode = i;
  });
  const logger = nearestNode(r.nodes, loggerAt);
  const pressures = r.nodes.map((n) => n.p);
  return {
    scenario: r.scenario,
    isBase,
    leakLps: r.leak_lps,
    leakAt: r.leak_at,
    leakNode: leak ? leak.index : null,
    leakNodeValue: leakVal,
    nAbove: isBase ? 0 : above,
    nOther: isBase ? 0 : above - (leakVal !== null && leakVal > DROP_THRESHOLD_M ? 1 : 0),
    nNodes: r.nodes.length,
    maxValue: values[maxNode],
    maxNode,
    loggerNode: logger.index,
    loggerValue: values[logger.index],
    medianPressure: median(pressures),
    nNegative: pressures.filter((p) => p < 0).length,
  };
}

// ------------------------------------------------------------------ colours (one place; legend uses the same stops)
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
function ramp(stops: [number, string][], v: number) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i];
    if (v <= x1) {
      const [x0, c0] = stops[i - 1];
      const t = (v - x0) / (x1 - x0);
      const a = hex(c0);
      const b = hex(c1);
      return toHex(a.map((av, k) => av + (b[k] - av) * t));
    }
  }
  return stops[stops.length - 1][1];
}

const RED = RAMP[5];
const AMBER = RAMP[4];
const BLUE = RAMP[2];
/** Pressure on a normal day: red = weak, amber ≈ 25 m, blue = well supplied (same idea as the single-file demo). */
export const PRESSURE_STOPS: [number, string][] = [
  [5, RED],
  [25, AMBER],
  [40, BLUE],
];
/** Drop: below the threshold grey ("no change"), then amber → red. */
export const NO_CHANGE = pipeClass("service").color;
export const DROP_STOPS: [number, string][] = [
  [DROP_THRESHOLD_M, AMBER],
  [15, RED],
];
export const pressureColor = (p: number) => ramp(PRESSURE_STOPS, p);
export const dropColor = (d: number) => (d <= DROP_THRESHOLD_M ? NO_CHANGE : ramp(DROP_STOPS, d));
export const cssGradient = (stops: [number, string][]) => `linear-gradient(90deg, ${stops.map((s) => s[1]).join(", ")})`;

export const KEY_COLORS = {
  supply: "#E6EEF1",
  spot: COLORS.spot,
  logger: COLORS.logger,
  leak: COLORS.dispatch,
};

// ------------------------------------------------------------------ GeoJSON for the map
export function edgesGeoJson(r: TwinResponse, ends: [number, number][]) {
  const base = r.scenario === "base";
  return {
    type: "FeatureCollection" as const,
    features: r.edges.map((e, i) => {
      const [a, b] = ends[i];
      const va = r.nodes[a]?.value ?? 0;
      const vb = r.nodes[b]?.value ?? 0;
      const v = base ? (va + vb) / 2 : Math.max(va, vb);
      const affected = !base && v > DROP_THRESHOLD_M;
      return {
        type: "Feature" as const,
        properties: { in: e.in, v, col: base ? pressureColor(v) : dropColor(v), op: base ? 0.9 : affected ? 1 : 0.5 },
        geometry: { type: "LineString" as const, coordinates: e.c },
      };
    }),
  };
}

export function nodesGeoJson(r: TwinResponse) {
  const base = r.scenario === "base";
  const feats = r.nodes.map((n, i) => {
    const affected = !base && n.value > DROP_THRESHOLD_M;
    return {
      type: "Feature" as const,
      id: i,
      properties: {
        i,
        v: n.value,
        p: n.p,
        z: n.z,
        col: base ? pressureColor(n.value) : dropColor(n.value),
        r: base ? 1 : affected ? 1.6 : 0.8,
        // draw affected junctions on top
        k: base ? 0 : n.value,
      },
      geometry: { type: "Point" as const, coordinates: [n.lon, n.lat] as LngLat },
    };
  });
  return { type: "FeatureCollection" as const, features: feats };
}

export function boundsOfNodes(nodes: TwinNode[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of nodes) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

/** ¾ instead of 0.75 for pipe sizes. */
export function inchText(v: number, lang: "en" | "ar") {
  const frac: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾", "1.5": "1½" };
  const s = frac[String(v)] ?? String(Math.round(v * 100) / 100);
  return lang === "ar" ? `${s} إنش` : `${s}"`;
}

/** Unicode isolate for LTR tokens (W7, GI 100) inside Arabic strings built with t(..., vars). */
export const iso = (s: string) => `⁨${s}⁩`;
