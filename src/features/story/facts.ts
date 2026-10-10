// Every figure the story screens show, loaded from data/ through the API or computed from it.
// Each part loads independently, so a held-back file (pipes, twin, HydroFingerprint results) only blanks its own figures.
import { useMemo } from "react";
import { api, useApi, type ApiError } from "../../api";
import { fmt, fmtDate, pm, unit, withUnit, type Lang } from "../../i18n";
import type { HfResultsResponse, PipesSummary, SpotProps, TwinResponse } from "../../types";
import { ASSUMED_LEAK_LPS_FALLBACK, CITED, DAYS_PER_YEAR, LITRES_PER_M3, SECONDS_PER_DAY } from "./sources";

export type StoryFacts = {
  spots: SpotProps[] | null;
  spotsError: ApiError | null;
  spotsLoading: boolean;
  rainCheck: string | null;
  /** mm of rain between passes, parsed from the spot file's rain_check text */
  rainMm: number | null;
  passes: string[];
  accuracyM: number | null;
  dispatch: SpotProps[]; // within 40 m of a real pipe (on_pipe_40m), closest first
  rejected: SpotProps[];
  lead: SpotProps | null; // closest dispatched spot (W7)

  pipes: PipesSummary | null;
  pipesError: ApiError | null;

  twin: TwinResponse | null; // scenario svc1 (leak at the spot)
  twinError: ApiError | null;
  /** leak size: from the twin's svc1 scenario, or the ASSUMED fallback when the twin is held back */
  leakLps: number;
  leakFromTwin: boolean;
  leakM3Day: number;
  leakM3Year: number;

  hf: HfResultsResponse | null;
  hfError: ApiError | null;
};

export function useStoryFacts(): StoryFacts {
  const spots = useApi(() => api.spots(), []);
  const pipes = useApi(() => api.pipesSummary(), []);
  const twin = useApi(() => api.twin("svc1"), []);
  const hf = useApi(() => api.hfResults(), []);

  return useMemo<StoryFacts>(() => {
    const list = spots.data?.features.map((f) => f.properties) ?? null;
    const rainCheck = spots.data?.rain_check ?? null;
    const m = rainCheck?.match(/([\d.]+)\s*mm/);
    const dispatch = (list ?? []).filter((s) => s.on_pipe_40m).sort((a, b) => a.nearest_pipe_m - b.nearest_pipe_m);
    const rejected = (list ?? []).filter((s) => !s.on_pipe_40m);
    const acc = list && list.length ? Math.max(...list.map((s) => s.position_accuracy_m)) : null;
    const leakFromTwin = typeof twin.data?.leak_lps === "number";
    const leakLps = leakFromTwin ? (twin.data!.leak_lps as number) : ASSUMED_LEAK_LPS_FALLBACK;
    const leakM3Day = (leakLps * SECONDS_PER_DAY) / LITRES_PER_M3;
    return {
      spots: list,
      spotsError: spots.error,
      spotsLoading: spots.loading,
      rainCheck,
      rainMm: m ? Number(m[1]) : null,
      passes: list?.[0]?.passes ?? [],
      accuracyM: acc,
      dispatch,
      rejected,
      lead: dispatch[0] ?? null,
      pipes: pipes.data,
      pipesError: pipes.error,
      twin: twin.data,
      twinError: twin.error,
      leakLps,
      leakFromTwin,
      leakM3Day,
      leakM3Year: leakM3Day * DAYS_PER_YEAR,
      hf: hf.data,
      hfError: hf.error,
    };
  }, [spots.data, spots.error, spots.loading, pipes.data, pipes.error, twin.data, twin.error, hf.data, hf.error]);
}

/**
 * "±50 m". In Arabic the sign is kept with its number (LTR isolate), otherwise the bidi algorithm shows "50±".
 * Plain text, so it also works inside cue strings.
 */
export function pmText(n: number, lang: Lang): string {
  return lang === "ar" ? `\u2066±${fmt(n, 0)}\u2069 ${unit("m", lang)}` : pm(n, "m", lang);
}

/** Short day-month list of the radar passes: "4 → 16 → 28 Sep 2026". */
export function passesLabel(passes: string[], lang: Lang): string {
  if (!passes.length) return "–";
  const last = fmtDate(passes[passes.length - 1], lang);
  const days = passes.slice(0, -1).map((p) => String(Number(p.slice(8, 10))));
  return [...days, last].join(" → ");
}

/** Template variables for presenter cues and summary lines. Missing data → "–". */
export function storyVars(f: StoryFacts, lang: Lang): Record<string, string> {
  const r = f.hf?.robustness;
  const s9 = f.hf?.scale9;
  const res = f.hf?.results;
  const ids = f.dispatch.map((s) => s.spot_id);
  const and = lang === "ar" ? " و" : " and ";
  return {
    nrw: withUnit(CITED.nrw.value, "%", lang),
    days: withUnit(CITED.repeatDays.value, "days", lang, 0),
    dates: passesLabel(f.passes, lang),
    rain: f.rainMm === null ? "–" : withUnit(f.rainMm, "mm", lang, 1, 1),
    n: f.spots ? fmt(f.spots.length, 0) : "–",
    km: f.pipes ? withUnit(f.pipes.km_total, "km", lang, 0) : "–",
    nGo: f.spots ? fmt(f.dispatch.length, 0) : "–",
    nNo: f.spots ? fmt(f.rejected.length, 0) : "–",
    ids: ids.length ? ids.join(and) : "–",
    lead: f.lead?.spot_id ?? "–",
    leadM: f.lead ? withUnit(f.lead.nearest_pipe_m, "m", lang, 0) : "–",
    leadPipe: f.lead?.nearest_pipe ?? "–",
    acc: f.accuracyM === null ? "–" : pmText(f.accuracyM, lang),
    leak: withUnit(f.leakLps, "L/s", lang),
    perDay: withUnit(f.leakM3Day, "m3/day", lang),
    perYear: withUnit(f.leakM3Year, "m3/year", lang, 0),
    nSvc: f.twin ? fmt(f.twin.stats.n_drop_gt1m_excl_svc, 0) : "–",
    nFar: f.twin ? fmt(f.twin.stats.n_drop_gt1m.far15, 0) : "–",
    nJ: f.twin ? fmt(f.twin.stats.junctions, 0) : "–",
    gaps: res ? fmt(res.network.gaps_found, 0) : "–",
    sims: res ? fmt(res.n_scenarios, 0) : "–",
    ai: r ? withUnit(r.nominal_test.bayes_all5, "%", lang) : "–",
    alg: r ? withUnit(r.nominal_test.algorithm_all5, "%", lang) : "–",
    aiS: r ? withUnit(r.shifted_test.bayes_all5, "%", lang) : "–",
    algS: r ? withUnit(r.shifted_test.algorithm_all5, "%", lang) : "–",
    mlp9: s9 ? withUnit(s9.eval_15.mlp_all, "%", lang) : "–",
    alg9: s9 ? withUnit(s9.algorithm_15.all, "%", lang) : "–",
  };
}

/** "{a} of {b}" templating shared by cues and cards. */
export const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
