// One triage decision: verdict, priority, reason (EN or AR), the server's number check, link to the spot.
import { href } from "../../router";
import { useI18n, useT, withUnit } from "../../i18n";
import { Ltr, Tag } from "../../ui";
import { triageStrings } from "./strings";
import type { TriageDecision } from "./useTriageStream";

const PRIO = { high: "prio_high", medium: "prio_medium", low: "prio_low" } as const;

export function DecisionCard({ d, radius }: { d: TriageDecision; radius: number | null }) {
  const { lang } = useI18n();
  const t = useT(triageStrings);
  const n = d.checks?.numbers;
  const reason = lang === "ar" && d.reason_ar ? d.reason_ar : d.reason;
  return (
    <article className={`triage-card triage-card-${d.verdict}`}>
      <header className="triage-card-head">
        <a className="triage-card-id" href={href(`/spot/${d.id}`)}>
          <Ltr>{d.id}</Ltr>
        </a>
        <Tag tone={d.verdict === "dispatch" ? "blue" : "neutral"}>{t(d.verdict)}</Tag>
        {d.priority ? <Tag tone={d.priority === "high" ? "warn" : "neutral"}>{t(PRIO[d.priority])}</Tag> : null}
      </header>
      <p className="triage-card-reason">{reason}</p>
      {d.corrected ? (
        <p className="triage-card-note" title={d.original_reason}>
          <Tag tone="warn">{t("corrected")}</Tag> {d.corrected[lang]}
        </p>
      ) : null}
      <footer className="triage-card-foot">
        {n ? (
          n.total === 0 ? (
            <span className="faint">{t("numbersNone")}</span>
          ) : n.unmatched.length ? (
            <Tag tone="danger">{t("numbersBad", { list: n.unmatched.join(", ") })}</Tag>
          ) : (
            <span className="triage-check" title={n.rounded.length ? t("numbersRounded", { list: n.rounded.join(", ") }) : undefined}>
              <span aria-hidden="true">✓</span> {t("numbersOk", { m: n.matched, n: n.total })}
            </span>
          )
        ) : null}
        {d.checks?.rule === "dispatch_beyond_40m" && radius != null ? (
          <Tag tone="danger">{t("ruleBad", { d: withUnit(radius, "m", lang) })}</Tag>
        ) : null}
        <a className="triage-card-link" href={href(`/spot/${d.id}`)}>
          {t("openSpot")} <Ltr>{d.id}</Ltr> <span aria-hidden="true">{lang === "ar" ? "←" : "→"}</span>
        </a>
      </footer>
    </article>
  );
}
