// Small SVG line chart: HH and HV change (dB vs the first pass) over the radar passes, with the wet rule's
// thresholds as dashed lines. Time runs left to right in both languages (the chart is a graphic, dir="ltr").
import { fmt, fmtDate, fmtSigned, useI18n, useT } from "../../i18n";
import { sitesStrings } from "./strings";

export type TrendChartProps = {
  dates: string[];
  hh: (number | null)[];
  hv: (number | null)[];
  thrHH: number;
  thrHV: number;
  ariaLabel?: string;
};

const W = 320, H = 168;
const M = { l: 34, r: 14, t: 22, b: 30 };

export function TrendChart({ dates, hh, hv, thrHH, thrHV, ariaLabel }: TrendChartProps) {
  const { lang } = useI18n();
  const t = useT(sitesStrings);
  const vals = [...hh, ...hv].filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = Math.floor(Math.min(0, ...vals) - 0.25);
  const hi = Math.ceil(Math.max(thrHH, thrHV, ...vals) + 0.3);
  const t0 = Date.parse(dates[0]);
  const t1 = Date.parse(dates[dates.length - 1]);
  const x = (d: string) => M.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - M.l - M.r);
  const y = (v: number) => M.t + ((hi - v) / (hi - lo)) * (H - M.t - M.b);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += 1) ticks.push(v);

  const line = (s: (number | null)[]) =>
    s
      .map((v, i) => (v === null ? null : `${x(dates[i]).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");

  // value labels: HH above its point, HV below, skipped at the baseline (0 by definition)
  const labels = (s: (number | null)[], cls: string, above: boolean) =>
    s.map((v, i) =>
      v === null || i === 0 ? null : (
        <text key={`${cls}${i}`} x={x(dates[i])} y={y(v) + (above ? -8 : 15)} textAnchor={i === dates.length - 1 ? "end" : "middle"} className={`sitecard-tc-val ${cls}`}>
          {fmtSigned(v, 2)}
        </text>
      ),
    );

  return (
    <figure className="sitecard-trend">
      <div dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel ?? t("trendAria")} className="sitecard-tc-svg">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? "sitecard-tc-zero" : "sitecard-tc-grid"} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="sitecard-tc-tick">
              {v > 0 ? `+${fmt(v, 0)}` : fmt(v, 0)}
            </text>
          </g>
        ))}
        <text x={M.l - 6} y={9} textAnchor="end" className="sitecard-tc-tick">
          dB
        </text>
        <line x1={M.l} x2={W - M.r} y1={y(thrHH)} y2={y(thrHH)} className="sitecard-tc-thr sitecard-tc-hh" />
        <line x1={M.l} x2={W - M.r} y1={y(thrHV)} y2={y(thrHV)} className="sitecard-tc-thr sitecard-tc-hv" />
        <polyline points={line(hv)} className="sitecard-tc-line sitecard-tc-hv" />
        <polyline points={line(hh)} className="sitecard-tc-line sitecard-tc-hh" />
        {hv.map((v, i) => (v === null ? null : <circle key={`v${i}`} cx={x(dates[i])} cy={y(v)} r={3.5} className="sitecard-tc-pt sitecard-tc-hv" />))}
        {hh.map((v, i) => (v === null ? null : <circle key={`h${i}`} cx={x(dates[i])} cy={y(v)} r={3.5} className="sitecard-tc-pt sitecard-tc-hh" />))}
        {labels(hh, "sitecard-tc-hh", true)}
        {labels(hv, "sitecard-tc-hv", false)}
        {dates.map((d, i) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"} className="sitecard-tc-date">
            {fmtDate(d, lang, "short")}
          </text>
        ))}
      </svg>
      </div>
      <figcaption className="sitecard-tc-legend">
        <span className="sitecard-tc-key">
          <i className="sitecard-tc-sw sitecard-tc-hh" aria-hidden="true" />
          {t("hhLine")}
        </span>
        <span className="sitecard-tc-key">
          <i className="sitecard-tc-sw sitecard-tc-hv" aria-hidden="true" />
          {t("hvLine")}
        </span>
        <span className="sitecard-tc-key">
          <i className="sitecard-tc-sw sitecard-tc-hh sitecard-tc-dash" aria-hidden="true" />
          <bdi>{t("hhThr", { v: fmt(thrHH, 1) })}</bdi>
        </span>
        <span className="sitecard-tc-key">
          <i className="sitecard-tc-sw sitecard-tc-hv sitecard-tc-dash" aria-hidden="true" />
          <bdi>{t("hvThr", { v: fmt(thrHV, 1) })}</bdi>
        </span>
      </figcaption>
    </figure>
  );
}
