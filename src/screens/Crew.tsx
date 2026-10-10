// Screen "crew" (#/crew/:id): the field crew's phone view. Arabic first, big buttons: map pin with the ±50 m search
// circle and the nearby pipe highlighted, "Open in Google Maps", the order text, a checklist, "Leak found / No leak"
// with a note. Stored in localStorage for the demo (no backend yet), with a confirmation message.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenProps } from "../screens";
import { api, useApi, type ApiError } from "../api";
import { pm, useI18n, useT, withUnit, type Lang } from "../i18n";
import { href } from "../router";
import { googleMapsUrl } from "../map/geo";
import { Badge, Button, EmptyState, Ltr, Spinner, Tag } from "../ui";
import { PRIORITY_TONE, SECTION_KEYS, woApi } from "../features/workorder/api";
import { crewStrings, woStrings } from "../features/workorder/strings";
import { CrewMap } from "../features/workorder/CrewMap";
import { CHECKS, useCrewReport } from "../features/workorder/store";
import { describePipe, inchText, materialName } from "../features/overview/spotText";
import { postCrewOutcome } from "../features/learning/api";
import "../features/workorder/workorder.css";

/** The crew view opens in Arabic (or ?lang=); the presenter's own language comes back when they leave, unless they toggled here. */
function useCrewLanguage(query: URLSearchParams, embedded?: boolean) {
  const { lang, setLang, toggleLang } = useI18n();
  const toggled = useRef(false);
  useEffect(() => {
    if (embedded) return;
    const q = query.get("lang");
    const want: Lang = q === "en" || q === "ar" ? q : "ar";
    const prev = lang;
    if (want !== prev) setLang(want);
    return () => {
      if (!toggled.current && want !== prev) setLang(prev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return () => {
    toggled.current = true;
    toggleLang();
  };
}

export default function Crew({ params, query, embedded }: ScreenProps) {
  const id = (params.id || "W7").toUpperCase();
  const { lang } = useI18n();
  const t = useT(crewStrings);
  const tw = useT(woStrings);
  const toggle = useCrewLanguage(query, embedded);
  const spot = useApi(() => api.spot(id), [id]);
  const order = useApi(() => woApi.order(id, lang, "latest"), [id]);
  const { report, update } = useCrewReport(id);
  const [note, setNote] = useState(report.note);
  const [pipesError, setPipesError] = useState<ApiError | null>(null);
  const onPipesError = useCallback((e: ApiError | null) => setPipesError(e), []);

  const o = order.data;
  const s = spot.data;
  const other: Lang = lang === "ar" ? "en" : "ar";
  const orderId = o?.order_id ?? `MB-KRK-${id.replace(/\D/g, "").padStart(4, "0")}`;

  const save = (result: "leak" | "no_leak") => {
    update({ result, note, saved_at: new Date().toISOString() });
    // Also a demo label for adaptive learning (server/learning.ts); offline it is simply kept on the phone.
    void postCrewOutcome(id, result, note);
  };

  return (
    <div className="crew">
      <header className="crew-head">
        <div className="crew-head-id">
          <span className="crew-head-kind">{t("order")}</span>
          <Ltr mono>{orderId}</Ltr>
        </div>
        <div className="crew-head-tools">
          {o ? <Tag tone={PRIORITY_TONE[o.priority]}>{tw(`prio_${o.priority}`)}</Tag> : null}
          <button type="button" className="lang-toggle crew-lang" onClick={toggle} aria-label={t("langLabel")}>
            {t("langBtn")}
          </button>
        </div>
      </header>

      <p className="crew-candidate">{t("candidate")}</p>

      {spot.loading ? (
        <div className="crew-map crew-map-loading">
          <Spinner />
        </div>
      ) : s ? (
        <>
          <CrewMap
            lat={s.spot.lat}
            lon={s.spot.lon}
            radiusM={s.nearest_pipe.position_accuracy_m}
            pipe={s.nearest_pipe.feature?.coordinates ?? null}
            onPipesError={onPipesError}
            pinLabel={`${id} ${s.spot.lat.toFixed(5)}, ${s.spot.lon.toFixed(5)}`}
          />
          <div className="crew-where">
            <p className="crew-coords">
              <Ltr mono>{`${s.spot.lat.toFixed(5)}, ${s.spot.lon.toFixed(5)}`}</Ltr>
              <Badge kind="REAL" size="sm" label={lang === "ar" ? "رادار NISAR" : "NISAR radar"} />
            </p>
            <p>
              {t("circleNote", {
                pm: pm(s.nearest_pipe.position_accuracy_m, "m", lang),
                d: withUnit(s.nearest_pipe.distance_m, "m", lang, 0),
              })}
            </p>
            <p className="faint">
              {t("pipeHighlighted", { desc: "" })}
              {(() => {
                // size + material from the pipe record (or the spot file's label), in the crew's language
                const d = describePipe(s.spot, s.nearest_pipe.feature as never);
                const size = inchText(d.inch, lang);
                return size ? `${size} · ${materialName(d, lang)}` : <Ltr>{s.nearest_pipe.label}</Ltr>;
              })()}
              {s.nearest_pipe.feature ? (
                <>
                  {" · "}
                  <Ltr mono>{s.nearest_pipe.feature.pipe_id}</Ltr>
                </>
              ) : null}
            </p>
            {pipesError || !s.nearest_pipe.feature ? <p className="crew-warn">{t("pipesMissing")}</p> : null}
          </div>
          <Button variant="primary" size="lg" block href={googleMapsUrl(s.spot.lat, s.spot.lon)} target="_blank" className="crew-maps-btn">
            {t("openMaps")}
          </Button>
        </>
      ) : spot.error ? (
        <EmptyState compact error={spot.error} onRetry={spot.reload} />
      ) : null}

      <section className="crew-card" aria-label={t("orderTitle")}>
        <div className="crew-card-head">
          <h2>{t("orderTitle")}</h2>
          {o ? o.source === "recorded" ? <Badge kind="RECORDED" size="sm" /> : <Tag tone="blue">{tw("liveRun")}</Tag> : null}
          {o?.edited ? <Tag tone="warn">{o.original ? tw("editedTag") : tw("preparedTag")}</Tag> : null}
        </div>
        {order.loading ? (
          <Spinner />
        ) : o ? (
          <>
            {o.edited ? <p className="faint">{o.edited[lang]}</p> : null}
            <dl className="crew-order" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
              {SECTION_KEYS.map((k) => (
                <div key={k} className="crew-order-row">
                  <dt>
                    {o.labels[k][lang]}
                    {k === "loss" ? (
                      <>
                        {" "}
                        <Badge kind="ASSUMED" size="sm" />
                      </>
                    ) : null}
                  </dt>
                  <dd>{o.sections[lang][k]}</dd>
                </div>
              ))}
            </dl>
            <details className="crew-other">
              <summary>{t("otherLang")}</summary>
              <dl className="crew-order" lang={other} dir={other === "ar" ? "rtl" : "ltr"}>
                {SECTION_KEYS.map((k) => (
                  <div key={k} className="crew-order-row">
                    <dt>{o.labels[k][other]}</dt>
                    <dd>{o.sections[other][k]}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        ) : order.error ? (
          <EmptyState compact title={t("noOrder")} error={order.error} />
        ) : null}
      </section>

      <section className="crew-card" aria-label={t("checklist")}>
        <h2>{t("checklist")}</h2>
        <ul className="crew-checks">
          {CHECKS.map((c) => (
            <li key={c}>
              <label className={`crew-check${report.checks[c] ? " is-on" : ""}`}>
                <input type="checkbox" checked={!!report.checks[c]} onChange={(e) => update({ checks: { ...report.checks, [c]: e.target.checked } })} />
                <span>{t(`c_${c}`)}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="crew-card" aria-label={t("reportTitle")}>
        <h2>{t("reportTitle")}</h2>
        {report.result && report.saved_at ? (
          <div className="crew-saved" role="status">
            <p className="crew-saved-main">
              ✓{" "}
              {t("saved", {
                time: new Date(report.saved_at).toLocaleTimeString(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }),
                result: t(report.result === "leak" ? "res_leak" : "res_no_leak"),
              })}
            </p>
            {report.note ? <p className="crew-saved-note">“{report.note}”</p> : null}
            <p className="faint">{t("savedDemo")}</p>
            <Button variant="secondary" onClick={() => update({ result: null, saved_at: null })}>
              {t("change")}
            </Button>
          </div>
        ) : (
          <>
            <textarea
              className="crew-note"
              rows={3}
              placeholder={t("notePh")}
              aria-label={t("notePh")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => update({ note })}
            />
            <div className="crew-result">
              <Button size="lg" block className="crew-btn-leak" onClick={() => save("leak")}>
                {t("leak")}
              </Button>
              <Button size="lg" block className="crew-btn-noleak" onClick={() => save("no_leak")}>
                {t("noLeak")}
              </Button>
            </div>
          </>
        )}
      </section>

      <footer className="crew-foot">
        <div className="badge-row">
          <Badge kind="REAL" size="sm" label={lang === "ar" ? "الرادار والأنابيب" : "radar, pipes"} />
          <Badge kind="ASSUMED" size="sm" label={lang === "ar" ? "حجم التسرّب" : "leak size"} />
        </div>
        <a href={href(`/workorder/${id}`)}>{t("workorderLink")}</a>
      </footer>
    </div>
  );
}
