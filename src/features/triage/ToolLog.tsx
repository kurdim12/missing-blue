// Live tool-call log: one row per call with its input and a short summary of what the data returned.
import { useEffect, useRef, type ReactNode } from "react";
import { fmt, fmtDate, pm, useI18n, useT, withUnit, type Lang } from "../../i18n";
import { Badge, Ltr, Spinner } from "../../ui";
import { LAND_COVER_AR, triageStrings } from "./strings";
import type { ToolEntry } from "./useTriageStream";
import { inchText, parsePipeLabel } from "../overview/spotText";
import { MATERIALS } from "../overview/strings";

type T = ReturnType<typeof useT<typeof triageStrings.en>>;

/** '3/4" galvanized iron' (tool result text) -> "¾ إنش · الحديد المجلفن"; unknown wording stays as returned. */
function pipeAr(label: string): ReactNode {
  const p = parsePipeLabel(label ?? "");
  const size = inchText(p.inch, "ar");
  if (!size) return <Ltr>{label}</Ltr>;
  return `${size} · ${p.material ? MATERIALS[p.material].ar : p.materialText}`;
}

const lc = (cls: string, lang: Lang) => (lang === "ar" ? LAND_COVER_AR[cls] ?? cls : cls);

function callLabel(e: ToolEntry) {
  const args = Object.values(e.input ?? {})
    .map((v) => String(v))
    .join(", ");
  return `${e.name}(${args})`;
}

function Summary({ e, t, lang, radius }: { e: ToolEntry; t: T; lang: Lang; radius: number | null }): ReactNode {
  const r = e.result;
  if (!r) return null;
  if (e.is_error) {
    const msg = r.message && typeof r.message === "object" ? r.message[lang] ?? r.message.en : String(r.error ?? "error");
    return (
      <span className="triage-log-err">
        {msg}
        {r.hint ? (
          <>
            {" "}
            <code dir="ltr">{r.hint}</code>
          </>
        ) : null}
      </span>
    );
  }
  switch (e.name) {
    case "list_wet_spots":
      return t("sumList", { n: fmt(r.count, 0), passes: (r.spots?.[0]?.passes ?? []).map((p: string) => fmtDate(p, lang)).join(" · ") });
    case "nearest_pipe": {
      const rec = r.pipe_record;
      return (
        <>
          <Ltr>{r.spot_id}</Ltr>: {t("sumPipe", { d: withUnit(r.spot_centre_to_pipe_m, "m", lang, 0), acc: pm(r.position_accuracy_m, "m", lang) })} ·{" "}
          {lang === "ar" ? pipeAr(r.pipe) : <Ltr>{r.pipe}</Ltr>}
          {rec?.pipe_id ? (
            <>
              {" "}
              · <Ltr mono>{rec.pipe_id}</Ltr>
            </>
          ) : r.pipe_record_missing ? (
            <> · {t("pipeHeld")}</>
          ) : null}{" "}
          {radius != null ? (
            <>
              {" "}
              ·{" "}
              <span className={r.within_40m ? "triage-ok" : "triage-far"}>
                {t(r.within_40m ? "within" : "notWithin", { d: withUnit(radius, "m", lang) })}
              </span>
            </>
          ) : null}
        </>
      );
    }
    case "land_cover":
      return (
        <>
          <Ltr>{r.spot_id}</Ltr>:{" "}
          {(r.land_cover ?? []).map((y: { year: number; class: string }, k: number) => (
            <span key={y.year}>
              {k ? " · " : ""}
              <span className="num">{y.year}</span> {lc(y.class, lang)}
            </span>
          ))}
        </>
      );
    case "simulate_leak": {
      const thr = withUnit(r.threshold_m, "m", lang);
      if (r.scenario)
        return t("sumScenario", { lps: withUnit(r.leak_lps_assumed, "L/s", lang), n: fmt(r.junctions_dropping_over_1m, 0), total: fmt(r.zone_junctions, 0), thr });
      return (
        <>
          <Ltr>{r.spot_id}</Ltr>:{" "}
          {t("sumLeak", { lps: withUnit(r.leak_at_spot?.leak_lps_assumed, "L/s", lang), n: fmt(r.leak_at_spot?.other_junctions_dropping_over_1m, 0), thr })} ·{" "}
          {t("sumBreak", {
            lps: withUnit(r.main_break_comparison?.leak_lps_assumed, "L/s", lang),
            n: fmt(r.main_break_comparison?.junctions_dropping_over_1m, 0),
            total: fmt(r.main_break_comparison?.zone_junctions, 0),
          })}
        </>
      );
    }
    default:
      return null;
  }
}

export function ToolLog({ calls, running, radius }: { calls: ToolEntry[]; running: boolean; radius: number | null }) {
  const { lang } = useI18n();
  const t = useT(triageStrings);
  const box = useRef<HTMLOListElement>(null);

  // keep the newest call in view (scroll the log box, not the page)
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [calls.length, calls[calls.length - 1]?.done]);

  if (!calls.length)
    return (
      <div className="triage-log-empty">
        {running ? <Spinner /> : null}
        <p className="muted">{running ? t("waiting") : t("logEmpty")}</p>
      </div>
    );

  return (
    <ol className="triage-log" ref={box} aria-live="polite">
      {calls.map((e) => (
        <li key={e.i} className={`triage-log-row${e.is_error ? " is-error" : ""}${e.done ? "" : " is-pending"}`}>
          <span className="triage-log-n num" aria-hidden="true">
            {e.i + 1}
          </span>
          <div className="triage-log-body">
            <div className="triage-log-call">
              <code dir="ltr">{callLabel(e)}</code>
              {e.name === "simulate_leak" && e.done && !e.is_error ? <Badge kind="ASSUMED" size="sm" label={t("badgeTwin")} /> : null}
            </div>
            <div className="triage-log-result">{e.done ? <Summary e={e} t={t} lang={lang} radius={radius} /> : <span className="faint">{t("waiting")}</span>}</div>
            {e.done ? (
              <details className="triage-log-raw">
                <summary>{t("raw")}</summary>
                <pre dir="ltr">{JSON.stringify(e.result, null, 1)}</pre>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
