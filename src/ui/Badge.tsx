// Provenance badge. Put one on every layer and every result:
// <Badge kind="REAL" label={t({ en: "NISAR radar", ar: "رادار NISAR" })} />
import { useI18n } from "../i18n";
import { provenanceStrings } from "../features/shell/strings";
import type { Provenance } from "../types";

const CLS: Record<Provenance, string> = { REAL: "real", SIMULATED: "sim", ASSUMED: "assumed", RECORDED: "recorded", PLAN: "plan" };

export function Badge({ kind, label, tip, size = "md" }: { kind: Provenance; label?: string; tip?: string; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const p = provenanceStrings[kind];
  const title = tip ?? t(p.tip);
  return (
    <span className={`badge badge-${CLS[kind]} badge-${size}`} title={title} aria-label={`${t(p.label)}${label ? ` · ${label}` : ""}: ${title}`}>
      <span className="badge-dot" aria-hidden="true" />
      <span className="badge-kind">{t(p.label)}</span>
      {label ? <span className="badge-label">{label}</span> : null}
    </span>
  );
}
