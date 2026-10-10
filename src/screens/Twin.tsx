// Screen "twin" (#/twin, optional ?scenario=base|svc1|far15|m5|m15). Journey 1 · step 6.
// Renders data/twin/mazar_zone_results.json (GET /api/twin/mazar?scenario=...): pipes and junctions coloured by
// normal-day pressure or by the pressure drop of a leak scenario. Every number is computed from that response.
// Geometry is REAL (pipe drawing + Copernicus DEM); operation is ASSUMED (demand, supply level, C values, leak size).
import { useMemo, useState, type CSSProperties } from "react";
import { api, useApi, type ApiError } from "../api";
import { fmt, pm, unit, useI18n, useT, withUnit, type Lang } from "../i18n";
import { BaseMap } from "../map/BaseMap";
import { href } from "../router";
import type { ScreenProps } from "../screens";
import type { SpotProps, TwinResponse, TwinScenario } from "../types";
import { Badge, Button, EmptyState, Page, PageHeader, Panel, SourceNote, Spinner, Stat } from "../ui";
import {
  DROP_STOPS,
  DROP_THRESHOLD_M,
  EXTRA,
  KEY_COLORS,
  NO_CHANGE,
  PRESSURE_STOPS,
  PRIMARY,
  SCENARIOS,
  boundsOfNodes,
  cssGradient,
  edgeEnds,
  edgesAt,
  inchText,
  iso,
  metres,
  summarise,
  type ScenarioSummary,
} from "../features/twin/model";
import { MATERIALS, twinStrings } from "../features/twin/strings";
import { FitZone, KeyMarkers, LeakRing, SpotCircle, TwinEdges, TwinNodes, useJunctionPopup, type KeyMark } from "../features/twin/TwinLayers";
import "../features/twin/twin.css";

type All = Record<TwinScenario, TwinResponse>;

/** "1.9 km" / "190 m" / "15 m" for model distances (rounded: no false precision; under 100 m to the nearest 5 m). */
function approx(m: number, lang: Lang) {
  if (m >= 1000) return withUnit(m / 1000, "km", lang, 1);
  return withUnit(m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10, "m", lang, 0);
}

/** A distance the twin file states itself (key.<point>.dist_m) wins over one recomputed here. */
const fileDist = (p: { [k: string]: number }, fallback: number) => (typeof p.dist_m === "number" && Number.isFinite(p.dist_m) ? p.dist_m : fallback);

const maxIn = (edges: { in: number }[]) => edges.reduce((a, e) => Math.max(a, e.in), 0);

/** Colours of the key-location symbols come from src/map/style.ts (via model.ts), passed to CSS as variables. */
const KEY_VARS = {
  "--twin-supply": KEY_COLORS.supply,
  "--twin-spot": KEY_COLORS.spot,
  "--twin-logger": KEY_COLORS.logger,
  "--twin-leak": KEY_COLORS.leak,
} as CSSProperties;

export default function Twin({ query, embedded }: ScreenProps) {
  const t = useT(twinStrings);
  const { lang } = useI18n();
  const all = useApi(() => Promise.all(SCENARIOS.map((s) => api.twin(s))), []);
  const spots = useApi(() => api.spots(), []);
  const q = query.get("scenario") as TwinScenario | null;
  const [scenario, setScenario] = useState<TwinScenario>(q && SCENARIOS.includes(q) ? q : "base");
  const [more, setMore] = useState(EXTRA.includes(scenario));

  const model = useMemo(() => {
    if (!all.data) return null;
    const by = Object.fromEntries(all.data.map((r) => [r.scenario, r])) as All;
    const base = by.base;
    const key = base.key;
    const sums = Object.fromEntries(SCENARIOS.map((s) => [s, summarise(by[s], key.logger)])) as Record<TwinScenario, ScenarioSummary>;
    const mats = new Map<string, number>();
    base.edges.forEach((e) => mats.set(e.mat, (mats.get(e.mat) ?? 0) + 1));
    const diam = base.edges.map((e) => e.in).filter((v) => Number.isFinite(v));
    const candEdges = edgesAt(base.edges, key.cand);
    const candPipe = candEdges.length ? candEdges.reduce((a, e) => (e.in < a.in ? e : a)) : null;
    return {
      by,
      base,
      key,
      sums,
      ends: edgeEnds(base.nodes, base.edges),
      bounds: boundsOfNodes(base.nodes),
      mats: [...mats.entries()].sort((a, b) => b[1] - a[1]),
      dMin: Math.min(...diam),
      dMax: Math.max(...diam),
      tankIn: maxIn(edgesAt(base.edges, key.tank)),
      tank2In: maxIn(edgesAt(base.edges, key.tank2)),
      farIn: maxIn(edgesAt(base.edges, key.far)),
      candPipe,
      dFar: metres(key.cand, key.far),
      dLogger: fileDist(key.logger, metres(key.cand, key.logger)),
      dMain: fileDist(key.main, metres(key.cand, key.main)),
      dMainSupply: Math.min(metres(key.main, key.tank), metres(key.main, key.tank2)),
    };
  }, [all.data]);

  // the radar wet spot the twin is built around = the spot nearest the model's candidate junction
  const spot = useMemo<SpotProps | null>(() => {
    if (!model || !spots.data) return null;
    let best: SpotProps | null = null;
    let bd = Infinity;
    for (const f of spots.data.features) {
      const d = metres({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }, model.key.cand);
      if (d < bd) {
        bd = d;
        best = f.properties;
      }
    }
    return best;
  }, [model, spots.data]);

  if (all.loading && !all.data)
    return (
      <div className="map-screen twin-center">
        <Spinner />
      </div>
    );
  if (all.error || !model) return <HeldBack error={all.error} onRetry={all.reload} />;

  const spotId = spot?.spot_id ?? "";
  const id = iso(spotId);
  const s = model.sums[scenario];
  const r = model.by[scenario];
  const isBase = scenario === "base";
  const extra = EXTRA.includes(scenario);
  const th = withUnit(DROP_THRESHOLD_M, "m", lang, 0);
  const total = fmt(model.base.nodes.length, 0);
  const mUnit = unit("m", lang);

  const scLabel = (sc: TwinScenario) => {
    const lps = model.sums[sc].leakLps;
    const qq = lps === null ? "" : withUnit(lps, "L/s", lang, 0);
    if (sc === "base") return t("scBase");
    if (sc === "svc1") return t("scSvc1", { id, q: qq });
    if (sc === "far15") return t("scFar15", { q: qq });
    return t("scMain", { id, q: qq });
  };

  const pipeText = (e: { in: number; mat: string } | null) =>
    e ? (lang === "ar" ? `${MATERIALS[e.mat]?.ar ?? e.mat} ${inchText(e.in, lang)}` : `${inchText(e.in, lang)} ${MATERIALS[e.mat]?.en ?? e.mat}`) : "";

  // ---------------------------------------------------------------- key locations on the map
  const k = model.key;
  const marks: KeyMark[] = [
    { id: "tank", lon: k.tank.lon, lat: k.tank.lat, kind: "supply", side: "w", label: t("kTank", { d: inchText(model.tankIn, lang) }) },
    // tank2 and the main junction are a few metres apart: label only one of them at a time
    { id: "tank2", lon: k.tank2.lon, lat: k.tank2.lat, kind: "supply", side: "n", label: extra ? "" : t("kTank2", { d: inchText(model.tank2In, lang) }) },
    { id: "logger", lon: k.logger.lon, lat: k.logger.lat, kind: "logger", side: "w", label: t("kLogger") },
    { id: "far", lon: k.far.lon, lat: k.far.lat, kind: "break", side: "e", label: t("kFar"), dim: scenario !== "far15", focus: scenario === "far15" },
    { id: "cand", lon: k.cand.lon, lat: k.cand.lat, kind: "spot", side: "s", label: t("kSpot", { id }), focus: true },
  ];
  if (extra) marks.push({ id: "main", lon: k.main.lon, lat: k.main.lat, kind: "main", side: "n", label: t("kMain", { id }), focus: true });

  // ---------------------------------------------------------------- result text
  const loggerVars = { d: approx(model.dLogger, lang), id, v: withUnit(s.loggerValue, "m", lang, 1) };
  const loggerLine = isBase ? t("loggerBase", loggerVars) : t("logger", loggerVars);
  const msg =
    scenario === "base"
      ? t("msgBase")
      : scenario === "svc1"
        ? t("msgSvc1", { pipe: pipeText(model.candPipe), id, n: fmt(s.nOther, 0), total, th })
        : scenario === "far15"
          ? t("msgFar15", { pipe: inchText(model.farIn, lang), d: approx(model.dFar, lang), id })
          : t("msgMain", { d: approx(model.dMainSupply, lang) });
  const maxAtLeak = s.leakNode !== null && s.maxNode === s.leakNode;
  const maxNote = maxAtLeak ? t("statMaxAtLeak") : s.leakAt ? t("statMaxAway", { d: approx(metres(r.nodes[s.maxNode], s.leakAt), lang) }) : undefined;

  const compareRows = (more ? [...PRIMARY.slice(1), ...EXTRA] : PRIMARY.slice(1)).map((sc) => model.sums[sc]);
  const leakSizes = [...new Set(SCENARIOS.map((sc) => model.sums[sc].leakLps).filter((v): v is number => v !== null))].sort((a, b) => a - b);

  // Demo mode: the comparison (the cue's "{nSvc} other junction" and "{nFar} of {nJ}") sits above the fold.
  const compareEl = (
    <section className="twin-compare" aria-label={t("compareTitle", { th, total })}>
      <h2 className="twin-h2">{t("compareTitle", { th, total })}</h2>
      {compareRows.map((row) => (
        <button
          key={row.scenario}
          type="button"
          className={`twin-bar-row${row.scenario === scenario ? " is-active" : ""}`}
          onClick={() => setScenario(row.scenario)}
          aria-pressed={row.scenario === scenario}
        >
          <span className="twin-bar-label">{scLabel(row.scenario)}</span>
          <span className="twin-bar-val num">{fmt(row.nAbove, 0)}</span>
          <span className="twin-bar-track" aria-hidden="true">
            <span className="twin-bar-fill" style={{ inlineSize: `${Math.max(0.6, (100 * row.nAbove) / row.nNodes)}%` }} />
          </span>
          {row.scenario !== "far15" && row.nOther !== row.nAbove ? <span className="twin-bar-note">{t("compareSvc1Note", { n: fmt(row.nOther, 0) })}</span> : null}
        </button>
      ))}
      </section>
  );

  return (
    <div className="map-screen twin" style={KEY_VARS}>
      <BaseMap attribution="Pipes: AJI Group ArcGIS item (no licence stated) · Elevation: Copernicus DEM GLO-30 © DLR/Airbus · Model: EPANET 2.2 (WNTR)">
        <TwinMap by={model.by} ends={model.ends} bounds={model.bounds} sums={model.sums} scenario={scenario} spot={spot} marks={marks} />
      </BaseMap>

      <div className="map-overlay map-overlay-start twin-panel-wrap">
        <Panel tone="raised" className="twin-panel">
          <p className="twin-kicker">{t("kicker")}</p>
          <h1 className="twin-title">{t("title")}</h1>
          <div className="badge-row twin-badges">
            <Badge kind="REAL" size="sm" label={t("badgeGeometry")} />
            <Badge kind="ASSUMED" size="sm" label={t("badgeOperation")} />
          </div>
          <p className="twin-lead">
            {t("lead", {
              junctions: fmt(model.base.nodes.length, 0),
              pipes: fmt(model.base.edges.length, 0),
              km: withUnit(model.base.stats.km, "km", lang, 1),
            })}
          </p>

          <div className="twin-seg" role="group" aria-label={t("scenario")}>
            {PRIMARY.map((sc) => (
              <button key={sc} type="button" className="twin-seg-btn" aria-pressed={scenario === sc} onClick={() => setScenario(sc)}>
                {scLabel(sc)}
              </button>
            ))}
          </div>
          <details
            className="twin-more"
            open={more}
            onToggle={(e) => {
              const open = (e.currentTarget as HTMLDetailsElement).open;
              setMore(open);
              if (!open && EXTRA.includes(scenario)) setScenario("base");
            }}
          >
            <summary>{t("more")}</summary>
            <p className="twin-more-hint">{t("moreHint", { d: approx(model.dMain, lang), id })}</p>
            <div className="twin-seg twin-seg-sm" role="group" aria-label={t("more")}>
              {EXTRA.map((sc) => (
                <button key={sc} type="button" className="twin-seg-btn" aria-pressed={scenario === sc} onClick={() => setScenario(sc)}>
                  {scLabel(sc)}
                </button>
              ))}
            </div>
          </details>

          {embedded ? compareEl : null}

          <div className="twin-result" aria-live="polite">
            {!isBase && s.leakLps !== null ? (
              <div className="badge-row">
                <Badge kind="ASSUMED" size="sm" label={t("badgeLeak", { q: withUnit(s.leakLps, "L/s", lang, 0) })} />
              </div>
            ) : null}
            <div className="twin-stats">
              {isBase ? (
                <>
                  <Stat size="lg" label={t("statMedian")} value={fmt(s.medianPressure, 1)} unit={mUnit} note={t("statMedianNote", { n: total })} />
                  <Stat size="lg" label={t("statDelivered")} value={fmt(model.base.stats.demand_lps, 1)} unit={unit("L/s", lang)} note={t("statDeliveredNote")} />
                </>
              ) : (
                <>
                  {scenario === "far15" ? (
                    <Stat size="lg" label={t("statAll", { th })} value={t("statAllValue", { n: fmt(s.nAbove, 0), total })} />
                  ) : (
                    <Stat size="lg" label={t("statOther", { th })} value={fmt(s.nOther, 0)} note={s.leakNodeValue !== null && s.leakNodeValue > DROP_THRESHOLD_M ? t("statOtherNote") : undefined} />
                  )}
                  <Stat size="lg" label={t("statMax")} value={fmt(s.maxValue, 1)} unit={mUnit} note={maxNote} />
                </>
              )}
            </div>
            <p className={`twin-msg${extra ? " twin-msg-warn" : ""}`}>{msg}</p>
            <p className="twin-logger">
              <span className="twin-sw twin-sw-logger" aria-hidden="true" />
              <span>{loggerLine}</span>
            </p>
          </div>

          {!embedded ? compareEl : null}

          <p className="twin-story">{t("story")}</p>

          <details className="twin-details">
            <summary>
              <span>{t("asmTitle")}</span> <Badge kind="ASSUMED" size="sm" />
            </summary>
            <ul className="twin-list">
              <li>{t("asmDemand", { v: withUnit(model.base.assumptions.demand_lps_per_km, "L/s", lang, 2) })}</li>
              <li>
                {t("asmHead", {
                  h: withUnit(model.base.assumptions.tank_above_highest_junction_m, "m", lang, 1),
                  head: withUnit(model.key.tank.head, "m", lang, 1),
                })}
              </li>
              <li>
                {t("asmC", {
                  list: iso(
                    Object.entries(model.base.assumptions.hazen_williams_C)
                      .map(([m, c]) => `${m} ${fmt(c, 0)}`)
                      .join(" · "),
                  ),
                })}
              </li>
              <li>{t("asmLeak", { list: leakSizes.map((v) => withUnit(v, "L/s", lang, 0)).join(lang === "ar" ? "، " : ", ") })}</li>
            </ul>
          </details>
          <details className="twin-details">
            <summary>
              <span>{t("realTitle")}</span> <Badge kind="REAL" size="sm" />
            </summary>
            <ul className="twin-list">
              <li>{t("realZone", { r: approx(model.base.assumptions.radius_m, lang), id })}</li>
              <li>{t("realPipes", { list: `${model.mats.map(([m, n]) => `${iso(m)} ${fmt(n, 0)}`).join(" · ")} ${t("pipesUnit")}` })}</li>
              <li>{t("realElev")}</li>
              <li>{t("realSolve")}</li>
            </ul>
          </details>

          {spotId ? (
            <div className="twin-actions">
              <Button size="sm" href={href(`/spot/${spotId}`)}>
                {t("openSpot", { id })}
              </Button>
              <Button size="sm" variant="primary" href={href(`/workorder/${spotId}`)}>
                {t("next")}
              </Button>
            </div>
          ) : null}
          <SourceNote file={r.source} />
        </Panel>
      </div>

      <Legend scenario={scenario} dMin={model.dMin} dMax={model.dMax} nNeg={model.sums.base.nNegative} spotPm={spot ? pm(spot.position_accuracy_m, "m", lang) : null} id={id} />
    </div>
  );
}

// ------------------------------------------------------------------ map content (inside BaseMap)
function TwinMap({
  by,
  ends,
  bounds,
  sums,
  scenario,
  spot,
  marks,
}: {
  by: All;
  ends: [number, number][];
  bounds: [number, number, number, number];
  sums: Record<TwinScenario, ScenarioSummary>;
  scenario: TwinScenario;
  spot: SpotProps | null;
  marks: KeyMark[];
}) {
  const data = by[scenario];
  const onPick = useJunctionPopup(data);
  return (
    <>
      <FitZone bounds={bounds} />
      {spot ? <SpotCircle lon={spot.lon} lat={spot.lat} radiusM={spot.position_accuracy_m} /> : null}
      <TwinEdges data={data} ends={ends} />
      <TwinNodes data={data} onPick={onPick} />
      <KeyMarkers marks={marks} />
      <LeakRing s={sums[scenario]} />
    </>
  );
}

// ------------------------------------------------------------------ legend (same stops as the map colours)
function Legend({ scenario, dMin, dMax, nNeg, spotPm, id }: { scenario: TwinScenario; dMin: number; dMax: number; nNeg: number; spotPm: string | null; id: string }) {
  const t = useT(twinStrings);
  const { lang } = useI18n();
  const base = scenario === "base";
  const th = withUnit(DROP_THRESHOLD_M, "m", lang, 0);
  const stops = base ? PRESSURE_STOPS : DROP_STOPS;
  return (
    <aside className="twin-legend" aria-label={t("legendTitle")}>
      <div className="twin-legend-head">
        <span>{base ? t("legendPressure") : t("legendDrop")}</span>
        <span className="twin-legend-unit">({unit("m", lang)})</span>
      </div>
      <div className="twin-scale" dir="ltr">
        {!base ? <span className="twin-scale-none" style={{ background: NO_CHANGE }} /> : null}
        <span className="twin-scale-bar" style={{ background: cssGradient(stops) }} />
      </div>
      <div className="twin-scale-ticks num" dir="ltr">
        {!base ? <span className="twin-scale-tick-none">0</span> : null}
        {stops.map(([v], i) => (
          <span key={v}>
            {i === 0 && base ? "≤" : ""}
            {fmt(v, 0)}
            {i === stops.length - 1 ? "+" : ""}
          </span>
        ))}
      </div>
      {base ? (
        nNeg > 0 ? <p className="twin-legend-note">{t("legendNeg", { n: fmt(nNeg, 0), zero: withUnit(0, "m", lang, 0) })}</p> : null
      ) : (
        <p className="twin-legend-note">{t("legendNoChange", { th })}</p>
      )}
      <ul className="twin-legend-keys">
        <li>
          <span className="twin-sw twin-sw-line" aria-hidden="true" />
          <span>{t("legendWidth", { min: inchText(dMin, lang), max: inchText(dMax, lang) })}</span>
        </li>
        <li>
          <span className="twin-sw twin-sw-supply" aria-hidden="true" />
          <span>{t("legendSupply")}</span>
        </li>
        {spotPm ? (
          <li>
            <span className="twin-sw twin-sw-spot" aria-hidden="true" />
            <span>{t("legendSpot", { id, pm: spotPm })}</span>
          </li>
        ) : null}
        <li>
          <span className="twin-sw twin-sw-logger" aria-hidden="true" />
          <span>{t("legendLogger")}</span>
        </li>
        {!base ? (
          <li>
            <span className="twin-sw twin-sw-leak" aria-hidden="true" />
            <span>{t("legendLeak")}</span>
          </li>
        ) : null}
      </ul>
      <div className="badge-row">
        <Badge kind="REAL" size="sm" label={t("badgeGeometry")} />
        <Badge kind="ASSUMED" size="sm" label={t("badgeOperation")} />
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ fresh clone: the twin file is held back
function HeldBack({ error, onRetry }: { error: ApiError | null; onRetry: () => void }) {
  const t = useT(twinStrings);
  return (
    <Page>
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        badges={
          <>
            <Badge kind="REAL" label={t("badgeGeometry")} />
            <Badge kind="ASSUMED" label={t("badgeOperation")} />
          </>
        }
      />
      <EmptyState title={t("heldTitle")} body={t("heldBody")} error={error} onRetry={onRetry} />
      <p className="twin-story twin-story-page">{t("story")}</p>
    </Page>
  );
}
