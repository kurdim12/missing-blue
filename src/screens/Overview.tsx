// Screen "overview" (#/overview) · Journey 1, steps 2–3. Real pipes by class, the 7 NISAR wet spots, the radar overlay
// with a 3-date slider, and header facts computed from data/. Clicking a spot selects it (±50 m circle + card);
// the card opens #/spot/:id. Optional query: ?spot=W7&radar=1&date=2026-09-28&pol=hv (for Demo mode).
import type { Map as MlMap, PaddingOptions } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, radar, useApi } from "../api";
import { fmt, fmtDate, useI18n, useT, withUnit } from "../i18n";
import { BaseMap } from "../map/BaseMap";
import { KARAK_BOUNDS, PIPE_CLASSES } from "../map/style";
import type { ScreenProps } from "../screens";
import { Badge, Button, EmptyState, Panel, SourceNote, Spinner, Tag } from "../ui";
import { AccuracyCircle, PipesLayer, RadarLayers, SpotMarkers, changeFile, radarDates, type RadarState } from "../features/overview/layers";
import { PIPES_FILE, SPOTS_FILE, SpotCard, SpotChips } from "../features/overview/SpotParts";
import { parseRain } from "../features/overview/spotText";
import { overviewStrings } from "../features/overview/strings";
import "../features/overview/overview.css";

const isPhone = () => typeof window !== "undefined" && window.innerWidth <= 640;

/** Map padding that keeps spots clear of the panels. On phones `sheet` is the height of the bottom sheet (default: half the map). */
function mapPadding(map: MlMap, sheet?: number): PaddingOptions {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  if (w <= 640) return { top: 70, bottom: Math.min(Math.round(h * 0.6), Math.round(sheet ?? h * 0.5) + 12), left: 24, right: 24 };
  const side = Math.min(410, Math.round(w * 0.3));
  return { top: 40, bottom: 40, left: side, right: side }; // symmetric, so LTR and RTL need no swap
}

export default function Overview({ query }: ScreenProps) {
  const { lang, t: tr } = useI18n();
  const t = useT(overviewStrings);

  const spots = useApi(() => api.spots(), []);
  const pipes = useApi(() => api.pipes(), []);
  const summary = useApi(() => api.pipesSummary(), []);
  const rb = useApi(() => radar.bounds(), []);

  const [map, setMap] = useState<MlMap | null>(null);
  const sideRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<string | null>(() => query.get("spot")?.toUpperCase() ?? null);
  const [layersOpen, setLayersOpen] = useState(() => !isPhone());
  const dates = useMemo(() => radarDates(rb.data), [rb.data]);
  const [rs, setRs] = useState<RadarState>(() => ({
    on: query.get("radar") === "1" || query.get("view") === "radar",
    date: query.get("date") ?? "",
    pol: query.get("pol") === "hv" ? "hv" : "hh",
    mask: true,
  }));
  // Demo mode passes ?view=radar (time-lapse step: overlay on) and ?view=pipes (pipes step: overlay off); the
  // embedded screen stays mounted between those steps, so follow the query, not only the first render.
  const view = query.get("view");
  useEffect(() => {
    if (view === "radar") setRs((r) => ({ ...r, on: true }));
    else if (view === "pipes") setRs((r) => ({ ...r, on: false }));
  }, [view]);
  // default pass = the latest one listed in bounds.json
  const date = dates.includes(rs.date) ? rs.date : dates[dates.length - 1] ?? "";
  const radarState = { ...rs, date };

  // a link to #/overview?spot=W3 while already on the overview
  const qSpot = query.get("spot")?.toUpperCase() ?? null;
  useEffect(() => {
    if (qSpot) setSelected(qSpot);
  }, [qSpot]);

  const features = useMemo(() => spots.data?.features ?? [], [spots.data]);
  const selFeature = features.find((f) => f.properties.spot_id === selected) ?? null;
  const select = useCallback((id: string | null) => setSelected(id), []);

  // fly to the selected spot
  useEffect(() => {
    if (!map || !selFeature) return;
    map.flyTo({ center: selFeature.geometry.coordinates, zoom: Math.max(map.getZoom(), 15.5), padding: mapPadding(map), duration: 900, essential: true });
  }, [map, selFeature]);

  // whole radar grid, kept clear of the panels (also the first view once the map is ready, unless a spot is selected)
  const fitAll = useCallback(
    (m: MlMap, duration: number) => {
      const b = rb.data?.bounds;
      const bb: [number, number, number, number] = b ? [b.west, b.south, b.east, b.north] : KARAK_BOUNDS;
      m.fitBounds(bb, { padding: mapPadding(m, sideRef.current?.getBoundingClientRect().height), duration });
    },
    [rb.data],
  );
  const showAll = useCallback(() => {
    setSelected(null);
    if (map) fitAll(map, 800);
  }, [map, fitAll]);
  const firstFit = useRef(false);
  useEffect(() => {
    if (!map || firstFit.current || selected) return;
    firstFit.current = true;
    fitAll(map, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------------ header facts (all from data/)
  const rain = parseRain(spots.data?.rain_check);
  const passes = features[0]?.properties.passes ?? [];
  const provisional = Boolean(rb.data?.source?.toUpperCase().includes("PROVISIONAL"));
  const baselineDate = dates[0];
  const changeNow = changeFile(rb.data, radarState.pol, date);
  const fmtD = (d?: string) => (d ? fmtDate(d, lang) : "");

  return (
    <div className="map-screen ov">
      <BaseMap attribution="NISAR: NASA/ISRO (ASF DAAC) · Pipes: AJI Group ArcGIS item (no licence stated)" onReady={setMap}>
        {rb.data ? <RadarLayers bounds={rb.data} state={radarState} /> : null}
        <PipesLayer data={pipes.data} />
        <AccuracyCircle spot={selFeature} />
        {features.length ? <SpotMarkers spots={features} selected={selected} onSelect={select} /> : null}
      </BaseMap>

      <aside ref={sideRef} className={`ov-side${selFeature ? " has-selection" : ""}`} aria-label={t("title")}>
        <Panel
          tone="raised"
          className="ov-facts"
          title={t("title")}
          badges={
            <>
              <Badge kind="REAL" size="sm" label={t("spotsLabel")} />
              <Badge kind="REAL" size="sm" label={t("pipesLabel")} />
              <Badge kind="REAL" size="sm" label={t("rainLabel")} />
            </>
          }
        >
          {spots.error ? (
            <EmptyState compact error={spots.error} onRetry={spots.reload} />
          ) : (
            <div className="ov-facts-row">
              <span className="ov-fact">
                {spots.loading ? <Spinner inline /> : <b className="num">{fmt(features.length, 0)}</b>} {t("factSpots")}
              </span>
              <span className="ov-fact-sep" aria-hidden="true">
                ·
              </span>
              <span className="ov-fact">
                <b className="num">{rain ? withUnit(rain.mm, "mm", lang, 1) : "–"}</b> {t("factRain")}
              </span>
              <span className="ov-fact-sep" aria-hidden="true">
                ·
              </span>
              <span className="ov-fact">
                <b className="num">{summary.data ? withUnit(summary.data.km_total, "km", lang, 0) : summary.loading ? "…" : "–"}</b> {t("factPipe")}
              </span>
            </div>
          )}
          {passes.length >= 3 ? <p className="muted ov-small ov-lead">{t("factsLead", { d0: fmtD(passes[0]), d1: fmtD(passes[1]), d2: fmtD(passes[2]) })}</p> : null}
          <button type="button" className="ov-toggle" onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen}>
            {layersOpen ? t("hideLayers") : t("layers")}
          </button>
        </Panel>

        {layersOpen ? (
          <Panel tone="raised" className="ov-layers">
            {/* ---------------- pipes */}
            <section className="ov-sec">
              <div className="ov-sec-head">
                <h3>{t("pipes")}</h3>
                <Badge kind="REAL" size="sm" label={t("pipesLabel")} />
              </div>
              {summary.error ? (
                <EmptyState compact error={summary.error} />
              ) : (
                <ul className="ov-legend">
                  {PIPE_CLASSES.map((c) => (
                    <li key={c.key}>
                      <span className="ov-swatch" style={{ background: c.color, height: Math.max(2, Math.round(c.width * 1.6)) }} aria-hidden="true" />
                      <span className="ov-legend-label">
                        {tr(c.label)} <span className="faint">{tr(c.range)}</span>
                      </span>
                      <span className="ov-legend-km num">{summary.data ? withUnit(summary.data.km_by_class[c.key] ?? 0, "km", lang, 0) : "…"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.data ? <p className="faint ov-small">{t("pipesTotal", { n: fmt(summary.data.count, 0), km: withUnit(summary.data.km_total, "km", lang, 0) })}</p> : null}
              {pipes.loading ? <Spinner inline label={t("pipesLoading")} /> : pipes.error && !summary.error ? <EmptyState compact error={pipes.error} /> : null}
              <SourceNote file={PIPES_FILE}>AJI Group ArcGIS, layer 6</SourceNote>
            </section>

            {/* ---------------- radar */}
            <section className="ov-sec">
              <div className="ov-sec-head">
                <h3>{t("radar")}</h3>
                <Badge kind="REAL" size="sm" label={t("radar")} />
                {provisional ? (
                  <Tag tone="warn" title={t("provisionalTip")}>
                    {t("provisional")}
                  </Tag>
                ) : null}
              </div>
              {rb.error ? (
                <EmptyState compact error={rb.error} onRetry={rb.reload} />
              ) : rb.loading ? (
                <Spinner inline />
              ) : (
                <>
                  <label className="ov-check">
                    <input type="checkbox" checked={rs.on} onChange={(e) => setRs((s) => ({ ...s, on: e.target.checked }))} />
                    <span>{t("radarShow")}</span>
                  </label>
                  <div className={`ov-slider${rs.on ? "" : " is-off"}`}>
                    <label className="ov-k" htmlFor="ov-date">
                      {t("radarDate")}
                    </label>
                    <input
                      id="ov-date"
                      type="range"
                      min={0}
                      max={Math.max(0, dates.length - 1)}
                      step={1}
                      value={Math.max(0, dates.indexOf(date))}
                      aria-valuetext={fmtD(date)}
                      onChange={(e) => setRs((s) => ({ ...s, on: true, date: dates[Number(e.target.value)] }))}
                    />
                    <div className="ov-ticks">
                      {dates.map((d) => (
                        <button key={d} type="button" className={`ov-tick${d === date ? " is-active" : ""}`} onClick={() => setRs((s) => ({ ...s, on: true, date: d }))}>
                          <span className="num">{fmtD(d)}</span>
                          {d === baselineDate ? <span className="faint ov-tick-sub">{t("baseline")}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                  {changeFile(rb.data, "hh", date) || changeFile(rb.data, "hv", date) ? (
                    <div className="ov-seg" role="group" aria-label={t("pol")}>
                      <span className="ov-k">{t("pol")}</span>
                      {(["hh", "hv"] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`ov-seg-btn${radarState.pol === p ? " is-active" : ""}`}
                          aria-pressed={radarState.pol === p}
                          onClick={() => setRs((s) => ({ ...s, on: true, pol: p }))}
                        >
                          {p === "hh" ? t("hhChange") : t("hvChange")}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="ov-check">
                    <input type="checkbox" checked={rs.mask} onChange={(e) => setRs((s) => ({ ...s, on: true, mask: e.target.checked }))} />
                    <span>{t("wetMask")}</span>
                  </label>
                  <ul className="ov-rlegend">
                    <li>
                      <span className="ov-ramp ov-ramp-grey" aria-hidden="true" />
                      <span>{t("legendGrey")}</span>
                    </li>
                    {changeNow ? (
                      <li>
                        <span className="ov-ramp ov-ramp-change" aria-hidden="true" />
                        <span>{t("legendChange", { pol: radarState.pol === "hh" ? t("hhChange") : t("hvChange"), d0: fmtD(baselineDate) })}</span>
                      </li>
                    ) : (
                      <li className="faint">
                        <span className="ov-ramp" aria-hidden="true" />
                        <span>{t("legendBaselineNote", { d0: fmtD(baselineDate) })}</span>
                      </li>
                    )}
                    <li>
                      <span className="ov-ramp ov-ramp-mask" aria-hidden="true" />
                      <span>{t("legendMask")}</span>
                    </li>
                  </ul>
                  <SourceNote>
                    <bdi dir="ltr">{rb.data?.source}</bdi>
                  </SourceNote>
                </>
              )}
            </section>

            {/* ---------------- spots */}
            <section className="ov-sec">
              <div className="ov-sec-head">
                <h3>{t("spots")}</h3>
                <Badge kind="REAL" size="sm" label={t("spotsLabel")} />
              </div>
              <SpotChips ids={features.map((f) => f.properties.spot_id)} active={selected} onPick={select} />
              <p className="faint ov-small">{t("spotsHint")}</p>
              <div className="ov-row">
                <Tag tone="warn">{t("candidate")}</Tag>
                <Button size="sm" variant="ghost" onClick={showAll}>
                  {t("showAll")}
                </Button>
              </div>
              <SourceNote file={SPOTS_FILE}>NISAR L2 GCOV</SourceNote>
            </section>
          </Panel>
        ) : null}
      </aside>

      {selFeature ? (
        <aside className="ov-spot" aria-live="polite">
          <SpotCard spot={selFeature.properties} onClose={() => setSelected(null)} />
        </aside>
      ) : null}
    </div>
  );
}
