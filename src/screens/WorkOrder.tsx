// Screen "workorder" (#/workorder/:id): printable bilingual work order (A4), written by Claude from a facts JSON
// built from data/ (numbers copied exactly and checked), QR code to the crew phone view, demo status list.
import { useState } from "react";
import type { ScreenProps } from "../screens";
import { api, ApiError, useApi } from "../api";
import { fmt, fmtDate, pm, useI18n, useT, withUnit, type Lang } from "../i18n";
import { href } from "../router";
import { Badge, Button, EmptyState, Ltr, Page, Panel, PageHeader, SourceNote, Spinner, Tag } from "../ui";
import { PRIORITY_TONE, SECTION_KEYS, woApi, type SectionKey, type WorkOrder as Order } from "../features/workorder/api";
import { crewStrings, woStrings } from "../features/workorder/strings";
import { QrCode, useCrewUrl } from "../features/workorder/QrCode";
import { landSummary, pipeClassLabel } from "../features/workorder/format";
import { pipeLabelText } from "../features/overview/spotText";
import { CHECKS, STATUSES, hasDemoReports, readCrewReport, resetDemoReports, useStatuses } from "../features/workorder/store";
import "../features/workorder/workorder.css";

export default function WorkOrder({ params, embedded }: ScreenProps) {
  const id = (params.id || "W7").toUpperCase();
  const { lang } = useI18n();
  const t = useT(woStrings);
  const order = useApi(() => woApi.order(id, lang, "latest"), [id]);
  const health = useApi(() => api.health(), []);
  const [live, setLive] = useState<{ busy: boolean; result: Order | null; error: ApiError | null }>({ busy: false, result: null, error: null });

  const shown = live.result ?? order.data;
  const claude = health.data?.claude ?? false;

  const writeLive = () => {
    setLive({ busy: true, result: null, error: null });
    woApi.order(id, lang, "live").then(
      (o) => setLive({ busy: false, result: o, error: null }),
      (e) => setLive({ busy: false, result: null, error: e instanceof ApiError ? e : new ApiError("http", 0, null, String(e)) }),
    );
  };

  const liveNote = live.busy ? (
    <Spinner inline label={t("writing")} />
  ) : live.result?.source === "live" ? (
    <span className="wo-note wo-note-ok">{t("liveDone", { n: live.result.check.numbers_checked })}</span>
  ) : live.result?.fallback_reason ? (
    <span className="wo-note">{t("liveFailed", { reason: live.result.fallback_reason })}</span>
  ) : !claude && health.data ? (
    <span className="wo-note">{t("liveOff")}</span>
  ) : null;

  return (
    <Page>
      {!embedded ? (
        <div className="no-print">
          <PageHeader
            kicker={t("kicker")}
            title={
              <>
                {t("docKind")} <Ltr mono>{shown?.order_id ?? `MB-KRK-${id.replace(/\D/g, "").padStart(4, "0")}`}</Ltr>
              </>
            }
            lead={t("lead")}
            actions={
              <>
                <Button variant="ghost" size="sm" href={href(`/spot/${id}`)}>
                  {t("backSpot")}
                </Button>
                <Button variant="secondary" onClick={() => window.print()} disabled={!shown}>
                  {t("print")}
                </Button>
                <Button variant="primary" onClick={writeLive} disabled={live.busy || !claude} title={!claude ? t("liveOff") : undefined}>
                  {t("writeLive")}
                </Button>
              </>
            }
          />
        </div>
      ) : null}
      {liveNote ? (
        <div className="wo-live no-print" role="status">
          {liveNote}
        </div>
      ) : null}
      {live.error ? <EmptyState compact error={live.error} /> : null}

      {order.loading && !shown ? (
        <Spinner label={t("loadingOrder")} />
      ) : shown ? (
        <Sheet order={shown} lang={lang} />
      ) : order.error ? (
        <EmptyState error={order.error} onRetry={order.error.kind === "network" ? order.reload : undefined} />
      ) : null}

      {!embedded ? <StatusList current={id} /> : null}
    </Page>
  );
}

// ------------------------------------------------------------------ the printable sheet

function Sheet({ order, lang }: { order: Order; lang: Lang }) {
  const t = useT(woStrings);
  const f = order.facts;
  const other: Lang = lang === "ar" ? "en" : "ar";
  const recorded = order.source === "recorded";
  return (
    <article className="wo-sheet" aria-label={`${t("docKind")} ${order.order_id}`}>
      <header className="wo-sheet-head">
        <div className="wo-sheet-id">
          <p className="wo-doc-kind">
            {t("docKind")}{" "}
            <span className="wo-doc-kind-other" lang={other} dir={other === "ar" ? "rtl" : "ltr"}>
              · {t("docKindOther")}
            </span>
          </p>
          <h2 className="wo-order-id">
            <Ltr mono>{order.order_id}</Ltr>
          </h2>
          <p className="wo-candidate">{t("candidate")}</p>
        </div>
        <div className="wo-sheet-tags">
          <div className="badge-row">
            <Tag tone={PRIORITY_TONE[order.priority]}>{t(`prio_${order.priority}`)}</Tag>
            {recorded ? <Badge kind="RECORDED" /> : <Tag tone="blue">{t("liveRun")}</Tag>}
            {order.edited ? <Tag tone="warn">{order.original ? t("editedTag") : t("preparedTag")}</Tag> : null}
          </div>
          <span className="wo-meta-line faint">
            {t("writtenBy")}: <Ltr>{order.by}</Ltr> · {t("writtenOn")}: {fmtDate(order.written_at, lang)}
          </span>
        </div>
      </header>

      {order.edited ? (
        <div className="wo-edited">
          <p>{order.edited[lang]}</p>
          {order.original ? (
            <details className="wo-original">
              <summary>{t("originalShow")}</summary>
              {(lang === "ar" ? (["ar", "en"] as const) : (["en", "ar"] as const)).map((l) => (
                <p key={l} className="wo-original-text" lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
                  {order.original![l]}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="wo-meta">
        <span>
          {t("spot")} <Ltr mono>{f.spot_id}</Ltr>
        </span>
        <span>
          {t("coords")} <Ltr mono>{`${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`}</Ltr>
        </span>
        <span>
          {t("searchCircle")} <Ltr>{pm(f.position_accuracy_m, "m", lang)}</Ltr>
        </span>
        {f.place ? <span>{f.place[lang]}</span> : null}
      </div>

      <section className="wo-sections" aria-label={t("sectionsTitle")}>
        {SECTION_KEYS.map((k) => (
          <div className="wo-sec" key={k}>
            <div className="wo-sec-head">
              <h3 className="wo-sec-title">{order.labels[k][lang]}</h3>
              <span className="wo-sec-other" lang={other} dir={other === "ar" ? "rtl" : "ltr"}>
                {order.labels[k][other]}
              </span>
              <SectionBadge k={k} order={order} />
            </div>
            <div className="wo-sec-body">
              {(lang === "ar" ? (["ar", "en"] as const) : (["en", "ar"] as const)).map((l) => (
                <p key={l} className={`wo-text wo-text-${l}`} lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
                  {order.sections[l][k]}
                </p>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="wo-foot">
        <Facts order={order} lang={lang} />
        <CrewQr spotId={f.spot_id} />
      </div>

      <div className="wo-sign">
        <span>{t("signCrew")}: ____________________</span>
        <span>
          {t("signResult")}: ☐ {t("res_leak")} &nbsp; ☐ {t("res_no_leak")}
        </span>
        <span>{t("signDate")}: ____________</span>
      </div>
    </article>
  );
}

function SectionBadge({ k, order }: { k: SectionKey; order: Order }) {
  const { t } = useI18n();
  if (k === "where" || k === "evidence") return <Badge kind="REAL" size="sm" label={t({ en: "NISAR radar", ar: "رادار NISAR" })} />;
  if (k === "pipe") return <Badge kind="REAL" size="sm" label={t({ en: "pipe network", ar: "شبكة الأنابيب" })} />;
  if (k === "why" && order.facts.twin) return <Badge kind="ASSUMED" size="sm" label={t({ en: "twin demand", ar: "الطلب في التوأم" })} />;
  if (k === "loss") return <Badge kind="ASSUMED" size="sm" label={t({ en: "leak size", ar: "حجم التسرّب" })} />;
  return null;
}

function Facts({ order, lang }: { order: Order; lang: Lang }) {
  const t = useT(woStrings);
  const tc = useT(crewStrings);
  const { t: tr } = useI18n();
  const f = order.facts;
  const land = landSummary(f.land_cover.by_year, lang);
  const passes = f.radar.later_passes.map((d) => fmtDate(d, lang)).join(lang === "ar" ? " و" : " and ");
  return (
    <section className="wo-facts" aria-label={t("factsTitle")}>
      <h3 className="wo-facts-title">{t("factsTitle")}</h3>
      <p className="faint wo-facts-sub">{t("factsSub")}</p>
      <dl className="wo-dl">
        <dt>{t("f_where")}</dt>
        <dd>
          <Ltr mono>{`${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`}</Ltr> · {pm(f.position_accuracy_m, "m", lang)}
          {f.place ? ` · ${f.place[lang]}` : ""}
        </dd>

        <dt>{t("f_pipe")}</dt>
        <dd>
          <span>
            {pipeLabelText(f.pipe.description, lang)} · {t("cadLayer")} <Ltr mono>{f.pipe.cad_layer}</Ltr>
          </span>
          <br />
          {f.pipe.pipe_id ? (
            <span>
              <Ltr mono>{f.pipe.pipe_id}</Ltr> ({pipeClassLabel(f.pipe.pipe_class, lang)})
            </span>
          ) : (
            <span className="faint">{t("pipeMissing")}</span>
          )}
          <br />
          <span>{t("distance", { d: withUnit(f.pipe.spot_centre_to_pipe_m, "m", lang, 0), pm: pm(f.position_accuracy_m, "m", lang) })}</span>{" "}
          <Badge kind="REAL" size="sm" label={tr({ en: "pipe network", ar: "شبكة الأنابيب" })} />
        </dd>

        <dt>{t("f_evidence")}</dt>
        <dd>
          {t("radarLine", {
            hh: `+${fmt(f.radar.hh_rise_db, 2)}`,
            hv: `+${fmt(f.radar.hv_rise_db, 2)}`,
            base: fmtDate(f.radar.baseline_pass, lang),
            later: passes,
          })}
          <br />
          {t("rainLine", { mm: f.rain.mm_between_passes === null ? "–" : withUnit(f.rain.mm_between_passes, "mm", lang, 1) })}
          <br />
          {t("landLine", { years: land.range, classes: land.text })}
          <br />
          {f.twin ? (
            <>
              {t("twinLine", {
                lps: withUnit(f.twin.leak_lps_assumed, "L/s", lang),
                thr: withUnit(f.twin.pressure_drop_threshold_m, "m", lang),
                n: fmt(f.twin.other_junctions_dropping_more, 0),
                total: fmt(f.twin.junctions_in_twin, 0),
              })}{" "}
              <Badge kind="ASSUMED" size="sm" label={tr({ en: "demand, tank level", ar: "الطلب ومنسوب الخزان" })} />
            </>
          ) : (
            <span className="faint">{t("twinNone")}</span>
          )}
        </dd>

        <dt>{t("f_check")}</dt>
        <dd>{CHECKS.map((c) => tc(`c_${c}`)).join(" · ")}</dd>

        <dt>{t("f_loss")}</dt>
        <dd>
          {t("lossLine", {
            lps: withUnit(f.estimated_loss.leak_lps_assumed, "L/s", lang),
            m3: withUnit(f.estimated_loss.m3_per_day, "m3/day", lang),
          })}{" "}
          <Badge kind="ASSUMED" size="sm" label={tr({ en: "leak size", ar: "حجم التسرّب" })} />
        </dd>
      </dl>
      <p className={`wo-check ${order.check.ok ? "is-ok" : "is-bad"}`}>
        {order.check.ok
          ? `✓ ${t("checkOk", { n: order.check.numbers_checked })}`
          : `! ${t("checkBad", { n: order.check.unmatched.length, list: order.check.unmatched.join(", ") })}${
              !f.twin && order.check.unmatched.some((u) => u.includes(".why")) ? ` ${t("twinHeld")}` : ""
            }`}
      </p>
      <SourceNote file="data/wet_spots/wet_spots.geojson">{t("sourceSpots")}</SourceNote>
    </section>
  );
}

function CrewQr({ spotId }: { spotId: string }) {
  const t = useT(woStrings);
  const q = useCrewUrl(spotId);
  return (
    <aside className="wo-qr" aria-label={t("qrTitle")}>
      <h3 className="wo-facts-title">{t("qrTitle")}</h3>
      <QrCode text={q.url} alt={`${t("qrTitle")}: ${q.url}`} />
      <p className="wo-qr-url">
        <bdi dir="ltr" className="mono">
          {q.url}
        </bdi>
      </p>
      <p className="wo-qr-help">{q.localOnly ? <span className="wo-warn">{t("qrLocalOnly")}</span> : t("qrHelp")}</p>
      {q.usesLan ? <p className="faint wo-qr-help">{t("qrLan")}</p> : null}
      {q.addresses.length > 1 ? (
        <label className="wo-qr-pick no-print">
          {t("qrAddress")}{" "}
          <select value={q.addr ?? ""} onChange={(e) => q.setAddr(e.target.value)} dir="ltr">
            {q.addresses.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button className="no-print" variant="secondary" size="sm" href={q.path}>
        {t("openCrew")}
      </Button>
    </aside>
  );
}

// ------------------------------------------------------------------ status list (localStorage, demo)

function StatusList({ current }: { current: string }) {
  const t = useT(woStrings);
  const { lang } = useI18n();
  const list = useApi(() => woApi.list(), []);
  const st = useStatuses();
  if (!list.data?.orders.length) return null;
  return (
    <Panel
      className="no-print wo-status"
      title={t("statusTitle")}
      subtitle={t("statusSub")}
      badges={<Tag tone="neutral">{t("demoTag")}</Tag>}
    >
      <div className="wo-table-wrap">
        <table className="wo-table">
          <thead>
            <tr>
              <th>{t("colOrder")}</th>
              <th>{t("colSpot")}</th>
              <th>{t("colPriority")}</th>
              <th>{t("colSource")}</th>
              <th>{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.orders.map((o) => {
              const rep = readCrewReport(o.spot_id);
              const s = st.get(o.spot_id);
              return (
                <tr key={o.spot_id} className={o.spot_id === current ? "is-current" : undefined}>
                  <td>
                    <a href={href(`/workorder/${o.spot_id}`)}>
                      <Ltr mono>{o.order_id}</Ltr>
                    </a>
                  </td>
                  <td>
                    <Ltr mono>{o.spot_id}</Ltr>
                  </td>
                  <td>
                    <Tag tone={PRIORITY_TONE[o.priority]}>{t(`prio_${o.priority}`)}</Tag>
                  </td>
                  <td>{o.source === "recorded" ? <Badge kind="RECORDED" size="sm" /> : <Tag tone="blue">{t("liveRun")}</Tag>}</td>
                  <td>
                    <div className="wo-seg" role="radiogroup" aria-label={`${t("colStatus")} ${o.order_id}`}>
                      {STATUSES.map((x) => (
                        <button
                          key={x}
                          type="button"
                          role="radio"
                          aria-checked={s === x}
                          className={`wo-seg-btn wo-seg-${x}${s === x ? " is-on" : ""}`}
                          onClick={() => st.set(o.spot_id, x)}
                        >
                          {t(`st_${x}`)}
                        </button>
                      ))}
                    </div>
                    {rep.saved_at && rep.result ? (
                      <p className="faint wo-rep">
                        {t("crewReport", {
                          result: t(rep.result === "leak" ? "res_leak" : "res_no_leak"),
                          time: new Date(rep.saved_at).toLocaleString(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }),
                        })}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasDemoReports() ? (
        <div>
          <Button size="sm" variant="secondary" onClick={resetDemoReports}>
            {t("resetReports")}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
