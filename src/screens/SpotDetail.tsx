// Screen "spot" (#/spot/:id) · Journey 1, step 5. One wet spot: radar rise, the nearest real pipe ("spot centre X m from
// pipe, position ±50 m"), land cover 2023–2025, rain check, location, and the next steps (twin, work order).
// Every figure comes from GET /api/spots/:id (wet_spots.geojson + the pipe file) or the twin file.
import { useMemo } from "react";
import { api, useApi } from "../api";
import { fmtDate, fmtSigned, pm, unit, useI18n, useT, withUnit } from "../i18n";
import { BaseMap } from "../map/BaseMap";
import { boundsAround, googleMapsUrl } from "../map/geo";
import { pipeClass } from "../map/style";
import { href } from "../router";
import type { ScreenProps } from "../screens";
import type { SpotDetail as SpotDetailT, SpotFeature } from "../types";
import { Badge, Button, EmptyState, Ltr, Page, PageHeader, Panel, SourceNote, Spinner, Stat, Tag } from "../ui";
import { AccuracyCircle, HighlightPipe, PipesLayer, SpotMarkers } from "../features/overview/layers";
import { CandidateTag, LandCoverLine, PipeSentence, SpotChips } from "../features/overview/SpotParts";
import { describePipe, distanceM, inchText, lcName, materialName, parseRain, passDates, rich } from "../features/overview/spotText";
import { overviewStrings } from "../features/overview/strings";
import "../features/overview/overview.css";

function SpotMap({ d }: { d: SpotDetailT }) {
  const { lang } = useI18n();
  const t = useT(overviewStrings);
  const p = d.spot;
  const [lon, lat] = d.geometry.coordinates;
  // frame the spot and its nearest pipe (distance from the spot file), never tighter than the ±50 m circle
  const margin = Math.min(2200, Math.max(160, p.nearest_pipe_m * 1.3 + 80, p.position_accuracy_m * 3));
  const view = useMemo(() => boundsAround([[lon, lat]], margin), [lon, lat, margin]);
  const bbox = useMemo(() => boundsAround([[lon, lat]], margin * 2), [lon, lat, margin]);
  const pipes = useApi(() => api.pipes(bbox), [bbox.join(",")]);
  const feature: SpotFeature = useMemo(() => ({ type: "Feature", properties: p, geometry: d.geometry }), [p, d.geometry]);
  const spotsArr = useMemo(() => [feature], [feature]);
  const near = d.nearest_pipe.feature;
  return (
    <div className="sd-map-wrap">
      <div className="sd-map">
        <BaseMap key={d.id} bounds={view} padding={16} attribution="NISAR: NASA/ISRO (ASF DAAC) · Pipes: AJI Group ArcGIS item (no licence stated)">
          <PipesLayer id="sd-pipes" data={pipes.data} beforeId="ov-near-halo" />
          <HighlightPipe coords={near?.coordinates ?? null} />
          <AccuracyCircle spot={feature} />
          <SpotMarkers spots={spotsArr} selected={d.id} />
        </BaseMap>
      </div>
      <div className="sd-map-legend">
        <span>{t("circleNote", { pm: pm(p.position_accuracy_m, "m", lang) })}</span>
        {near ? <span>{rich(t("mapHighlight"), { id: <Ltr mono>{near.pipe_id}</Ltr> })}</span> : null}
        <Badge kind="REAL" size="sm" label={t("pipesLabel")} />
      </div>
      {pipes.error ? <EmptyState compact error={pipes.error} /> : null}
    </div>
  );
}

export default function SpotDetail({ params }: ScreenProps) {
  const { lang, dir, t: tr } = useI18n();
  const t = useT(overviewStrings);
  const id = (params.id ?? "").toUpperCase();
  const det = useApi(() => api.spot(id), [id]);
  const spots = useApi(() => api.spots(), []);
  const twin = useApi(() => api.twin("base"), []);

  const backHref = href(`/overview?spot=${encodeURIComponent(id)}`);
  const back = (
    <a href={backHref} className="sd-back">
      {dir === "rtl" ? "→" : "←"} {t("back")}
    </a>
  );

  if (det.loading)
    return (
      <Page wide>
        <PageHeader kicker={back} title={rich(t("detailTitle"), { id: <Ltr>{id}</Ltr> })} />
        <Spinner />
      </Page>
    );
  if (det.error || !det.data)
    return (
      <Page wide>
        <PageHeader kicker={back} title={rich(t("detailTitle"), { id: <Ltr>{id}</Ltr> })} />
        <EmptyState error={det.error} onRetry={det.reload} />
      </Page>
    );

  const d = det.data;
  const p = d.spot;
  const pd = describePipe(p, d.nearest_pipe.feature);
  const size = inchText(pd.inch, lang);
  const dates = passDates(p, lang);
  const rain = parseRain(d.rain_check);
  const cls = pipeClass(pd.cls);

  // twin coverage: the twin has a scenario at this spot only when its leak junction lies within the spot's position
  // accuracy (the same test as the triage tool simulate_leak in server/triage.ts), not merely inside the zone radius
  const tw = twin.data;
  const twinNote = tw
    ? distanceM(p.lat, p.lon, tw.key.cand.lat, tw.key.cand.lon) <= p.position_accuracy_m
      ? t("twinInside", { r: withUnit(tw.assumptions.radius_m / 1000, "km", lang, 1) })
      : t("twinOutside", { r: withUnit(tw.assumptions.radius_m / 1000, "km", lang, 1) })
    : null;

  const radarBadges = (
    <>
      <Badge kind="REAL" size="sm" label={t("radar")} />
      <Tag tone="warn" title={t("provisionalTip")}>
        {t("provisional")}
      </Tag>
    </>
  );

  return (
    <Page wide>
      <div className="sd">
        <PageHeader
          kicker={back}
          title={rich(t("detailTitle"), { id: <Ltr>{p.spot_id}</Ltr> })}
          lead={t("detailLead")}
          badges={
            <>
              <CandidateTag />
              <Badge kind="REAL" size="sm" label={t("spotsLabel")} />
              <Badge kind="REAL" size="sm" label={t("pipesLabel")} />
              <Badge kind="REAL" size="sm" label={tr({ en: "Sentinel-2 land cover", ar: "الغطاء الأرضي Sentinel-2" })} />
              <Badge kind="REAL" size="sm" label={t("rainLabel")} />
            </>
          }
          actions={
            <>
              <Button variant="primary" href={href(`/workorder/${p.spot_id}`)}>
                {t("workOrder")}
              </Button>
              <Button href={href("/twin")}>{t("twin")}</Button>
            </>
          }
        />

        <div className="sd-top">
          <SpotMap d={d} />
          <Panel tone="accent" title={t("nearestPipe")} badges={<Badge kind="REAL" size="sm" label={t("pipesLabel")} />}>
            <PipeSentence spot={p} feature={d.nearest_pipe.feature} className="sd-sentence" />
            <div className="stat-grid sd-pipe-stats">
              <Stat
                label={t("distance")}
                value={withUnit(d.nearest_pipe.distance_m, "m", lang, 0)}
                note={t("posNote", { pm: pm(d.nearest_pipe.position_accuracy_m, "m", lang) })}
              />
              <Stat label={t("size")} value={size ?? t("unknownSize")} />
              <Stat label={t("material")} value={materialName(pd, lang)} />
              <Stat
                label={t("pipeClass")}
                value={
                  <span className="sd-class">
                    <span className="ov-swatch" style={{ background: cls.color }} aria-hidden="true" />
                    {tr(cls.label)}
                  </span>
                }
                note={tr(cls.range)}
              />
              <Stat label={t("cadLayer")} value={<Ltr mono>{pd.layer}</Ltr>} />
              {pd.id ? <Stat label={t("pipeId")} value={<Ltr mono>{pd.id}</Ltr>} /> : null}
            </div>
            {d.nearest_pipe.feature_missing ? (
              <p className="faint ov-small">
                {t("pipeRecordMissing")} {d.nearest_pipe.feature_missing.hint ? <code dir="ltr">{d.nearest_pipe.feature_missing.hint}</code> : null}
              </p>
            ) : null}
            <SourceNote file={d.sources.spot} />
            <SourceNote file={d.sources.pipe}>AJI Group ArcGIS, layer 6</SourceNote>
          </Panel>
        </div>

        <div className="grid-3 sd-row">
          <Panel title={t("radarRise")} badges={radarBadges}>
            <div className="stat-grid">
              <Stat label={t("hhRise")} value={<Ltr>{fmtSigned(d.radar.hh_rise_db, 2)}</Ltr>} unit={unit("dB", lang)} />
              <Stat label={t("hvRise")} value={<Ltr>{fmtSigned(d.radar.hv_rise_db, 2)}</Ltr>} unit={unit("dB", lang)} />
              <Stat label={t("area")} value={withUnit(d.radar.area_m2, "m2", lang, 0)} />
            </div>
            <p className="faint ov-small">{t("riseNote", dates)}</p>
            <p className="ov-small">
              <span className="ov-k">{t("passes")}: </span>
              {d.radar.passes.map((x, i) => (
                <span key={x} className="num">
                  {i ? " · " : ""}
                  {fmtDate(x, lang)}
                </span>
              ))}
            </p>
            <SourceNote file={d.sources.spot}>NISAR L2 GCOV</SourceNote>
          </Panel>

          <Panel title={t("landCover")} badges={<Badge kind="REAL" size="sm" label="Sentinel-2" />}>
            <LandCoverLine lc={d.land_cover} />
            <table className="sd-lc">
              <tbody>
                {d.land_cover.map((r) => (
                  <tr key={r.year}>
                    <th scope="row" className="num">
                      {r.year}
                    </th>
                    <td>{lcName(r.class, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SourceNote>Sentinel-2 10 m Land Use/Land Cover (Impact Observatory, Microsoft, Esri)</SourceNote>
          </Panel>

          <Panel title={t("location")} badges={<Badge kind="REAL" size="sm" label={t("rainLabel")} />}>
            <div>
              <span className="ov-k">{t("coords")}</span>
              <p className="num">
                <Ltr mono>{`${p.lat}, ${p.lon}`}</Ltr>
              </p>
              <p className="faint ov-small">{t("circleNote", { pm: pm(p.position_accuracy_m, "m", lang) })}</p>
            </div>
            <Button href={googleMapsUrl(p.lat, p.lon)} target="_blank" size="sm">
              {t("gmaps")} ↗
            </Button>
            <div>
              <span className="ov-k">{t("rain")}</span>
              <p>
                {rain && rain.d0 && rain.d1
                  ? t("rainText", { mm: withUnit(rain.mm, "mm", lang, 1), d0: fmtDate(rain.d0, lang), d1: fmtDate(rain.d1, lang) })
                  : d.rain_check ?? "–"}
              </p>
            </div>
            <SourceNote file={d.sources.spot}>ERA5 via Open-Meteo (CC BY 4.0)</SourceNote>
          </Panel>
        </div>

        <Panel title={t("nextSteps")} className="sd-row">
          <div className="sd-next">
            <div>
              <Button href={href("/twin")}>{t("twin")}</Button>
              {twinNote ? <p className="muted ov-small">{twinNote}</p> : null}
              <div className="badge-row">
                <Badge kind="REAL" size="sm" label={tr({ en: "twin geometry", ar: "هندسة التوأم" })} />
                <Badge kind="ASSUMED" size="sm" label={tr({ en: "twin demand, tank level, leak size", ar: "الطلب ومنسوب الخزان وحجم التسرب" })} />
              </div>
            </div>
            <div>
              <Button variant="primary" href={href(`/workorder/${p.spot_id}`)}>
                {t("workOrder")}
              </Button>
              <p className="ov-small">
                <CandidateTag />
              </p>
            </div>
          </div>
        </Panel>

        {spots.data ? (
          <nav className="sd-row sd-others" aria-label={t("otherSpots")}>
            <span className="ov-k">{t("otherSpots")}</span>
            <SpotChips ids={spots.data.features.map((f) => f.properties.spot_id)} active={p.spot_id} linkTo={(x) => href(`/spot/${x}`)} />
          </nav>
        ) : null}
      </div>
    </Page>
  );
}
