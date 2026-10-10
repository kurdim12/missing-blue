// Screen "records" = HydroFingerprint (Journey 3, GIS / network records officer).
// Live in-browser Bayesian model (src/features/hf/engine.ts, ported from the LIVE block of demo/missing-blue.html) over
// data/hydrofingerprint/hf_live_model.json; context numbers from /api/hf/results. Strings: src/features/hf/strings.ts.
import type { Map as MlMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi, type ApiError } from "../api";
import { fmt, unit, useI18n, useT, withUnit } from "../i18n";
import type { ScreenProps } from "../screens";
import { Badge, Button, EmptyState, Panel, SourceNote, Spinner } from "../ui";
import { createEngine, verdictOf, type HfEngine } from "../features/hf/engine";
import { HfMap } from "../features/hf/HfMap";
import { GapBars, InfoCurve, WhyAi } from "../features/hf/panels";
import { hfStrings } from "../features/hf/strings";
import type { HfGap, HfLiveModel, HfResults, HfResultsResponse } from "../types";
import "../features/hf/hf.css";

type ApiState<T> = { data: T | null; error: ApiError | null; loading: boolean; reload: () => void };

type Msg =
  | { k: "start" }
  | { k: "ai"; checked: number; bits: number; at: number; before: number; after: number }
  | { k: "aiMany"; added: number; before: number; after: number }
  | { k: "add"; bits: number; best: number; at: number; before: number; after: number }
  | { k: "remove"; before: number; after: number }
  | { k: "keep" };

/** Below this expected gain (bits) another logger barely helps: say so instead of suggesting more loggers. */
const LOW_GAIN_BITS = 0.05;

/** Default hidden network: the demo opens on case 4 (index 3). `#/records?case=N` (1-based) picks another. */
const DEFAULT_CASE = 3;

export default function Records({ query, embedded }: ScreenProps) {
  const t = useT(hfStrings);
  const model = useApi(() => api.hfModel(), []);
  const results = useApi(() => api.hfResults(), []);
  const res = results.data?.results ?? null;

  return (
    <div className={`hf-screen${embedded ? " is-embedded" : ""}`}>
      {model.data ? (
        <Live model={model.data} res={res} results={results} query={query} />
      ) : (
        <>
          <div className="hf-map hf-center">
            {model.loading ? <Spinner /> : <EmptyState title={t("modelMissingTitle")} error={model.error} onRetry={model.reload} />}
          </div>
          <aside className="hf-side">
            <Intro res={res} />
            <Context results={results} model={null} engine={null} />
          </aside>
        </>
      )}
    </div>
  );
}

function Context({ results, model, engine }: { results: ApiState<HfResultsResponse>; model: HfLiveModel | null; engine: HfEngine | null }) {
  if (results.loading) return <Spinner inline />;
  if (results.error || !results.data) return <EmptyState compact error={results.error} onRetry={results.reload} />;
  return (
    <>
      <WhyAi data={results.data} model={model} engine={engine} />
      <InfoCurve data={results.data} maxBits={engine?.maxBits ?? results.data.robustness.nominal_test.bayes.length /* 5 gaps = 5 bits */} />
    </>
  );
}

function Intro({ res, tested }: { res: HfResults | null; tested?: number }) {
  const t = useT(hfStrings);
  return (
    <header className="hf-intro">
      <p className="page-kicker">{t("kicker")}</p>
      <h1 className="hf-title">{t("title")}</h1>
      {res ? <p className="hf-lead">{t("lead", { gaps: fmt(res.network.gaps_found, 0), tested: tested ?? res.gaps.length })}</p> : null}
      <div className="badge-row">
        <Badge kind="REAL" label={t("badgeGaps")} />
        <Badge kind="SIMULATED" label={t("badgeReadings")} />
      </div>
    </header>
  );
}

function Live({ model, res, results, query }: { model: HfLiveModel; res: HfResults | null; results: ApiState<HfResultsResponse>; query: URLSearchParams }) {
  const t = useT(hfStrings);
  const { lang } = useI18n();
  const engine = useMemo(() => createEngine(model), [model]);
  const nCases = model.cases.length;
  const qCase = Number(query.get("case"));
  const [ci, setCi] = useState(() => (Number.isInteger(qCase) && qCase >= 1 && qCase <= nCases ? qCase - 1 : Math.min(DEFAULT_CASE, nCases - 1)));
  const [S, setS] = useState<number[]>(() => model.base.slice());
  const [last, setLast] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [msg, setMsg] = useState<Msg>({ k: "start" });
  const mapRef = useRef<MlMap | null>(null);
  const mapBoxRef = useRef<HTMLDivElement>(null);

  const x = model.cases[ci].x;
  const truth = model.cases[ci].truth;
  const inf = useMemo(() => engine.infer(S, x), [engine, S, x]);
  const g = useMemo(() => engine.gains(S, inf, x), [engine, S, inf, x]);
  const verdicts = useMemo(() => inf.marg.map(verdictOf), [inf]);
  // gaps in the model's order, located from the results file (null in a copy without it)
  const gaps: HfGap[] | null = useMemo(() => {
    if (!res) return null;
    const byId = new Map(res.gaps.map((gg) => [gg.id, gg]));
    const out = model.gaps.map((id) => byId.get(id));
    return out.every(Boolean) ? (out as HfGap[]) : null;
  }, [model, res]);
  const fillTo = model.base.length + model.ig.length;
  const atBase = S.length === model.base.length && S.every((f, i) => f === model.base[i]);

  // log every posterior so the numbers can be checked from the console
  useEffect(() => {
    console.info(
      `[hf] case ${ci + 1}/${nCases} truth ${truth.join("")} loggers ${S.length} [${S.join(",")}] P(connected) ${inf.marg.map((p) => p.toFixed(3)).join(" ")} H ${inf.H.toFixed(3)} bits verdicts ${verdicts.join(",")}`,
    );
    (window as unknown as { __hf?: unknown }).__hf = { ci, S: S.slice(), marg: inf.marg.slice(), H: inf.H, verdicts: verdicts.slice(), truth: truth.slice(), best: g.best, bestBits: g.bestBits };
  }, [ci, S, inf, verdicts, truth, nCases, g]);

  const setCase = (i: number) => {
    setCi(((i % nCases) + nCases) % nCases);
    setS(model.base.slice());
    setLast(null);
    setReveal(false);
    setMsg({ k: "start" });
  };
  const reset = () => {
    setS(model.base.slice());
    setLast(null);
    setMsg({ k: "start" });
  };
  const aiNext = () => {
    if (g.best === null) return;
    const S2 = [...S, g.best];
    const after = engine.infer(S2, x).H;
    setS(S2);
    setLast(g.best);
    setMsg({ k: "ai", checked: g.checked, bits: g.bestBits, at: S2.length, before: inf.H, after });
  };
  const aiFill = () => {
    let S2 = S.slice();
    let cur = inf;
    let added = 0;
    while (S2.length < fillTo) {
      const gg = engine.gains(S2, cur, x);
      if (gg.best === null) break;
      S2 = [...S2, gg.best];
      cur = engine.infer(S2, x);
      added++;
    }
    if (!added) return;
    setS(S2);
    setLast(S2[S2.length - 1]);
    setMsg({ k: "aiMany", added, before: inf.H, after: cur.H });
  };
  // tap on the map: add a logger at a free site, or remove a placed one
  const toggle = useCallback(
    (f: number) => {
      const i = S.indexOf(f);
      if (i >= 0) {
        if (S.length <= 1) return setMsg({ k: "keep" });
        const next = S.filter((v) => v !== f);
        setS(next);
        setLast(null);
        setMsg({ k: "remove", before: inf.H, after: engine.infer(next, x).H });
        return;
      }
      const next = [...S, f];
      setS(next);
      setLast(f);
      setMsg({ k: "add", bits: g.byFeature.get(f) ?? 0, best: g.bestBits, at: next.length, before: inf.H, after: engine.infer(next, x).H });
    },
    [S, inf, g, engine, x],
  );
  const showGap = (i: number) => {
    if (!gaps) return;
    const gg = gaps[i];
    mapRef.current?.flyTo({ center: [(gg.a.lon + gg.b.lon) / 2, (gg.a.lat + gg.b.lat) / 2], zoom: 16.5, duration: 900 });
    if (window.matchMedia("(max-width: 900px)").matches) mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const bits = (n: number) => withUnit(n, "bits", lang, 2, 2);
  const doubt = (m: { before: number; after: number }) => t("msgDoubt", { before: bits(m.before), after: bits(m.after) });
  let msgText: string;
  switch (msg.k) {
    case "start":
      msgText = t("msgStart", { n: model.base.length });
      break;
    case "ai":
      msgText = `${t("msgAi", { checked: msg.checked, k: msg.at, bits: bits(msg.bits) })} ${doubt(msg)}`;
      break;
    case "aiMany":
      msgText = `${t("msgAiMany", { added: msg.added })} ${doubt(msg)}`;
      break;
    case "add":
      msgText = `${t("msgAdd", { k: msg.at, bits: bits(msg.bits), best: bits(msg.best) })} ${doubt(msg)}`;
      break;
    case "remove":
      msgText = `${t("msgRemove")} ${doubt(msg)}`;
      break;
    default:
      msgText = t("msgKeep");
  }
  if ((msg.k === "ai" || msg.k === "aiMany") && g.bestBits < LOW_GAIN_BITS && verdicts.includes("undecided")) msgText += ` ${t("msgLow")}`;

  return (
    <>
      <div className="hf-map" ref={mapBoxRef}>
        <HfMap
          model={model}
          gaps={gaps}
          S={S}
          last={last}
          gains={g.byFeature}
          bestBits={g.bestBits}
          verdicts={verdicts}
          onToggle={toggle}
          onMap={(m) => {
            mapRef.current = m;
          }}
        />
      </div>
      <aside className="hf-side">
        <Intro res={res} tested={model.gaps.length} />

        <Panel title={t("controlsTitle")} tone="accent" badges={<Badge kind="SIMULATED" size="sm" />} className="hf-controls">
          <div className="hf-case">
            <button type="button" className="btn btn-ghost btn-sm hf-arrow" onClick={() => setCase(ci - 1)} aria-label={t("prev")} title={t("prev")}>
              <span aria-hidden="true">{lang === "ar" ? "→" : "←"}</span>
            </button>
            <select className="hf-select" value={ci} onChange={(e) => setCase(Number(e.target.value))} aria-label={t("casePick")}>
              {model.cases.map((_, i) => (
                <option key={i} value={i}>
                  {t("caseOf", { i: i + 1, n: nCases })}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm hf-arrow" onClick={() => setCase(ci + 1)} aria-label={t("next")} title={t("next")}>
              <span aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>
            </button>
            <Button size="sm" variant="secondary" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} className="hf-reveal">
              {reveal ? t("hide") : t("reveal")}
            </Button>
          </div>
          <div className="hf-actions">
            <Button variant="primary" onClick={aiNext} disabled={g.best === null}>
              {t("aiNext")}
            </Button>
            <Button size="sm" onClick={aiFill} disabled={S.length >= fillTo}>
              {t("aiFill", { n: fillTo })}
            </Button>
            <Button size="sm" variant="ghost" onClick={reset} disabled={atBase}>
              {t("reset", { n: model.base.length })}
            </Button>
          </div>
          <p className="hf-msg" role="status" aria-live="polite">
            {msgText}
          </p>
          <div className="hf-stats">
            <div className="hf-stat">
              <span className="hf-stat-k">{t("loggersLabel")}</span>
              <span className="hf-stat-v num">{fmt(S.length, 0)}</span>
              <span className="hf-stat-n">{t("loggersNote")}</span>
            </div>
            <div className="hf-stat hf-stat-doubt">
              <span className="hf-stat-k">{t("doubtLabel")}</span>
              <span className="hf-stat-v num">
                {fmt(inf.H, 2, 2)} <small>{unit("bits", lang)}</small>
              </span>
              <span className="hf-stat-n">{t("doubtNote", { max: bits(engine.maxBits), states: engine.K })}</span>
              <span className="hf-doubt" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (inf.H / engine.maxBits) * 100)}%` }} />
              </span>
            </div>
          </div>
          <h3 className="hf-subhead">{t("gapsTitle")}</h3>
          <GapBars
            marg={inf.marg}
            gapIds={model.gaps}
            gaps={gaps}
            truth={truth}
            reveal={reveal}
            nLoggers={S.length}
            atStart={atBase}
            gapAcc={results.data ? { pct: results.data.robustness.nominal_test.bayes, n: results.data.robustness.nominal_test.n } : null}
            onShow={showGap}
          />
          {res ? <p className="faint hf-small">{t("leadModel", { sims: fmt(res.n_scenarios, 0) })}</p> : null}
          <SourceNote file="data/hydrofingerprint/hf_live_model.json" />
        </Panel>

        <Context results={results} model={model} engine={engine} />

        {res ? (
          <p className="hf-honesty">
            {t("honesty", { noise: withUnit(res.noise.pressure_m, "m", lang, 2), inflow: withUnit(res.noise.inflow_pct, "%", lang, 1) })}
          </p>
        ) : null}
      </aside>
    </>
  );
}
