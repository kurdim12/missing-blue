// HydroFingerprint side panels: per-gap probability bars, "Why AI and not a plain algorithm?", info-vs-loggers curve.
// Every figure comes from hf_live_model.json (live), hydrofingerprint_results.json, _robustness.json or _scale9.json.
import { useState } from "react";
import { ApiError } from "../../api";
import { fmt, unit, useI18n, useT, withUnit } from "../../i18n";
import { googleMapsUrl } from "../../map/geo";
import type { HfGap, HfLiveModel, HfResultsResponse } from "../../types";
import { Badge, EmptyState, Ltr, Panel, SourceNote, Tag } from "../../ui";
import { CONNECTED_AT, NOT_CONNECTED_AT, type HfEngine, type Verdict, verdictOf } from "./engine";
import { GAP_LETTERS, hfStrings } from "./strings";

const bitsText = (n: number, lang: "en" | "ar") => withUnit(n, "bits", lang, 2, 2);
/** A gap whose test accuracy with the full logger set stays below this is a coin toss: pressure cannot resolve it. */
const COIN_TOSS_BELOW = 0.6;

// ------------------------------------------------------------------ gap bars
export function GapBars({
  marg,
  gapIds,
  gaps,
  truth,
  reveal,
  nLoggers,
  atStart,
  gapAcc,
  onShow,
}: {
  marg: number[];
  gapIds: string[];
  gaps: HfGap[] | null;
  truth: number[];
  reveal: boolean;
  nLoggers: number;
  atStart: boolean;
  /** Per-gap test accuracy (fractions or %) of the AI with the full logger set, and the test-set size. */
  gapAcc: { pct: number[]; n: number } | null;
  onShow: (i: number) => void;
}) {
  const t = useT(hfStrings);
  const { lang } = useI18n();
  const verdicts = marg.map(verdictOf);
  const decided = verdicts.filter((v) => v !== "undecided").length;
  const right = verdicts.filter((v, i) => v !== "undecided" && (v === "connected") === (truth[i] === 1)).length;
  // Test accuracy per gap tells whether pressure can resolve a gap at all (Gap E sits at a coin toss).
  const isCoinToss = (i: number) => gapAcc !== null && gapAcc.pct[i] / 100 < COIN_TOSS_BELOW;

  const verdictLabel = (v: Verdict) => (v === "connected" ? t("connected") : v === "not_connected" ? t("notConnected") : t("undecided"));

  return (
    <div className="hf-gaps">
      <div className="hf-gap-scale" aria-hidden="true">
        <span />
        <span className="hf-bar-scale">
          <span>{t("scaleNot")}</span>
          <span>{t("scaleUnsure")}</span>
          <span>{t("scaleYes")}</span>
        </span>
        <span />
      </div>
      {marg.map((p, i) => {
        const v = verdicts[i];
        const g = gaps?.[i];
        const coinToss = isCoinToss(i);
        const truthOk = v !== "undecided" && (v === "connected") === (truth[i] === 1);
        return (
          <div key={gapIds[i]} className={`hf-gap is-${v}`}>
            <span className="hf-gap-name">
              {t("gapName", { g: GAP_LETTERS[i] })} <Ltr mono>{gapIds[i]}</Ltr>
            </span>
            <span
              className="hf-bar"
              role="img"
              aria-label={`${t("gapName", { g: GAP_LETTERS[i] })}: ${verdictLabel(v)} (P ${fmt(p, 2, 2)})`}
              title={`P = ${fmt(p, 2, 2)}`}
            >
              <span className="hf-bar-fill" style={{ width: `${Math.max(1.5, p * 100)}%` }} />
              <span className="hf-bar-tick" style={{ insetInlineStart: `${NOT_CONNECTED_AT * 100}%` }} />
              <span className="hf-bar-tick is-mid" style={{ insetInlineStart: "50%" }} />
              <span className="hf-bar-tick" style={{ insetInlineStart: `${CONNECTED_AT * 100}%` }} />
            </span>
            <span className="hf-gap-tag">
              <Tag tone={v === "connected" ? "blue" : v === "not_connected" ? "neutral" : "warn"}>{verdictLabel(v)}</Tag>
            </span>
            <p className="hf-gap-meta">
              {g ? t("gapMeta", { gap: withUnit(g.gap_m, "m", lang, 2), pipe: withUnit(g.pipe_in, "in", lang, 2) }) : null}
              {reveal ? (
                <span className={`hf-truth ${v === "undecided" ? "is-none" : truthOk ? "is-ok" : "is-bad"}`}>
                  {g ? " · " : null}
                  <strong>{truth[i] === 1 ? t("truthYes") : t("truthNo")}</strong> · {v === "undecided" ? t("noVerdict") : truthOk ? t("right") : t("wrong")}
                </span>
              ) : null}
            </p>
            {v === "undecided" && !atStart ? (
              coinToss && g ? (
                <div className="hf-field">
                  <p className="hf-field-main">{t("fieldValve")}</p>
                  {gapAcc ? <p className="hf-field-why">{t("fieldValveWhy", { acc: withUnit(gapAcc.pct[i], "%", lang, 1), n: fmt(gapAcc.n, 0) })}</p> : null}
                  <div className="hf-field-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onShow(i)}>
                      {t("showOnMap")}
                    </button>
                    <a className="btn btn-ghost btn-sm" href={googleMapsUrl((g.a.lat + g.b.lat) / 2, (g.a.lon + g.b.lon) / 2)} target="_blank" rel="noopener noreferrer">
                      {t("openMaps")}
                    </a>
                  </div>
                </div>
              ) : null
            ) : null}
          </div>
        );
      })}
      {!atStart && verdicts.some((v, i) => v === "undecided" && !isCoinToss(i)) ? <p className="hf-gap-more">{t("fieldMore")}</p> : null}
      {reveal ? <p className="hf-reveal-summary">{t("revealSummary", { d: decided, n: marg.length, r: right })}</p> : null}
      <p className="faint hf-small hf-gaps-foot">{t("gapsSub", { n: nLoggers })}</p>
    </div>
  );
}

// ------------------------------------------------------------------ why AI
type Check24 = { k: number; d: number; t: number; r: number; e: number; n: number; h0: number; h1: number };

function PairBars({ label, note, ai, alg, aiLabel }: { label: string; note?: string; ai: number; alg: number; aiLabel?: string }) {
  const t = useT(hfStrings);
  const { lang } = useI18n();
  return (
    <div className="hf-pair">
      <p className="hf-pair-label">{label}</p>
      <div className="hf-pair-row">
        <span className="hf-pair-name">{aiLabel ?? t("ai")}</span>
        <span className="hf-pair-track">
          <span className="hf-pair-fill is-ai" style={{ width: `${Math.max(1, ai)}%` }} />
        </span>
        <span className="hf-pair-val num">{withUnit(ai, "%", lang, 1)}</span>
      </div>
      <div className="hf-pair-row">
        <span className="hf-pair-name">{t("algorithm")}</span>
        <span className="hf-pair-track">
          <span className="hf-pair-fill is-alg" style={{ width: `${Math.max(1, alg)}%` }} />
        </span>
        <span className="hf-pair-val num">{withUnit(alg, "%", lang, 1)}</span>
      </div>
      {note ? <p className="hf-pair-note">{note}</p> : null}
    </div>
  );
}

export function WhyAi({ data, model, engine }: { data: HfResultsResponse; model: HfLiveModel | null; engine: HfEngine | null }) {
  const t = useT(hfStrings);
  const { lang } = useI18n();
  const rb = data.robustness;
  const sc = data.scale9;
  const nom = rb.nominal_test;
  const sh = rb.shifted_test;
  const nGaps = nom.bayes.length;
  const [check, setCheck] = useState<Check24 | null>(null);
  const [running, setRunning] = useState(false);
  const pct = (n: number) => withUnit(n, "%", lang, 1);
  const shiftNote = t("rowShiftNote", {
    r0: fmt(rb.shift.roughness_factor[0], 2),
    r1: fmt(rb.shift.roughness_factor[1], 2),
    d0: fmt(rb.shift.demand_multiplier[0], 2),
    d1: fmt(rb.shift.demand_multiplier[1], 2),
    tank: withUnit(rb.shift.tank_m, "m", lang),
    noise: withUnit(rb.shift.pressure_noise_m, "m", lang, 2),
  });
  // the "coin toss" gap: lowest AI accuracy, close to 50 %
  const worst = nom.bayes.reduce((b, v, i) => (v < nom.bayes[b] ? i : b), 0);

  const run24 = () => {
    if (!model || !engine) return;
    setRunning(true);
    setTimeout(() => {
      const k = model.ig.length;
      let d = 0, r = 0, e = 0, tot = 0, h0 = 0, h1 = 0;
      for (const c of model.cases) {
        let S = model.base.slice();
        let inf = engine.infer(S, c.x);
        h0 += inf.H;
        for (let s = 0; s < k; s++) {
          const g = engine.gains(S, inf, c.x);
          if (g.best === null) break;
          S = [...S, g.best];
          inf = engine.infer(S, c.x);
        }
        h1 += inf.H;
        inf.marg.forEach((p, gi) => {
          tot++;
          const v = verdictOf(p);
          if (v !== "undecided") {
            d++;
            if ((v === "connected") === (c.truth[gi] === 1)) r++;
          } else if (gi === worst) e++;
        });
      }
      const n = model.cases.length;
      setCheck({ k, d, t: tot, r, e, n, h0: h0 / n, h1: h1 / n });
      setRunning(false);
      console.info("[hf] all-cases check", { k, decided: d, total: tot, right: r, undecidedWorstGap: e, n, meanH0: h0 / n, meanH1: h1 / n });
    }, 30);
  };

  return (
    <Panel
      title={t("whyTitle")}
      badges={<Badge kind="SIMULATED" size="sm" label={t("badgeReadings")} />}
      className="hf-why"
    >
      <p className="muted hf-small">{t("whySub")}</p>
      <PairBars label={t("rowAll5", { g: nGaps, n: fmt(nom.n, 0) })} ai={nom.bayes_all5} alg={nom.algorithm_all5} />
      <PairBars label={t("rowShift", { g: nGaps, n: fmt(sh.n, 0) })} note={shiftNote} ai={sh.bayes_all5} alg={sh.algorithm_all5} />
      <PairBars
        label={t("row9", { g: sc.gaps.length, states: fmt(sc.n_states, 0), n: fmt(sc.n_test, 0) })}
        note={t("row9Note", { bayes: pct(sc.eval_15.bayes_all), chance: pct(100 / sc.n_states), sims: fmt(sc.algorithm_15.reference_sims, 0) })}
        ai={sc.eval_15.mlp_all}
        alg={sc.algorithm_15.all}
      />
      <p className="hf-calib">
        {t("calib", { a: pct(nom.accuracy_when_confident_pct), b: pct(sh.accuracy_when_confident_pct), share: pct(nom.confident_share_pct) })}
      </p>
      <div className="hf-pergap">
        <p className="hf-pair-label">{t("perGapTitle")}</p>
        <table className="hf-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">{t("ai")}</th>
              <th scope="col">{t("algorithm")}</th>
            </tr>
          </thead>
          <tbody>
            {nom.bayes.map((v, i) => (
              <tr key={i} className={i === worst ? "is-worst" : undefined}>
                <th scope="row">{t("gapName", { g: GAP_LETTERS[i] })}</th>
                <td className="num">{pct(v)}</td>
                <td className="num">{pct(nom.algorithm[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hf-pair-note">{t("perGapNote", { g: GAP_LETTERS[worst] })}</p>
      </div>
      {model && engine ? (
        <div className="hf-check">
          <button type="button" className="btn btn-secondary btn-sm" onClick={run24} disabled={running}>
            {running ? t("check24Running", { n: model.cases.length }) : t("check24", { n: model.cases.length })}
          </button>
          {check ? (
            <p className="hf-check-result" role="status">
              {t("check24Result", {
                k: check.k,
                d: check.d,
                t: check.t,
                r: check.r,
                g: GAP_LETTERS[worst],
                e: check.e,
                n: check.n,
                h0: bitsText(check.h0, lang),
                h1: bitsText(check.h1, lang),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      <SourceNote file="data/hydrofingerprint/hydrofingerprint_robustness.json · hydrofingerprint_scale9.json" />
    </Panel>
  );
}

// ------------------------------------------------------------------ info vs loggers (AI vs random)
export function InfoCurve({ data, maxBits }: { data: HfResultsResponse; maxBits: number }) {
  const t = useT(hfStrings);
  const { lang } = useI18n();
  const res = data.results;
  if (!res) {
    const err = new ApiError("missing_data", 404, data.results_missing, data.results_missing?.message?.en ?? "missing");
    return (
      <Panel title={t("curveTitle")} badges={<Badge kind="SIMULATED" size="sm" />}>
        <EmptyState compact error={err} />
      </Panel>
    );
  }
  const a = res.curve_ig;
  const b = res.curve_random;
  const W = 360, H = 170, L = 30, R = 12, T = 12, B = 28;
  const xs = [...a, ...b].map((d) => d.n_sensors);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymax = Math.ceil(maxBits);
  const px = (n: number) => L + ((n - xmin) / (xmax - xmin || 1)) * (W - L - R);
  const py = (v: number) => T + (1 - Math.max(0, v) / ymax) * (H - T - B);
  const path = (c: typeof a) => c.map((d, i) => `${i ? "L" : "M"}${px(d.n_sensors).toFixed(1)} ${py(d.info_bits).toFixed(1)}`).join(" ");
  const endA = a[a.length - 1], endB = b[b.length - 1];
  const yTicks = [...Array(ymax + 1)].map((_, i) => i);
  const xTicks = [...new Set(a.map((d) => d.n_sensors))];
  return (
    <Panel
      title={t("curveTitle")}
      subtitle={t("curveSub", { g: res.gaps.length, max: fmt(maxBits, 0), n: fmt(res.n_val, 0) })}
      badges={<Badge kind="SIMULATED" size="sm" />}
    >
      <div className="hf-curve-legend">
        <span>
          <i className="hf-swatch is-ai" aria-hidden="true" />
          {t("curveAi")}
        </span>
        <span>
          <i className="hf-swatch is-rnd" aria-hidden="true" />
          {t("curveRandom")}
        </span>
      </div>
      <div dir="ltr" className="hf-curve">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("curveAria", { ai: fmt(endA.info_bits, 2), rnd: fmt(endB.info_bits, 2) })}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={py(v)} y2={py(v)} className="hf-grid" />
              <text x={L - 6} y={py(v) + 4} textAnchor="end" className="hf-axis">
                {v}
              </text>
            </g>
          ))}
          {xTicks.map((n) => (
            <text key={n} x={px(n)} y={H - 10} textAnchor="middle" className="hf-axis">
              {n}
            </text>
          ))}
          <path d={path(b)} className="hf-line is-rnd" />
          <path d={path(a)} className="hf-line is-ai" />
          <circle cx={px(endA.n_sensors)} cy={py(endA.info_bits)} r={4} className="hf-dot is-ai" />
          <circle cx={px(endB.n_sensors)} cy={py(endB.info_bits)} r={3.5} className="hf-dot is-rnd" />
          <text x={px(endA.n_sensors) - 6} y={py(endA.info_bits) - 9} textAnchor="end" className="hf-end is-ai">
            {fmt(endA.info_bits, 2)}
          </text>
          <text x={px(endB.n_sensors) - 6} y={py(endB.info_bits) + 17} textAnchor="end" className="hf-end is-rnd">
            {fmt(endB.info_bits, 2)}
          </text>
        </svg>
        <p className="hf-axis-x" dir={lang === "ar" ? "rtl" : "ltr"}>
          ↔ {t("curveX")} · ↕ {unit("bits", lang)}
        </p>
      </div>
      <SourceNote file="data/hydrofingerprint/hydrofingerprint_results.json" />
    </Panel>
  );
}

export type { Verdict };
