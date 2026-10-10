// Site card for one wet spot (reference: docs/qa/shots/reference/ref-sitecard-*.jpg), adapted to our data:
// header (id, status chip, why, "Inspect first"), before/after radar compare slider, stats grid, trend chart.
// Every number comes from data/wet_spots/wet_spots.geojson (via /api/spots or the `spot` prop) or from
// data/wet_spots/spot_timeseries.json (scripts/spot_timeseries.py). Wet spots are inspection candidates only.
import type { ReactNode } from "react";
import { api, radar, useApi } from "../../api";
import { fmt, fmtDate, fmtSigned, pm, unit, withUnit, useI18n, useT } from "../../i18n";
import type { PipeProps, SpotProps } from "../../types";
import { Badge, Ltr } from "../../ui";
import { classNoun, describePipe, inchText, landCoverFromSpot, landCoverGroups, materialName, parseRain } from "../overview/spotText";
import { CompareSlider } from "./CompareSlider";
import { SERIES, seriesFor, type SpotSeries } from "./series";
import { sitesStrings } from "./strings";
import { TrendChart } from "./TrendChart";
import "./sites.css";

export type SiteDecision = "dispatch" | "reject";

export type SiteCardProps = {
  /** "W7" */
  spotId: string;
  /** The spot record (feature.properties from api.spots() or api.spot(id).spot). Loaded from /api/spots when absent. */
  spot?: SpotProps | null;
  /** Dispatch decision (e.g. from triage). Absent/null: "Not triaged yet". */
  decision?: SiteDecision | null;
  /** One-line reason shown under the title (already localized). */
  why?: ReactNode;
  /** Primary "Inspect first" action; the button is hidden when neither onInspect nor inspectHref is given. */
  onInspect?: () => void;
  inspectHref?: string;
  /** Matching pipe feature (api.spot(id).nearest_pipe.feature) to prefer the pipe file's diameter/material. */
  pipeFeature?: (PipeProps & { matches_spot_file?: boolean }) | null;
  /** rain_check sentence (api.spots().rain_check); loaded from /api/spots when absent. */
  rainCheck?: string | null;
  /** Override the bundled time series (e.g. served by an API later). */
  series?: SpotSeries | null;
  /** Slot at the inline-start of the top row (e.g. a back link). */
  topStart?: ReactNode;
  /** Heading level of the spot id (default 2). */
  headingLevel?: 2 | 3;
  className?: string;
};

function Cell({ label, value, note, wide }: { label: ReactNode; value: ReactNode; note?: ReactNode; wide?: boolean }) {
  return (
    <div className={`sitecard-cell${wide ? " sitecard-cell-wide" : ""}`}>
      <dt className="sitecard-cell-label">{label}</dt>
      <dd className="sitecard-cell-value">{value}</dd>
      {note ? <dd className="sitecard-cell-note">{note}</dd> : null}
    </div>
  );
}

export function SiteCard({
  spotId,
  spot: spotProp,
  decision,
  why,
  onInspect,
  inspectHref,
  pipeFeature,
  rainCheck,
  series: seriesProp,
  topStart,
  headingLevel = 2,
  className,
}: SiteCardProps) {
  const { lang } = useI18n();
  const t = useT(sitesStrings);
  const spots = useApi(() => api.spots(), []); // cached; one request shared with the rest of the app
  const spot: SpotProps | null =
    spotProp ?? spots.data?.features.find((f) => f.properties.spot_id.toUpperCase() === spotId.toUpperCase())?.properties ?? null;
  const rain = parseRain(rainCheck ?? spots.data?.rain_check ?? null);
  const s = seriesProp ?? seriesFor(spotId);
  const H = headingLevel === 3 ? "h3" : "h2";
  const num = /\d+/.exec(spotId)?.[0];
  const u = unit("m", lang);

  const status = decision === "dispatch" ? "dispatch" : decision === "reject" ? "reject" : "pending";

  // ------------------------------------------------------------------ stats (all from the spot record / series file)
  const passes = spot?.passes ?? SERIES.passes;
  const [d0, d1, d2] = passes;
  const pipe = spot ? describePipe(spot, pipeFeature) : null;
  const pipeText = pipe
    ? lang === "ar"
      ? `${materialName(pipe, lang)} ${inchText(pipe.inch, lang) ?? ""}`.trim()
      : `${inchText(pipe.inch, lang) ?? ""} ${materialName(pipe, lang)}`.trim()
    : "";
  const lcYears = spot ? landCoverFromSpot(spot) : [];
  const lcGroups = landCoverGroups(lcYears, lang);
  const thr = SERIES.thresholds_db;

  const cells: ReactNode[] = spot
    ? [
        <Cell
          key="area"
          label={t("area")}
          value={withUnit(spot.area_m2, "m2", lang, 0)}
          note={s ? t("areaNote", { n: fmt(s.wet_pixels.px, 0), px: fmt(SERIES.grid.m_per_px, 0), u }) : undefined}
        />,
        <Cell
          key="nearest"
          label={t("nearest")}
          value={withUnit(spot.nearest_pipe_m, "m", lang, 0)}
          note={t("nearestNote", { pipe: pipeText, cls: classNoun(pipe!.cls, lang), pm: pm(spot.position_accuracy_m, "m", lang) })}
        />,
        <Cell key="hh" label={t("hhRise")} value={<Ltr>{`${fmtSigned(spot.hh_rise_db, 2, 2)} dB`}</Ltr>} note={t("riseNote", { d0: fmtDate(d0, lang), d1: fmtDate(d1, lang), d2: fmtDate(d2, lang) })} />,
        <Cell key="hv" label={t("hvRise")} value={<Ltr>{`${fmtSigned(spot.hv_rise_db, 2, 2)} dB`}</Ltr>} note={t("riseNote", { d0: fmtDate(d0, lang), d1: fmtDate(d1, lang), d2: fmtDate(d2, lang) })} />,
        <Cell
          key="lc"
          label={t("lc", { y0: String(lcYears[0]?.year ?? ""), y1: String(lcYears[lcYears.length - 1]?.year ?? "") })}
          value={<span className="sitecard-cell-text">{lcGroups.map((g) => g.name).join(" → ")}</span>}
          note={lcGroups.length > 1 ? lcGroups.map((g) => `${g.name} ${g.range}`).join(" · ") : lcGroups[0]?.range}
        />,
        <Cell
          key="rain"
          label={t("rain")}
          value={rain ? withUnit(rain.mm, "mm", lang, 1) : t("unknown")}
          note={rain && rain.d0 && rain.d1 ? t("rainNote", { d0: fmtDate(rain.d0, lang), d1: fmtDate(rain.d1, lang) }) : undefined}
        />,
        s ? (
          <Cell
            key="w100"
            label={t("wet100", { r: fmt(SERIES.params.radius_m, 0), u })}
            value={fmt(s.wet_px_within_100m, 0)}
            note={t("wet100Note", { hh: fmt(thr.hh, 1), hv: fmt(thr.hv, 1) })}
          />
        ) : null,
        <Cell
          key="passes"
          label={t("passes")}
          value={fmt(passes.length, 0)}
          note={t("passesNote", { d0: fmtDate(d0, lang), d1: fmtDate(d1, lang), d2: fmtDate(d2, lang) })}
        />,
      ]
    : [];

  const dates = SERIES.passes;
  const lastDate = dates[dates.length - 1];

  return (
    <article className={`sitecard${className ? ` ${className}` : ""}`} aria-labelledby={`sitecard-title-${spotId}`}>
      <div className="sitecard-top">
        <div className="sitecard-top-start">{topStart}</div>
        <span className={`sitecard-status sitecard-status-${status}`}>
          <i aria-hidden="true" />
          {t(status)}
        </span>
      </div>

      <header className="sitecard-head">
        <p className="sitecard-kicker">
          {t("kicker")}
          {num ? (
            <>
              {" · "}
              <bdi>#{num}</bdi>
            </>
          ) : null}
        </p>
        <H className="sitecard-title" id={`sitecard-title-${spotId}`}>
          <Ltr>{spotId}</Ltr>
          {num ? <span className="sitecard-subtitle">{t("spotNo", { n: num })}</span> : null}
        </H>
        {why ? <p className="sitecard-why">{why}</p> : null}
        <div className="sitecard-cta-row">
          {onInspect || inspectHref ? (
            inspectHref ? (
              <a className="sitecard-cta" href={inspectHref} onClick={onInspect}>
                {t("inspect")}
              </a>
            ) : (
              <button type="button" className="sitecard-cta" onClick={onInspect}>
                {t("inspect")}
              </button>
            )
          ) : null}
          <span className="sitecard-cta-note">{t("inspectNote")}</span>
        </div>
        <div className="sitecard-badges">
          <Badge kind="REAL" size="sm" label={t("radar")} />
          <span className="sitecard-prov" title={t("provisionalTip")}>
            {t("provisional")}
          </span>
        </div>
      </header>

      {s ? (
        <CompareSlider
          before={{ url: radar.url(SERIES.images.before), date: dates[0] }}
          after={{ url: radar.url(SERIES.images.after), date: lastDate }}
          crop={s.crop}
          accuracyM={spot?.position_accuracy_m ?? 50}
          label={t("compareLabel", { id: spotId })}
          caption={
            <>
              <span className="sitecard-cap-main">
                {t("caption", { w: fmt(SERIES.params.crop_m, 0), h: fmt(SERIES.params.crop_m, 0), u, px: fmt(SERIES.grid.m_per_px, 0) })}
              </span>
              <span className="sitecard-cap-note">
                {t("stretchNote", { pm: pm(spot?.position_accuracy_m ?? 50, "m", lang) })}
                {s.crop.inside_grid_frac < 1 ? ` ${t("outside")}` : ""}
              </span>
            </>
          }
        />
      ) : (
        <p className="sitecard-empty">{t("noSeries")}</p>
      )}

      {cells.length ? <dl className="sitecard-stats">{cells}</dl> : null}

      {s ? (
        <section className="sitecard-trend-wrap" aria-label={t("trend")}>
          <h4 className="sitecard-section-title">{t("trend")}</h4>
          <TrendChart
            dates={dates}
            hh={dates.map((d) => s.wet_pixels.hh_change_db[d] ?? null)}
            hv={dates.map((d) => s.wet_pixels.hv_change_db[d] ?? null)}
            thrHH={thr.hh}
            thrHV={thr.hv}
          />
          <p className="sitecard-fine">{t("trendNote", { n: fmt(s.wet_pixels.px, 0), d0: fmtDate(dates[0], lang) })}</p>
          <p className="sitecard-fine">
            {t("window", {
              w: fmt(SERIES.params.window_m, 0),
              u,
              hh: fmtSigned(s.window_100m.hh_change_db[lastDate] ?? NaN, 2),
              hv: fmtSigned(s.window_100m.hv_change_db[lastDate] ?? NaN, 2),
              d: fmtDate(lastDate, lang),
            })}
          </p>
        </section>
      ) : null}

      <footer className="sitecard-foot">
        <Badge kind="REAL" size="sm" label={t("pipes")} />
        <Badge kind="REAL" size="sm" label={t("landCover")} />
        <Badge kind="REAL" size="sm" label={t("rainSrc")} />
      </footer>
    </article>
  );
}

export default SiteCard;
