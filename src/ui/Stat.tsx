// A figure with its source. Pass the value already formatted (fmt / withUnit from src/i18n).
// <Stat label="Spot centre to pipe" value={fmt(6)} unit={unit("m", lang)} note={pm(50, "m", lang)}
//       source="data/wet_spots/wet_spots.geojson" badge={<Badge kind="REAL" size="sm" />} />
import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  unit,
  note,
  source,
  badge,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  source?: ReactNode;
  badge?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={`stat stat-${size}`}>
      <div className="stat-label">
        <span>{label}</span>
        {badge ? <span className="stat-badge">{badge}</span> : null}
      </div>
      <div className="stat-value">
        <span className="num">{value}</span>
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </div>
      {note ? <div className="stat-note">{note}</div> : null}
      {source ? (
        <div className="stat-source">
          <bdi dir="ltr">{source}</bdi>
        </div>
      ) : null}
    </div>
  );
}
