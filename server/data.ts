// Shared data access for the API (and for the AI routes in triage.ts / workorder.ts).
// Every loader reads a file in data/ once and caches it. Missing files throw MissingDataError,
// which index.ts turns into an honest 404 JSON message (never a crash).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.cwd();
export const DATA = join(ROOT, "data");

export type Bilingual = { en: string; ar: string };

export const FILES = {
  spots: "wet_spots/wet_spots.geojson",
  pipes: "pipes/karak_pipes.geojson",
  twin: "twin/mazar_zone_results.json",
  hfModel: "hydrofingerprint/hf_live_model.json",
  hfResults: "hydrofingerprint/hydrofingerprint_results.json",
  hfRobustness: "hydrofingerprint/hydrofingerprint_robustness.json",
  hfScale9: "hydrofingerprint/hydrofingerprint_scale9.json",
  hfGapsPick: "hydrofingerprint/hf_gaps_pick.json",
} as const;

/** Why a file may be absent in a fresh clone, and what to do about it. */
const MISSING: Record<string, { message: Bilingual; hint: string }> = {
  [FILES.pipes]: {
    message: {
      en: "The Karak pipe network is not in the public repo (critical infrastructure, no licence stated). Download it locally with: npm run fetch:pipes",
      ar: "شبكة أنابيب الكرك غير موجودة في المستودع العام (بنية تحتية حساسة، ولا ترخيص معلن). نزّلها محليًا بالأمر: npm run fetch:pipes",
    },
    hint: "npm run fetch:pipes",
  },
  [FILES.twin]: {
    message: {
      en: "Held back from the public repo: the hydraulic twin contains Mazar-zone pipe coordinates. It is on the demo laptop only.",
      ar: "محجوب عن المستودع العام: التوأم الهيدروليكي يحتوي على إحداثيات أنابيب منطقة المزار. موجود على جهاز العرض فقط.",
    },
    hint: "held back: contains pipe coordinates",
  },
  [FILES.hfModel]: {
    message: {
      en: "Held back from the public repo: the HydroFingerprint live model contains logger sites on the Mazar pipes. It is on the demo laptop only.",
      ar: "محجوب عن المستودع العام: نموذج HydroFingerprint يحتوي على مواقع أجهزة تسجيل على أنابيب المزار. موجود على جهاز العرض فقط.",
    },
    hint: "held back: contains pipe coordinates",
  },
  [FILES.hfResults]: {
    message: {
      en: "Held back from the public repo: HydroFingerprint results contain gap and logger coordinates on the Mazar pipes.",
      ar: "محجوب عن المستودع العام: نتائج HydroFingerprint تحتوي على إحداثيات الفجوات وأجهزة التسجيل على أنابيب المزار.",
    },
    hint: "held back: contains pipe coordinates",
  },
  [FILES.hfGapsPick]: {
    message: {
      en: "Held back from the public repo: contains pipe coordinates.",
      ar: "محجوب عن المستودع العام: يحتوي على إحداثيات أنابيب.",
    },
    hint: "held back: contains pipe coordinates",
  },
};

export class MissingDataError extends Error {
  file: string;
  message_: Bilingual;
  hint: string;
  constructor(rel: string) {
    const info = MISSING[rel] ?? {
      message: { en: `Data file missing: data/${rel}`, ar: `ملف البيانات غير موجود: data/${rel}` },
      hint: "check data/",
    };
    super(info.message.en);
    this.file = `data/${rel}`;
    this.message_ = info.message;
    this.hint = info.hint;
  }
  toJSON() {
    return { error: "missing_data", file: this.file, message: this.message_, hint: this.hint };
  }
}

export const has = (rel: string) => existsSync(join(DATA, rel));

const cache = new Map<string, unknown>();
export function readData<T = any>(rel: string): T {
  if (cache.has(rel)) return cache.get(rel) as T;
  if (!has(rel)) throw new MissingDataError(rel);
  const v = JSON.parse(readFileSync(join(DATA, rel), "utf-8")) as T;
  cache.set(rel, v);
  return v;
}
export const tryReadData = <T = any>(rel: string): T | null => (has(rel) ? readData<T>(rel) : null);

// ---------------------------------------------------------------- spots
export type SpotProps = {
  spot_id: string;
  lat: number;
  lon: number;
  area_m2: number;
  hh_rise_db: number;
  hv_rise_db: number;
  passes: string[];
  nearest_pipe_m: number;
  nearest_pipe_layer: string;
  nearest_pipe: string;
  on_pipe_40m: boolean;
  ground_hh_db_400m: number;
  landcover_2023: string;
  landcover_2024: string;
  landcover_2025: string;
  position_accuracy_m: number;
};
export type SpotsFC = {
  type: "FeatureCollection";
  name?: string;
  rain_check?: string;
  features: { type: "Feature"; properties: SpotProps; geometry: { type: "Point"; coordinates: [number, number] } }[];
};
export const loadSpots = () => readData<SpotsFC>(FILES.spots);
export const findSpot = (id: string) =>
  loadSpots().features.find((f) => f.properties.spot_id.toLowerCase() === id.toLowerCase()) ?? null;

// ---------------------------------------------------------------- pipes
export type PipeProps = {
  pipe_id: string;
  cad_layer: string;
  diameter_in: number | null;
  diameter_mm: number | null;
  material: string | null;
  class: string;
  length_m: number;
  source_handle?: string;
};
export type PipeFeature = { type: "Feature"; properties: PipeProps; geometry: { type: "LineString"; coordinates: [number, number][] } };
type PipeIndex = { fc: { type: string; features: PipeFeature[]; [k: string]: unknown }; boxes: Float64Array };

let pipeIndex: PipeIndex | null = null;
export function loadPipes(): PipeIndex {
  if (pipeIndex) return pipeIndex;
  const fc = readData<{ type: string; features: PipeFeature[] }>(FILES.pipes);
  fc.features = fc.features.filter((f) => f.geometry && f.geometry.type === "LineString");
  const boxes = new Float64Array(fc.features.length * 4);
  fc.features.forEach((f, i) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of f.geometry.coordinates) {
      if (x < a) a = x;
      if (y < b) b = y;
      if (x > c) c = x;
      if (y > d) d = y;
    }
    boxes.set([a, b, c, d], i * 4);
  });
  pipeIndex = { fc, boxes };
  return pipeIndex;
}

export function pipesInBbox(bbox: [number, number, number, number] | null): PipeFeature[] {
  const { fc, boxes } = loadPipes();
  if (!bbox) return fc.features;
  const [w, s, e, n] = bbox;
  return fc.features.filter((_, i) => !(boxes[i * 4] > e || boxes[i * 4 + 2] < w || boxes[i * 4 + 1] > n || boxes[i * 4 + 3] < s));
}

/** Totals computed from the pipe file (count, km in total and by class). */
export function pipesSummary() {
  const { fc } = loadPipes();
  const byClass: Record<string, number> = {};
  let total = 0;
  for (const f of fc.features) {
    const m = f.properties.length_m || 0;
    total += m;
    byClass[f.properties.class] = (byClass[f.properties.class] || 0) + m;
  }
  const km = (m: number) => Math.round(m / 100) / 10;
  return {
    count: fc.features.length,
    km_total: km(total),
    km_by_class: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, km(v)])),
    source: `data/${FILES.pipes}`,
  };
}

/** Planar distance in metres from a point to a polyline (local equirectangular projection; fine at this scale). */
function distToLine(lon: number, lat: number, coords: [number, number][]) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110574;
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i - 1][0] - lon) * kx, ay = (coords[i - 1][1] - lat) * ky;
    const bx = (coords[i][0] - lon) * kx, by = (coords[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

/** The pipe feature closest to a point (identity only; the spot file's nearest_pipe_m stays the reported distance). */
export function nearestPipe(lon: number, lat: number, searchDeg = 0.02): PipeFeature | null {
  const near = pipesInBbox([lon - searchDeg, lat - searchDeg, lon + searchDeg, lat + searchDeg]);
  let best: PipeFeature | null = null, bd = Infinity;
  for (const f of near) {
    const d = distToLine(lon, lat, f.geometry.coordinates);
    if (d < bd) (bd = d), (best = f);
  }
  return best;
}

// ---------------------------------------------------------------- twin
export const TWIN_SCENARIOS = ["base", "svc1", "m5", "m15", "far15"] as const;
export type TwinScenario = (typeof TWIN_SCENARIOS)[number];
export const loadTwin = () => readData<any>(FILES.twin);
