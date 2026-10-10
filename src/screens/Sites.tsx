// Screen "sites" (#/sites) · Map & sites (reference: docs/qa/shots/reference/ref-sitecard-*.jpg).
// Map: real pipes by class, W1–W7 (close labels pushed apart), radar overlay toggle + pass slider.
// Light side panel with tabs (?tab=sites|reports|edits|log): Sites [7] -> SiteCard, Field reports (demo labels),
// Map edits (HydroFingerprint numbers from /api/hf/results), Log (/api/audit, newest first).
// Every number comes from data/ (via the API, the bundled series file or the recorded run). Wet spots are candidates.
import type { Map as MlMap, PaddingOptions } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getJson, radar, useApi } from "../api";
import { fmt, fmtDate, pm, useI18n, useT, withUnit } from "../i18n";
import { BaseMap } from "../map/BaseMap";
import { KARAK_BOUNDS } from "../map/style";
import type { ScreenProps } from "../screens";
import { Badge, Ltr, Spinner } from "../ui";
import { Tabs, TabPanel } from "../ui/Tabs";
import { AccuracyCircle, PipesLayer, RadarLayers, radarDates, type RadarState } from "../features/overview/layers";
import { SiteCard } from "../features/sites/SiteCard";
import { SiteMarkers } from "../features/sites/SiteMarkers";
import { loadDecisions, type SiteDecisionRow } from "../features/sites/decisions";
import { panelStrings } from "../features/sites/panelStrings";
import "../features/overview/overview.css";
import "../features/sites/sites.css";
import "../features/sites/sites-screen.css";

type TabId = "sites" | "reports" | "edits" | "log";
const TABS: TabId[] = ["sites", "reports", "edits", "log"];

function padding(map: MlMap, card = false): PaddingOptions {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  // phones: keep the spot above the bottom sheet (55% of the height, 72% with a site card open)
  if (w <= 640) return { top: 56, bottom: Math.round(h * (card ? 0.72 : 0.55)) + 8, left: 20, right: 20 };
  const side = Math.min(460, Math.round(w * 0.42));
  // the panel sits on the inline-end side: right in LTR, left in RTL
  const rtl = document.documentElement.dir === "rtl";
  return { top: 40, bottom: 40, left: rtl ? side : 40, right: rtl ? 40 : side };
}

const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

type LearningLabel = { id: string; spot_id: string; outcome: "leak" | "no_leak"; note: string | null; ts: string; source: string };
type AuditEntry = { id: string; ts: string; kind: string; action: string; actor: string; source?: string; summary?: { en: string; ar: string } };

function setQuery(key: string, value: string | null) {
  const [path, qs = ""] = window.location.hash.replace(/^#/, "").split("?");
  const q = new URLSearchParams(qs);
  if (value === null) q.delete(key);
  else q.set(key, value);
  const s = q.toString();
  history.replaceState(null, "", `#${path || "/sites"}${s ? `?${s}` : ""}`);
}

type LocalReport = { spot: string; result: "leak" | "no_leak" | null; saved_at: string | null };
function crewReportsFromStorage(): LocalReport[] {
  const out: LocalReport[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k ? /^mb\.crew\.(W\d+)$/i.exec(k) : null;
      if (!m || !k) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? "null") as { result?: "leak" | "no_leak" | null; saved_at?: string | null } | null;
      if (v && (v.result || v.saved_at)) out.push({ spot: m[1].toUpperCase(), result: v.result ?? null, saved_at: v.saved_at ?? null });
    }
  } catch {
    /* storage blocked */
  }
  return out.sort((a, b) => a.spot.localeCompare(b.spot));
}

export default function Sites({ query }: ScreenProps) {
  const { lang } = useI18n();
  const t = useT(panelStrings);

  const spots = useApi(() => api.spots(), []);
  const pipes = useApi(() => api.pipes(), []);
  const rb = useApi(() => radar.bounds(), []);

  const qTab = query.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>(qTab && TABS.includes(qTab) ? qTab : "sites");
  useEffect(() => {
    if (qTab && TABS.includes(qTab)) setTab(qTab);
  }, [qTab]);
  const changeTab = (id: TabId) => {
    setTab(id);
    setQuery("tab", id);
  };

  const qSite = query.get("site")?.toUpperCase() ?? null;
  const [selected, setSelected] = useState<string | null>(qSite);
  useEffect(() => {
    if (qSite) setSelected(qSite);
  }, [qSite]);
  const select = useCallback((id: string | null) => {
    setSelected(id);
    setQuery("site", id);
    if (id) {
      setTab("sites");
      setQuery("tab", "sites");
    }
  }, []);

  const [map, setMap] = useState<MlMap | null>(null);
  const dates = useMemo(() => radarDates(rb.data), [rb.data]);
  const [rs, setRs] = useState<RadarState>(() => ({ on: query.get("radar") === "1", date: query.get("date") ?? "", pol: "hh", mask: true }));
  const date = dates.includes(rs.date) ? rs.date : dates[dates.length - 1] ?? "";
  const radarState = { ...rs, date };

  const decisions = useMemo(() => loadDecisions(), []);
  const decOf = useCallback(
    (id: string): SiteDecisionRow | null => decisions.rows.find((d) => d.id.toUpperCase() === id.toUpperCase()) ?? null,
    [decisions],
  );
  const statusOf = useCallback((id: string) => decOf(id)?.verdict ?? "pending", [decOf]);

  const features = useMemo(() => spots.data?.features ?? [], [spots.data]);
  const sorted = useMemo(() => {
    const rank = (id: string) => {
      const d = decOf(id);
      if (!d) return 50;
      if (d.verdict === "reject") return 100;
      return PRIO_RANK[d.priority ?? ""] ?? 10;
    };
    return [...features].sort((a, b) => rank(a.properties.spot_id) - rank(b.properties.spot_id) || a.properties.nearest_pipe_m - b.properties.nearest_pipe_m);
  }, [features, decOf]);
  const selFeature = features.find((f) => f.properties.spot_id === selected) ?? null;

  // camera: whole radar grid first, then fly to the selected site
  const fitAll = useCallback(
    (m: MlMap, duration: number) => {
      const b = rb.data?.bounds;
      m.fitBounds(b ? [b.west, b.south, b.east, b.north] : KARAK_BOUNDS, { padding: padding(m), duration });
    },
    [rb.data],
  );
  useEffect(() => {
    if (!map) return;
    if (selFeature) map.flyTo({ center: selFeature.geometry.coordinates, zoom: Math.max(map.getZoom(), 15), padding: padding(map, true), duration: 800, essential: true });
    else fitAll(map, 600);
  }, [map, selFeature, fitAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const reasonOf = (d: SiteDecisionRow | null) => (d ? (lang === "ar" ? d.reason_ar ?? d.reason : d.reason) : null);
  const prio = (p?: string) => (p === "high" ? t("prioHigh") : p === "medium" ? t("prioMedium") : p === "low" ? t("prioLow") : null);

  const srcBadge =
    decisions.origin === "recorded" ? <Badge kind="RECORDED" size="sm" label={t("srcRecorded")} /> : <span className="sp-src">{t("srcCouncil")}</span>;
  const selDec = selFeature ? decOf(selFeature.properties.spot_id) : null;

  return (
    <div className="map-screen sp-screen">
      <BaseMap attribution="NISAR: NASA/ISRO (ASF DAAC) · Pipes: AJI Group ArcGIS item (no licence stated)" onReady={setMap} allow3d>
        {rb.data ? <RadarLayers bounds={rb.data} state={radarState} /> : null}
        <PipesLayer data={pipes.data} />
        <AccuracyCircle spot={selFeature} />
        {features.length ? <SiteMarkers spots={features} selected={selected} onSelect={select} status={statusOf} /> : null}
      </BaseMap>

      <div className="sp-radar" role="group" aria-label={t("radar")}>
        <label className="sp-radar-toggle">
          <input type="checkbox" checked={rs.on} onChange={(e) => setRs((r) => ({ ...r, on: e.target.checked }))} />
          <span>{t("radarOn")}</span>
          <Badge kind="REAL" size="sm" label="NISAR" />
        </label>
        {rs.on && dates.length ? (
          <div className="sp-radar-body">
            <label className="sp-radar-row">
              <span>{t("pass")}</span>
              <input
                type="range"
                min={0}
                max={dates.length - 1}
                step={1}
                value={Math.max(0, dates.indexOf(date))}
                onChange={(e) => setRs((r) => ({ ...r, date: dates[Number(e.target.value)] }))}
                aria-valuetext={fmtDate(date, lang)}
              />
              <b className="num">{fmtDate(date, lang)}</b>
            </label>
            <label className="sp-radar-row">
              <input type="checkbox" checked={rs.mask} onChange={(e) => setRs((r) => ({ ...r, mask: e.target.checked }))} />
              <span>{t("mask")}</span>
            </label>
            <p className="sp-radar-note">{t("radarNote")}</p>
          </div>
        ) : null}
      </div>

      <aside className={`sp-panel${selFeature ? " has-card" : ""}`} aria-label={t("title")}>
        <header className="sp-head">
          <h1 className="sp-title">{t("title")}</h1>
          <p className="sp-sub">{t("subtitle")}</p>
        </header>
        <Tabs<TabId>
          idPrefix="sp"
          label={t("tabsLabel")}
          value={tab}
          onChange={changeTab}
          size="sm"
          className="sp-tabs"
          items={[
            { id: "sites", label: t("tabSites"), count: spots.data ? features.length : null },
            { id: "reports", label: t("tabReports") },
            { id: "edits", label: t("tabEdits") },
            { id: "log", label: t("tabLog") },
          ]}
        />
        <div className="sp-body">
          <TabPanel idPrefix="sp" id="sites" value={tab}>
            {selFeature ? (
              <SiteCard
                spotId={selFeature.properties.spot_id}
                spot={selFeature.properties}
                decision={selDec?.verdict ?? null}
                why={reasonOf(selDec)}
                inspectHref={`#/workorder/${selFeature.properties.spot_id}`}
                rainCheck={spots.data?.rain_check ?? null}
                headingLevel={3}
                className="sp-card"
                topStart={
                  <button type="button" className="sp-back" onClick={() => select(null)}>
                    <span aria-hidden="true" className="sp-back-arrow">
                      ‹
                    </span>{" "}
                    {t("back")}
                  </button>
                }
              />
            ) : spots.loading ? (
              <p className="sp-muted">
                <Spinner inline /> {t("loading")}
              </p>
            ) : spots.error ? (
              <p className="sp-muted">{t("unavailable")}</p>
            ) : (
              <>
                <div className="sp-srcrow">{srcBadge}</div>
                {!decisions.rows.length ? <p className="sp-muted">{t("srcNone")}</p> : null}
                <ul className="sp-list">
                  {sorted.map((f) => {
                    const p = f.properties;
                    const d = decOf(p.spot_id);
                    const st = d?.verdict ?? "pending";
                    const why = reasonOf(d);
                    return (
                      <li key={p.spot_id}>
                        <button type="button" className="sp-row" onClick={() => select(p.spot_id)}>
                          <span className="sp-row-top">
                            <b className="sp-row-id">
                              <Ltr>{p.spot_id}</Ltr>
                            </b>
                            <span className={`sitecard-status sitecard-status-${st} sp-chip`}>
                              <i aria-hidden="true" />
                              {t(st)}
                              {d?.verdict === "dispatch" && prio(d.priority) ? ` · ${prio(d.priority)}` : ""}
                            </span>
                            <span className="sp-row-dist num">{t("toPipe", { d: withUnit(p.nearest_pipe_m, "m", lang, 0) })}</span>
                          </span>
                          {why ? <span className="sp-row-why">{why}</span> : null}
                          <span className="sp-row-pos">{t("pos", { pm: pm(p.position_accuracy_m, "m", lang) })}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </TabPanel>
          <TabPanel idPrefix="sp" id="reports" value={tab}>
            <ReportsTab />
          </TabPanel>
          <TabPanel idPrefix="sp" id="edits" value={tab}>
            <EditsTab />
          </TabPanel>
          <TabPanel idPrefix="sp" id="log" value={tab}>
            <LogTab />
          </TabPanel>
        </div>
      </aside>
    </div>
  );
}

function DemoChip() {
  const t = useT(panelStrings);
  return <span className="sp-demo">{t("demoLabel")}</span>;
}

const shortTs = (ts: string, n = 16) => ts.replace("T", " ").slice(0, n);

function ReportsTab() {
  const { lang } = useI18n();
  const t = useT(panelStrings);
  const state = useApi(() => getJson<{ labels?: LearningLabel[] }>("/api/learning/state"), []);
  const local = useMemo(() => crewReportsFromStorage(), []);
  const labels = state.data?.labels ?? [];
  const out = (o: "leak" | "no_leak" | null) => (o === "leak" ? t("leak") : o === "no_leak" ? t("noLeak") : t("unset"));
  return (
    <div className="sp-tab">
      <p className="sp-intro">{t("reportsIntro")}</p>
      {state.loading ? (
        <p className="sp-muted">
          <Spinner inline /> {t("loading")}
        </p>
      ) : null}
      {!state.loading && !labels.length && !local.length ? <p className="sp-muted">{t("noReports")}</p> : null}
      <ul className="sp-feed">
        {[...labels].reverse().map((l) => (
          <li key={`s-${l.id}`} className="sp-feed-item">
            <span className="sp-feed-top">
              <b>
                <Ltr>{l.spot_id}</Ltr>
              </b>
              <span>{out(l.outcome)}</span>
              <DemoChip />
            </span>
            <span className="sp-feed-meta">
              {t("server")} · <Ltr>{shortTs(l.ts)}</Ltr>
              {l.note ? ` · ${l.note}` : ""}
            </span>
          </li>
        ))}
        {local.map((r) => (
          <li key={`l-${r.spot}`} className="sp-feed-item">
            <span className="sp-feed-top">
              <b>
                <Ltr>{r.spot}</Ltr>
              </b>
              <span>{out(r.result)}</span>
              <DemoChip />
            </span>
            <span className="sp-feed-meta">
              {t("thisBrowser")}
              {r.saved_at ? (
                <>
                  {" · "}
                  <Ltr>{shortTs(r.saved_at)}</Ltr>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <a className="sp-link" href="#/learning">
        {t("openLearning")} {lang === "ar" ? "←" : "→"}
      </a>
    </div>
  );
}

function EditsTab() {
  const { lang } = useI18n();
  const t = useT(panelStrings);
  const hf = useApi(() => api.hfResults(), []);
  const r = hf.data?.results ?? null;
  return (
    <div className="sp-tab">
      <p className="sp-intro">{t("editsIntro")}</p>
      {hf.loading ? (
        <p className="sp-muted">
          <Spinner inline /> {t("loading")}
        </p>
      ) : !r ? (
        <p className="sp-muted">{t("unavailable")}</p>
      ) : (
        <>
          <dl className="sp-stats">
            <div>
              <dt>{t("gapsFound")}</dt>
              <dd className="sp-stat-num num">{fmt(r.network.gaps_found, 0)}</dd>
              <dd className="sp-stat-note">
                {fmt(r.network.nodes, 0)} {t("nodes", { p: fmt(r.network.pipes, 0) })}
              </dd>
            </div>
            <div>
              <dt>{t("gapsTested")}</dt>
              <dd className="sp-stat-num num">{fmt(r.gaps.length, 0)}</dd>
              <dd className="sp-stat-note">
                <Ltr>{r.gaps.map((g, i) => `${String.fromCharCode(65 + i)} ${g.id}`).join(" · ")}</Ltr>
              </dd>
            </div>
          </dl>
          <div className="sp-srcrow">
            <Badge kind="SIMULATED" size="sm" label={t("edtisSim")} />
          </div>
        </>
      )}
      <a className="sp-link" href="#/records">
        {t("openRecords")} {lang === "ar" ? "←" : "→"}
      </a>
    </div>
  );
}

function LogTab() {
  const { lang } = useI18n();
  const t = useT(panelStrings);
  const log = useApi(() => getJson<{ entries: AuditEntry[] }>("/api/audit?limit=50"), []);
  const entries = log.data?.entries ?? [];
  return (
    <div className="sp-tab">
      <p className="sp-intro">{t("logIntro")}</p>
      {log.loading ? (
        <p className="sp-muted">
          <Spinner inline /> {t("loading")}
        </p>
      ) : !entries.length ? (
        <p className="sp-muted">{t("noLog")}</p>
      ) : (
        <ol className="sp-feed">
          {entries.map((e) => (
            <li key={e.id} className="sp-feed-item">
              <span className="sp-feed-top">
                <Ltr mono>{e.action}</Ltr>
                {e.source === "recorded" ? <Badge kind="RECORDED" size="sm" /> : e.source === "demo" ? <DemoChip /> : null}
              </span>
              {e.summary ? <span className="sp-feed-text">{lang === "ar" ? e.summary.ar : e.summary.en}</span> : null}
              <span className="sp-feed-meta">
                <Ltr>{`${e.id} · ${shortTs(e.ts, 19)} · ${e.actor}`}</Ltr>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
