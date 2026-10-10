// Pieces shared by the Overview spot card and the Spot detail page.
import { pm, useI18n, useT, withUnit } from "../../i18n";
import { googleMapsUrl } from "../../map/geo";
import { href } from "../../router";
import type { PipeProps, SpotProps } from "../../types";
import { Badge, Button, Ltr, Panel, Stat, Tag } from "../../ui";
import { overviewStrings } from "./strings";
import {
  builtYears,
  classNoun,
  describePipe,
  inchText,
  landCoverFromSpot,
  landCoverGroups,
  materialName,
  passDates,
  rich,
  type LandCoverYear,
} from "./spotText";

export const SPOTS_FILE = "data/wet_spots/wet_spots.geojson";
export const PIPES_FILE = "data/pipes/karak_pipes.geojson";

/** "Spot centre 6 m from a ¾" galvanized iron service line, position ±50 m" — every value from the records. */
export function PipeSentence({ spot, feature, className = "" }: { spot: SpotProps; feature?: (PipeProps & { matches_spot_file?: boolean }) | null; className?: string }) {
  const { lang } = useI18n();
  const t = useT(overviewStrings);
  const d = describePipe(spot, feature);
  const size = inchText(d.inch, lang);
  return (
    <p className={`ov-sentence ${className}`}>
      {rich(t(size ? "pipeSentence" : "pipeSentenceNoSize"), {
        d: <strong className="num">{withUnit(spot.nearest_pipe_m, "m", lang, 0)}</strong>,
        size: <strong className="num">{size}</strong>,
        material: <strong>{materialName(d, lang)}</strong>,
        cls: <strong>{classNoun(d.cls, lang)}</strong>,
        pm: <span className="num">{pm(spot.position_accuracy_m, "m", lang)}</span>,
      })}
    </p>
  );
}

/** "Built area 2023–2025" / "Open rangeland 2023–2025 (not built-up)" */
export function LandCoverLine({ lc }: { lc: LandCoverYear[] }) {
  const { lang } = useI18n();
  const t = useT(overviewStrings);
  const built = builtYears(lc);
  return (
    <p className="ov-lc">
      <strong>
        {landCoverGroups(lc, lang).map((g, i) => (
          <span key={i}>
            {i ? " → " : ""}
            {g.name} <Ltr>{g.range}</Ltr>
          </span>
        ))}
      </strong>
      {built === 0 ? <span className="muted"> ({t("notBuilt")})</span> : built < lc.length ? <span className="muted"> ({t("builtSome", { n: built, m: lc.length })})</span> : null}
    </p>
  );
}

/** The honest line, on every spot view. */
export function CandidateTag() {
  const t = useT(overviewStrings);
  return <Tag tone="warn">{t("candidate")}</Tag>;
}

/** Compact card for the selected spot on the Overview map (bottom sheet on phones). */
export function SpotCard({ spot, onClose }: { spot: SpotProps; onClose?: () => void }) {
  const { lang, t: tr } = useI18n();
  const t = useT(overviewStrings);
  const dates = passDates(spot, lang);
  const lc = landCoverFromSpot(spot);
  return (
    <Panel
      tone="raised"
      className="ov-card"
      title={<Ltr>{spot.spot_id}</Ltr>}
      subtitle={<CandidateTag />}
      actions={
        onClose ? (
          <button type="button" className="ov-close" onClick={onClose} aria-label={t("close")} title={t("close")}>
            ×
          </button>
        ) : null
      }
    >
      <PipeSentence spot={spot} />
      <div className="ov-card-stats">
        <Stat size="sm" label={t("hhRise")} value={withUnit(spot.hh_rise_db, "dB", lang, 2)} />
        <Stat size="sm" label={t("hvRise")} value={withUnit(spot.hv_rise_db, "dB", lang, 2)} />
        <Stat size="sm" label={t("area")} value={withUnit(spot.area_m2, "m2", lang, 0)} />
      </div>
      <p className="faint ov-small">{t("riseNote", dates)}</p>
      <div className="ov-card-lc">
        <span className="ov-k">{t("landCover")}</span>
        <LandCoverLine lc={lc} />
      </div>
      <div className="badge-row">
        <Badge kind="REAL" size="sm" label={t("spotsLabel")} />
        <Badge kind="REAL" size="sm" label={t("pipesLabel")} />
        <Badge kind="REAL" size="sm" label={tr({ en: "Sentinel-2 land cover", ar: "الغطاء الأرضي Sentinel-2" })} />
      </div>
      <div className="ov-card-actions">
        <Button variant="primary" size="sm" href={href(`/spot/${spot.spot_id}`)}>
          {t("openDetail")}
        </Button>
        <Button size="sm" href={googleMapsUrl(spot.lat, spot.lon)} target="_blank">
          {t("gmaps")} ↗
        </Button>
      </div>
      <p className="faint ov-small">{t("circleNote", { pm: pm(spot.position_accuracy_m, "m", lang) })}</p>
    </Panel>
  );
}

/** Small row of spot chips (W1 … W7) for switching. */
export function SpotChips({ ids, active, onPick, linkTo }: { ids: string[]; active?: string | null; onPick?: (id: string) => void; linkTo?: (id: string) => string }) {
  return (
    <div className="ov-chips" dir="ltr">
      {ids.map((id) =>
        linkTo ? (
          <a key={id} className={`ov-chip${id === active ? " is-active" : ""}`} href={linkTo(id)} aria-current={id === active ? "true" : undefined}>
            {id}
          </a>
        ) : (
          <button key={id} type="button" className={`ov-chip${id === active ? " is-active" : ""}`} onClick={() => onPick?.(id)} aria-pressed={id === active}>
            {id}
          </button>
        ),
      )}
    </div>
  );
}
