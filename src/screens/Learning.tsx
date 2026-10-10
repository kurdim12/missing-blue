// Screen "learning": ADAPTIVE LEARNING. A Bayesian logistic regression whose prior is the dispatch rule, updated by
// crew outcomes (server/learning.ts). Shows the ranking before/after, the weights prior vs posterior ± std, the demo
// labels and buttons to add one per spot. Every label here is a DEMO LABEL typed into this demo, not a field result.
import { useEffect, useState } from "react";
import type { ScreenProps } from "../screens";
import { useApi, type ApiError } from "../api";
import { useI18n } from "../i18n";
import { Badge, Button, EmptyState, Ltr, Page, PageHeader, Panel, Spinner } from "../ui";
import { learningApi, type LearningState, type LearningWeight, type Outcome } from "../features/learning/api";
import "../features/learning/learning.css";

const fmt = (v: number, d = 3) => v.toFixed(d);

export function DemoLabelBadge() {
  const { t } = useI18n();
  return (
    <span className="badge badge-plan badge-sm lrn-demo" title={t({ en: "Entered in this demo, not a real field result", ar: "أُدخلت في هذا العرض، وليست نتيجة ميدانية حقيقية" })}>
      <span className="badge-dot" aria-hidden="true" />
      <span className="badge-kind">{t({ en: "DEMO LABEL", ar: "تسمية تجريبية" })}</span>
    </span>
  );
}

function Arrow({ change }: { change: number }) {
  const { t } = useI18n();
  if (change === 0)
    return (
      <span className="lrn-move lrn-move-0" aria-label={t({ en: "no change", ar: "بلا تغيير" })}>
        =
      </span>
    );
  const up = change > 0;
  return (
    <span className={`lrn-move ${up ? "lrn-move-up" : "lrn-move-down"}`} aria-label={t(up ? { en: `up ${change}`, ar: `صعود ${change}` } : { en: `down ${-change}`, ar: `هبوط ${-change}` })}>
      {up ? "▲" : "▼"}
      <bdi dir="ltr">{Math.abs(change)}</bdi>
    </span>
  );
}

const AXIS = 4; // weight axis −4 … +4
const pct = (v: number) => ((Math.max(-AXIS, Math.min(AXIS, v)) + AXIS) / (2 * AXIS)) * 100;

function WeightRow({ w }: { w: LearningWeight }) {
  const { t } = useI18n();
  const lo = pct(w.posterior - w.std),
    hi = pct(w.posterior + w.std);
  const from = pct(Math.min(0, w.posterior)),
    to = pct(Math.max(0, w.posterior));
  return (
    <div className="lrn-w">
      <div className="lrn-w-name">
        <span>{t(w.label)}</span>
        <span className="lrn-w-nums" dir="ltr">
          {fmt(w.prior, 2)} → <b>{fmt(w.posterior, 2)}</b> ± {fmt(w.std, 2)}
        </span>
      </div>
      <div className="lrn-w-track" dir="ltr" aria-hidden="true">
        <span className="lrn-w-zero" />
        <span className={`lrn-w-bar ${w.posterior >= 0 ? "pos" : "neg"}`} style={{ left: `${from}%`, width: `${to - from}%` }} />
        <span className="lrn-w-err" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <span className="lrn-w-prior" style={{ left: `${pct(w.prior)}%` }} />
      </div>
    </div>
  );
}

const outcomeText = (o: Outcome) => (o === "leak" ? { en: "leak", ar: "تسرب" } : { en: "no leak", ar: "لا تسرب" });

export default function Learning({ embedded }: ScreenProps) {
  const { t, lang } = useI18n();
  const st = useApi(() => learningApi.state(), []);
  const [data, setData] = useState<LearningState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (st.data) setData(st.data);
  }, [st.data]);

  const add = async (id: string, outcome: Outcome) => {
    setBusy(`${id}:${outcome}`);
    setErr(null);
    try {
      const r = await learningApi.outcome(id, outcome);
      setData(r.state);
      setFlash(
        t({
          en: `${id}: ${outcomeText(outcome).en} (demo label). Dispatch score ${fmt(r.before.score)} → ${fmt(r.after.score)}, rank ${r.before.rank} → ${r.after.rank}.`,
          ar: `${id}: ${outcomeText(outcome).ar} (تسمية تجريبية). درجة الإرسال ${fmt(r.before.score)} ← ${fmt(r.after.score)}، الترتيب ${r.before.rank} ← ${r.after.rank}.`,
        }),
      );
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };
  const reset = async () => {
    setBusy("reset");
    setErr(null);
    try {
      const r = await learningApi.reset();
      setData(r.state);
      setFlash(t({ en: `Reset to the prior: ${r.cleared} demo label(s) cleared.`, ar: `أُعيد إلى المعرفة المسبقة: حُذفت ${r.cleared} تسمية تجريبية.` }));
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page wide>
      {!embedded && (
        <PageHeader
          kicker={t({ en: "Adaptive learning", ar: "التعلّم التكيّفي" })}
          title={t({ en: "The ranking learns from crew outcomes", ar: "الترتيب يتعلّم من نتائج الفرق" })}
          lead={t({
            en: "We start from today's dispatch rule (near a pipe and built-up: inspect; far and farmland: skip). Each crew report of “leak” or “no leak” nudges the weights, and the list of where to send a crew next is re-ranked. One label moves things a little; many labels move them more.",
            ar: "نبدأ من قاعدة الإرسال الحالية (قرب أنبوب ومنطقة مبنية: افحص؛ بعيد وأرض زراعية: تجاوز). كل تقرير فريق «تسرب» أو «لا تسرب» يحرّك الأوزان، ويُعاد ترتيب قائمة الأماكن التي يُرسل إليها الفريق تاليًا. تسمية واحدة تحرّك قليلًا؛ تسميات كثيرة تحرّك أكثر.",
          })}
          badges={
            <>
              {data && data.n_labels > 0 ? <DemoLabelBadge /> : <Badge kind="PLAN" label={t({ en: "prior only", ar: "المعرفة المسبقة فقط" })} />}
              <Badge kind="REAL" label={t({ en: "spot features from data", ar: "خصائص البقع من البيانات" })} />
            </>
          }
          actions={
            <Button variant="secondary" onClick={reset} disabled={!data || busy !== null || data.n_outcomes_logged === 0}>
              {t({ en: "Reset to the dispatch rule", ar: "إعادة إلى قاعدة الإرسال" })}
            </Button>
          }
        />
      )}
      {st.loading && !data ? <Spinner label={t({ en: "Loading the model…", ar: "جارٍ تحميل النموذج…" })} /> : null}
      {st.error && !data ? <EmptyState error={st.error} onRetry={st.reload} /> : null}
      {data ? (
        <div className="lrn">
          <p className="lrn-honest" role="note">
            <b>{t(data.score_name)}.</b> {t(data.model_note)}
          </p>
          {flash ? (
            <p className="lrn-flash" role="status">
              {flash}
            </p>
          ) : null}
          {err ? (
            <p className="lrn-err" role="alert">
              {err.text(lang)}
            </p>
          ) : null}

          <div className="lrn-grid">
            <Panel
              title={t({ en: "Where to send a crew: before and after", ar: "أين نرسل الفريق: قبل وبعد" })}
              subtitle={t({ en: "Prior rank (dispatch rule) → learned rank. Add a demo label per spot.", ar: "الترتيب المسبق (قاعدة الإرسال) ← الترتيب المتعلَّم. أضف تسمية تجريبية لكل بقعة." })}
              className="lrn-rank-panel"
            >
              <div className="lrn-table-wrap">
                <table className="lrn-table">
                  <thead>
                    <tr>
                      <th>{t({ en: "Spot", ar: "البقعة" })}</th>
                      <th>{t({ en: "Rank", ar: "الترتيب" })}</th>
                      <th>{t({ en: "Dispatch score", ar: "درجة الإرسال" })}</th>
                      <th>{t({ en: "Demo label", ar: "تسمية تجريبية" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.spots.map((s) => (
                      <tr key={s.id} className={s.label ? "lrn-labelled" : undefined}>
                        <td>
                          <a href={`#/spot/${s.id}`} className="lrn-spot">
                            <Ltr mono>{s.id}</Ltr>
                          </a>
                        </td>
                        <td className="lrn-num">
                          <span dir="ltr" className="lrn-pair">
                            <span className="lrn-faint">{s.prior_rank}</span> → <b>{s.rank}</b>
                          </span>
                          <Arrow change={s.change} />
                        </td>
                        <td className="lrn-num">
                          <span dir="ltr" className="lrn-pair">
                            <span className="lrn-faint">{fmt(s.prior_score)}</span> → <b>{fmt(s.score)}</b>
                          </span>
                          <span className="lrn-band" dir="ltr" title={t({ en: "score at ± one posterior std", ar: "الدرجة عند ± انحراف معياري لاحق واحد" })}>
                            [{fmt(s.band[0], 2)}–{fmt(s.band[1], 2)}]
                          </span>
                        </td>
                        <td>
                          <div className="lrn-acts">
                            {s.label ? <span className={`lrn-lab lrn-lab-${s.label}`}>{t(outcomeText(s.label))}</span> : null}
                            <Button
                              size="sm"
                              variant={s.label === "leak" ? "primary" : "secondary"}
                              disabled={busy !== null}
                              onClick={() => add(s.id, "leak")}
                              aria-label={t({ en: `Demo label: leak at ${s.id}`, ar: `تسمية تجريبية: تسرب عند ${s.id}` })}
                            >
                              {busy === `${s.id}:leak` ? "…" : t({ en: "Leak", ar: "تسرب" })}
                            </Button>
                            <Button
                              size="sm"
                              variant={s.label === "no_leak" ? "primary" : "secondary"}
                              disabled={busy !== null}
                              onClick={() => add(s.id, "no_leak")}
                              aria-label={t({ en: `Demo label: no leak at ${s.id}`, ar: `تسمية تجريبية: لا تسرب عند ${s.id}` })}
                            >
                              {busy === `${s.id}:no_leak` ? "…" : t({ en: "No leak", ar: "لا تسرب" })}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title={t({ en: "What the model weighs", ar: "ما يزنه النموذج" })} subtitle={t(data.prior_note)} className="lrn-w-panel">
              <div className="lrn-w-legend">
                <span>
                  <i className="lrn-key lrn-key-prior" /> {t({ en: "prior (dispatch rule)", ar: "المعرفة المسبقة (قاعدة الإرسال)" })}
                </span>
                <span>
                  <i className="lrn-key lrn-key-post" /> {t({ en: "learned weight", ar: "الوزن المتعلَّم" })}
                </span>
                <span>
                  <i className="lrn-key lrn-key-err" /> {t({ en: "± one std", ar: "± انحراف معياري" })}
                </span>
              </div>
              {data.weights.map((w) => (
                <WeightRow key={w.name} w={w} />
              ))}
              <p className="lrn-small" dir="ltr">
                {data.model} · iterations {data.fit.iterations}
              </p>
            </Panel>
          </div>

          <Panel
            title={t({ en: `Demo labels (${data.n_labels})`, ar: `التسميات التجريبية (${data.n_labels})` })}
            subtitle={t({
              en: "The latest label per spot counts. Labels also arrive from the crew phone (Leak found / No leak).",
              ar: "تُحتسب آخر تسمية لكل بقعة. تصل التسميات أيضًا من هاتف الفريق (وُجد تسرب / لا تسرب).",
            })}
            actions={
              <Button size="sm" variant="ghost" onClick={reset} disabled={busy !== null || data.n_outcomes_logged === 0}>
                {t({ en: "Reset", ar: "إعادة ضبط" })}
              </Button>
            }
          >
            {data.labels.length === 0 ? (
              <p className="lrn-small">{t({ en: "No label yet: the ranking is the dispatch rule.", ar: "لا توجد تسمية بعد: الترتيب هو قاعدة الإرسال." })}</p>
            ) : (
              <ul className="lrn-labels">
                {[...data.labels].reverse().map((l) => (
                  <li key={l.id}>
                    <DemoLabelBadge />
                    <Ltr mono>{l.spot_id}</Ltr>
                    <span className={`lrn-lab lrn-lab-${l.outcome}`}>{t(outcomeText(l.outcome))}</span>
                    {l.note ? <span className="lrn-note">{l.note}</span> : null}
                    <span className="lrn-ts" dir="ltr">
                      {l.ts.replace("T", " ").slice(0, 16)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="lrn-small" dir="ltr">
              {data.sources.spots} · {data.sources.outcomes}
            </p>
          </Panel>
        </div>
      ) : null}
    </Page>
  );
}
