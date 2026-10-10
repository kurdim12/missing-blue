// Pure helpers that turn wet-spot / pipe records into display text. No numbers are typed here:
// everything is parsed or computed from the records passed in.
import { Fragment, createElement, type ReactNode } from "react";
import { fmt, fmtDate, unit, withUnit, type Lang } from "../../i18n";
import { pipeClassOfDiameter } from "../../map/style";
import type { PipeClass, PipeProps, SpotProps } from "../../types";
import { LAND_COVER, MATERIALS, PIPE_CLASS_NOUN, overviewStrings } from "./strings";

// ------------------------------------------------------------------ inches
const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };

/** 0.75 -> ¾" (en) / ¾ إنش (ar); 1.5 -> 1½"; 2 -> 2" */
export function inchText(n: number | null | undefined, lang: Lang): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  const rest = Math.round((n - whole) * 100) / 100;
  const frac = FRACTIONS[String(rest)];
  const s = frac ? `${whole > 0 ? whole : ""}${frac}` : fmt(n, 2);
  return `${s}${unit("in", lang)}`;
}

/** '3/4" galvanized iron' -> { inch: 0.75, material: "galvanized_iron" } (the wet-spot file's readable label). */
export function parsePipeLabel(label: string): { inch: number | null; material: string | null; materialText: string } {
  const m = /^\s*([\d./\s-]+)"\s*(.*)$/.exec(label || "");
  let inch: number | null = null;
  let rest = label || "";
  if (m) {
    rest = m[2];
    let sum = 0;
    let ok = false;
    for (const part of m[1].trim().split(/[\s-]+/)) {
      const fr = /^(\d+)\/(\d+)$/.exec(part);
      const v = fr ? Number(fr[1]) / Number(fr[2]) : Number(part);
      if (Number.isFinite(v)) {
        sum += v;
        ok = true;
      }
    }
    inch = ok ? sum : null;
  }
  const key = rest.trim().toLowerCase().replace(/\s+/g, "_");
  return { inch, material: MATERIALS[key] ? key : null, materialText: rest.trim() };
}

/** '3/4" galvanized iron' -> '¾" · galvanized iron' / '¾ إنش · الحديد المجلفن' (plain text; unknown wording stays as written). */
export function pipeLabelText(label: string | null | undefined, lang: Lang, phrase = false): string {
  const p = parsePipeLabel(label ?? "");
  const size = inchText(p.inch, lang);
  if (!size) return label ?? "–";
  const mat = p.material ? MATERIALS[p.material][lang] : p.materialText;
  // phrase: '¾" galvanized iron' / 'الحديد المجلفن ¾ إنش' for running sentences (presenter cues)
  if (phrase) return lang === "ar" ? `${mat} ${size}` : `${size} ${mat}`;
  return `${size} · ${mat}`;
}

export type PipeDesc = { inch: number | null; materialKey: string | null; materialText: string; cls: PipeClass; layer: string; id: string | null };

/** Prefer the pipe file's record (when present and matching the spot file's CAD layer); fall back to the spot file's label. */
export function describePipe(spot: SpotProps, feature?: (PipeProps & { matches_spot_file?: boolean }) | null): PipeDesc {
  const parsed = parsePipeLabel(spot.nearest_pipe);
  const useFeature = Boolean(feature && feature.matches_spot_file !== false);
  const inch = useFeature && feature!.diameter_in !== null ? feature!.diameter_in : parsed.inch;
  const materialKey = useFeature && feature!.material && MATERIALS[feature!.material] ? feature!.material : parsed.material;
  return {
    inch,
    materialKey,
    materialText: parsed.materialText,
    cls: useFeature ? feature!.class : pipeClassOfDiameter(inch),
    layer: spot.nearest_pipe_layer,
    id: useFeature ? feature!.pipe_id : null,
  };
}

export const materialName = (d: PipeDesc, lang: Lang) => (d.materialKey ? MATERIALS[d.materialKey][lang] : d.materialText);
export const classNoun = (cls: string, lang: Lang) => (PIPE_CLASS_NOUN[cls] ?? PIPE_CLASS_NOUN.unknown)[lang];

// ------------------------------------------------------------------ land cover
export type LandCoverYear = { year: number; class: string };

export const landCoverFromSpot = (p: SpotProps): LandCoverYear[] =>
  ([2023, 2024, 2025] as const).map((year) => ({ year, class: p[`landcover_${year}`] }));

export const lcName = (cls: string, lang: Lang) => LAND_COVER[cls]?.[lang] ?? cls;

/** Consecutive years with the same class: Built area 2023–2025; Cropland 2023 → Open rangeland 2024–2025. */
export function landCoverGroups(lc: LandCoverYear[], lang: Lang): { name: string; range: string }[] {
  const groups: { cls: string; y0: number; y1: number }[] = [];
  for (const r of lc) {
    const g = groups[groups.length - 1];
    if (g && g.cls === r.class) g.y1 = r.year;
    else groups.push({ cls: r.class, y0: r.year, y1: r.year });
  }
  return groups.map((g) => ({ name: lcName(g.cls, lang), range: g.y0 === g.y1 ? String(g.y0) : `${g.y0}–${g.y1}` }));
}

/** Count of years whose class is "Built area". */
export const builtYears = (lc: LandCoverYear[]) => lc.filter((r) => r.class === "Built area").length;

// ------------------------------------------------------------------ rain check text
/** "ERA5 via Open-Meteo: 0.0 mm at Mazar and Karak between 2026-09-04 and 2026-09-28" -> { mm: 0, d0, d1 } */
export function parseRain(s: string | null | undefined): { mm: number; d0: string | null; d1: string | null } | null {
  if (!s) return null;
  const m = /([\d.]+)\s*mm/.exec(s);
  if (!m) return null;
  const dates = s.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return { mm: Number(m[1]), d0: dates[0] ?? null, d1: dates[1] ?? null };
}

/** The spot file's rain sentence in the screen language ("0 mm at Mazar and Karak between 4 Sep 2026 and 28 Sep 2026 …");
 *  the raw text when it cannot be parsed. */
export function rainSentence(s: string | null | undefined, lang: Lang): string {
  const r = parseRain(s);
  if (!r || !r.d0 || !r.d1) return s ?? "–";
  return overviewStrings[lang].rainText
    .replace("{mm}", withUnit(r.mm, "mm", lang, 1))
    .replace("{d0}", fmtDate(r.d0, lang))
    .replace("{d1}", fmtDate(r.d1, lang));
}

// ------------------------------------------------------------------ geometry
/** Great-circle distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371008.8;
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ------------------------------------------------------------------ rich templates
/** rich("Spot centre {d} from …", { d: <b>6 m</b> }) -> ReactNode[] (placeholders become nodes). */
export function rich(template: string, vars: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/(\{\w+\})/g);
  return parts.map((p, i) => {
    const m = /^\{(\w+)\}$/.exec(p);
    return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : p);
  });
}

/** Dates of the radar passes in a spot record: first = baseline, the rest = later passes. */
export function passDates(p: SpotProps, lang: Lang) {
  const [d0, ...later] = p.passes;
  return { d0: fmtDate(d0, lang), d1: later[0] ? fmtDate(later[0], lang) : "", d2: later[1] ? fmtDate(later[1], lang) : "" };
}
