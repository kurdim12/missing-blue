// AI council: five Claude agents (three specialists in parallel -> skeptic -> dispatcher) over the radar wet spots.
// Live via POST /api/council {mode:"live"}; replay of a real recorded live run via {mode:"recorded"}.
import { useState } from "react";
import type { ScreenProps } from "../screens";
import { fmt, useI18n, type Bi } from "../i18n";
import { Badge, Button, EmptyState, Ltr, Page, PageHeader } from "../ui";
import { useCouncilInfo, useCouncilStream, type AgentId, type AgentState, type CouncilDecision, type PerSpot, type Usage } from "../features/council/useCouncilStream";
import "../features/council/council.css";

const TXT = {
  lead: {
    en: "Three specialists read the evidence in parallel, each with its own data tools; a skeptic argues against every dispatch; a dispatcher decides. Wet spots are inspection candidates, never confirmed leaks.",
    ar: "ثلاثة مختصين يقرؤون الأدلة بالتوازي، لكلٍّ أدواته الخاصة على البيانات؛ يعترض المشكّك على كل إيفاد؛ ثم يقرّر مسؤول الإيفاد. البقع الرطبة مرشّحة للفحص، وليست تسرّبات مؤكدة.",
  },
  live: { en: "Live", ar: "مباشر" },
  replay: { en: "Replay recorded", ar: "إعادة التشغيل المسجّل" },
  run: { en: "Run the council", ar: "شغّل المجلس" },
  stop: { en: "Stop", ar: "إيقاف" },
  running: { en: "Council in session…", ar: "المجلس منعقد…" },
  noKey: { en: "No API key on this machine: a live run falls back to the recorded run.", ar: "لا يوجد مفتاح API على هذا الجهاز: التشغيل المباشر يعود إلى التشغيل المسجّل." },
  phase1: { en: "Phase 1 · three specialists in parallel", ar: "المرحلة 1 · ثلاثة مختصين بالتوازي" },
  phase2: { en: "Phase 2 · red team", ar: "المرحلة 2 · الفريق الأحمر" },
  phase3: { en: "Phase 3 · decision", ar: "المرحلة 3 · القرار" },
  waiting: { en: "waiting", ar: "بانتظار دوره" },
  working: { en: "working", ar: "يعمل" },
  done: { en: "done", ar: "انتهى" },
  noTools: { en: "No tools: reads the reports", ar: "بلا أدوات: يقرأ التقارير" },
  tokens: { en: "tokens in / out", ar: "رموز دخل / خرج" },
  decisions: { en: "Decisions", ar: "القرارات" },
  dispatch: { en: "Dispatch a crew", ar: "إيفاد فريق" },
  reject: { en: "Reject", ar: "رفض" },
  priority: { en: "priority", ar: "الأولوية" },
  high: { en: "high", ar: "عالية" },
  medium: { en: "medium", ar: "متوسطة" },
  low: { en: "low", ar: "منخفضة" },
  skeptic: { en: "Skeptic's concern", ar: "اعتراض المشكّك" },
  resolved: { en: "How it is answered", ar: "كيف يُجاب عنه" },
  summary: { en: "Summary", ar: "الخلاصة" },
  dissent: { en: "Dissent that still stands", ar: "اعتراض ما زال قائمًا" },
  numbersOk: { en: "{m} of {n} numbers found in the tool results", ar: "{m} من {n} أرقام موجودة في نتائج الأدوات" },
  numbersBad: { en: "Numbers not found in the tool results: {list}", ar: "أرقام غير موجودة في نتائج الأدوات: {list}" },
  totalLive: { en: "Total for this live run", ar: "الإجمالي لهذا التشغيل المباشر" },
  noLiveTokens: { en: "Recorded run: no live tokens", ar: "تشغيل مسجّل: لا رموز مباشرة" },
  recordingUsed: { en: "the recording used {i} input + {o} output tokens, {s} s", ar: "استهلك التسجيل {i} رمز دخل + {o} رمز خرج، {s} ث" },
  liveUsed: { en: "{i} input + {o} output tokens · {r} requests · {s} s", ar: "{i} رمز دخل + {o} رمز خرج · {r} طلبات · {s} ث" },
  recordedOn: { en: "Recorded live run of", ar: "تشغيل مباشر مسجّل بتاريخ" },
  liveNote: { en: "A live run makes 5 or more Claude calls and takes about a minute (the recorded run took {s} s).", ar: "التشغيل المباشر يجري 5 استدعاءات أو أكثر لـ Claude ويستغرق نحو دقيقة (استغرق التشغيل المسجّل {s} ث)." },
  liveNoteNoRec: { en: "A live run makes 5 or more Claude calls and takes about a minute.", ar: "التشغيل المباشر يجري 5 استدعاءات أو أكثر لـ Claude ويستغرق نحو دقيقة." },
  fellBack: { en: "Live run unavailable, replaying the recorded run:", ar: "التشغيل المباشر غير متاح، يُعاد التشغيل المسجّل:" },
  idleTitle: { en: "The council has not met yet", ar: "لم ينعقد المجلس بعد" },
  idleBody: { en: "Choose Live or Replay recorded, then run the council.", ar: "اختر «مباشر» أو «إعادة التشغيل المسجّل» ثم شغّل المجلس." },
  inputs: { en: "inputs: NISAR radar, Karak pipe record, Sentinel-2 land cover, ERA5 rain", ar: "المدخلات: رادار NISAR، سجل أنابيب الكرك، غطاء الأرض Sentinel-2، أمطار ERA5" },
  recordedBadge: { en: "replay of a real live run", ar: "إعادة لتشغيل مباشر حقيقي" },
  liveBadge: { en: "Live · Claude", ar: "مباشر · Claude" },
  twin: { en: "twin leak sizes", ar: "أحجام التسرّب في التوأم" },
  candidates: { en: "Candidates the skeptic challenged", ar: "المرشّحون الذين اعترض عليهم المشكّك" },
  savedNote: { en: "Saved for the Sites page in this browser.", ar: "حُفظ لصفحة المواقع في هذا المتصفح." },
  sec: { en: "s", ar: "ث" },
  replayNote: { en: "On replay every tool call is re-run against data/; the agents' texts and tokens are the recording.", ar: "عند الإعادة تُنفَّذ كل أداة من جديد على data/؛ نصوص الوكلاء ورموزهم من التسجيل." },
} satisfies Record<string, Bi>;

const SIGNAL: Record<string, Bi> = {
  for_dispatch: { en: "for", ar: "مع" },
  against_dispatch: { en: "against", ar: "ضد" },
  neutral: { en: "neutral", ar: "محايد" },
  strong: { en: "strong", ar: "قوي" },
  moderate: { en: "moderate", ar: "متوسط" },
  weak: { en: "weak", ar: "ضعيف" },
};

function sub(s: string, vars: Record<string, string | number>) {
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}


/** Arabic text with Latin tokens (W7, dates, +2.72 dB, 3/4"): isolate each LTR run so it is not reordered. */
const LTR_RUN = /((?:[+−-]?[0-9A-Za-z][0-9A-Za-z.\/:"'±-]*)(?:[ ,]+(?:dB|mm|m|L\/s|HH|HV|km|[0-9][0-9.:-]*)(?![\p{L}]))*)/u;
function Bidi({ text }: { text: string }) {
  const { lang } = useI18n();
  if (lang !== "ar" || !text) return <>{text}</>;
  const parts = text.split(new RegExp(LTR_RUN.source, "gu"));
  return (
    <>
      {parts.map((x, i) =>
        i % 2 ? (
          <bdi key={i} dir="ltr">
            {x}
          </bdi>
        ) : (
          x
        ),
      )}
    </>
  );
}

const secs = (ms: number | null | undefined) => (ms == null ? "–" : fmt(ms / 1000, 1, 1));
const tok = (u: Usage | null | undefined) => (u ? `${fmt(u.input_tokens, 0)} / ${fmt(u.output_tokens, 0)}` : "– / –");
const rank = (d: CouncilDecision) => (d.verdict === "dispatch" ? ({ high: 0, medium: 1, low: 2 } as Record<string, number>)[d.priority ?? "low"] ?? 2 : 5);

export default function Council(_props: ScreenProps) {
  const { t, lang } = useI18n();
  const info = useCouncilInfo();
  const { state, run, stop } = useCouncilStream();
  const [mode, setMode] = useState<"live" | "recorded">("recorded");
  const running = state.phase === "running";
  const rec = state.recorded ?? info?.recorded ?? null;
  const recDate = rec?.recorded_at ? rec.recorded_at.slice(0, 10) : null;
  const L = (en: string, ar?: string | null) => (lang === "ar" && ar ? ar : en);
  const started = state.phase !== "idle";
  const u = state.usage;

  return (
    <Page wide>
      <div className="council">
        <PageHeader
          kicker={<bdi>AI council · مجلس الذكاء الاصطناعي</bdi>}
          title={lang === "ar" ? "مجلس الذكاء الاصطناعي" : "AI council"}
          lead={t(TXT.lead)}
          badges={
            <>
              <Badge kind="REAL" label={t(TXT.inputs)} />
              <Badge kind="ASSUMED" label={t(TXT.twin)} size="sm" />
              {state.source === "recorded" ? <Badge kind="RECORDED" label={t(TXT.recordedBadge)} /> : null}
              {state.source === "live" ? <span className="cn-live-pill">{t(TXT.liveBadge)}</span> : null}
            </>
          }
        />

        <section className="cn-controls">
          <div className="cn-seg" role="radiogroup" aria-label={`${t(TXT.live)} / ${t(TXT.replay)}`}>
            <button type="button" role="radio" aria-checked={mode === "live"} className={mode === "live" ? "on" : ""} onClick={() => setMode("live")} disabled={running}>
              {t(TXT.live)}
            </button>
            <button type="button" role="radio" aria-checked={mode === "recorded"} className={mode === "recorded" ? "on" : ""} onClick={() => setMode("recorded")} disabled={running}>
              {t(TXT.replay)}
            </button>
          </div>
          {running ? (
            <Button onClick={stop}>{t(TXT.stop)}</Button>
          ) : (
            <Button variant="primary" onClick={() => run(mode)}>
              {t(TXT.run)}
            </Button>
          )}
          <p className="cn-note">
            {mode === "recorded" ? (
              recDate ? (
                <>
                  <Badge kind="RECORDED" size="sm" /> {t(TXT.recordedOn)} <Ltr mono>{recDate}</Ltr> · <Ltr mono>{rec?.model}</Ltr>
                  <br />
                  <span className="cn-faint">{t(TXT.replayNote)}</span>
                </>
              ) : null
            ) : (
              <>
                {rec?.wall_ms ? sub(t(TXT.liveNote), { s: secs(rec.wall_ms) }) : t(TXT.liveNoteNoRec)}
                {info && !info.live ? <> {t(TXT.noKey)}</> : null}
              </>
            )}
          </p>
        </section>

        {state.why && state.source === "recorded" && mode === "live" ? (
          <p className="cn-why" role="status">
            {t(TXT.fellBack)} {t(state.why)}
          </p>
        ) : null}
        {state.phase === "error" && state.error ? (
          <p className="cn-why cn-err" role="alert">
            {t(state.error)}
          </p>
        ) : null}

        {!started ? (
          <EmptyState title={t(TXT.idleTitle)} body={t(TXT.idleBody)} />
        ) : (
          <>
            <section className="cn-trace" aria-live="polite">
              <div className="cn-phase-label">{t(TXT.phase1)}</div>
              <div className="cn-row cn-row-3">
                {(["radar", "network", "landuse"] as AgentId[]).map((id) => (
                  <AgentCard key={id} a={state.agents[id]} />
                ))}
              </div>
              <div className="cn-arrow" aria-hidden="true">
                ↓
              </div>
              <div className="cn-phase-label">{t(TXT.phase2)}</div>
              <AgentCard a={state.agents.skeptic} />
              <div className="cn-arrow" aria-hidden="true">
                ↓
              </div>
              <div className="cn-phase-label">{t(TXT.phase3)}</div>
              <AgentCard a={state.agents.dispatcher} />
              {running && !state.final ? (
                <p className="cn-running">
                  <span className="cn-dot cn-dot-running" aria-hidden="true" /> {t(TXT.running)}
                </p>
              ) : null}
            </section>

            {state.final ? (
              <section className="cn-final">
                <h2 className="cn-h2">{t(TXT.decisions)}</h2>
                {state.final.candidates.length ? (
                  <p className="cn-cands">
                    {t(TXT.candidates)}:{" "}
                    {state.final.candidates.map((c, i) => (
                      <span key={c}>
                        {i ? ", " : ""}
                        <Ltr mono>{c}</Ltr>
                      </span>
                    ))}
                  </p>
                ) : null}
                <div className="cn-decisions">
                  {[...state.final.decisions]
                    .sort((a, b) => rank(a) - rank(b))
                    .map((d) => (
                      <DecisionCard key={d.id} d={d} />
                    ))}
                </div>
                <div className="cn-sumgrid">
                  <div className="cn-sum">
                    <h3>{t(TXT.summary)}</h3>
                    <p><Bidi text={L(state.final.summary, state.final.summary_ar)} /></p>
                  </div>
                  <div className="cn-sum cn-dissent">
                    <h3>{t(TXT.dissent)}</h3>
                    <p><Bidi text={L(state.final.dissent, state.final.dissent_ar)} /></p>
                  </div>
                </div>
              </section>
            ) : null}

            {u ? (
              <section className="cn-usage">
                {u.live ? (
                  <p>
                    <strong>{t(TXT.totalLive)}:</strong>{" "}
                    <bdi dir="ltr">
                      {sub(t(TXT.liveUsed), { i: fmt(u.total.input_tokens, 0), o: fmt(u.total.output_tokens, 0), r: u.total.requests ?? "–", s: secs(u.wall_ms) })}
                    </bdi>{" "}
                    · <Ltr mono>{u.model}</Ltr>
                  </p>
                ) : (
                  <p>
                    <Badge kind="RECORDED" size="sm" /> <strong>{t(TXT.noLiveTokens)}</strong>
                    {u.total ? (
                      <span className="cn-faint">
                        {" "}
                        · {sub(t(TXT.recordingUsed), { i: fmt(u.total.input_tokens, 0), o: fmt(u.total.output_tokens, 0), s: secs(u.wall_ms) })}
                      </span>
                    ) : null}
                  </p>
                )}
                {state.phase === "done" ? <p className="cn-faint">{t(TXT.savedNote)}</p> : null}
              </section>
            ) : null}
          </>
        )}
      </div>
    </Page>
  );
}

function AgentCard({ a }: { a: AgentState }) {
  const { t, lang } = useI18n();
  const L = (en?: string, ar?: string) => (lang === "ar" && ar ? ar : en ?? "");
  const status = a.status === "done" ? TXT.done : a.status === "running" ? TXT.working : TXT.waiting;
  const toolless = a.agent === "skeptic" || a.agent === "dispatcher";
  return (
    <article className={`cn-agent cn-st-${a.status}`}>
      <header className="cn-agent-head">
        <span className={`cn-dot cn-dot-${a.status}`} aria-hidden="true" />
        <h3>{t(a.role)}</h3>
        <span className="cn-status">{t(status)}</span>
      </header>
      {toolless ? (
        <p className="cn-faint cn-small">{t(TXT.noTools)}</p>
      ) : (
        <ul className="cn-tools">
          {a.tools.map((c, i) => (
            <li key={i} className={c.is_error ? "cn-tool-err" : ""}>
              <code dir="ltr">
                {c.name}({c.input?.spot_id ? String(c.input.spot_id) : ""})
              </code>
              {c.summary ? (
                <span className="cn-tool-sum">
                  <Bidi text={t(c.summary)} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {a.report ? (
        <div className="cn-report">
          <p>
            <Bidi text={L(a.report.text, a.report.text_ar)} />
          </p>
          {a.report.per_spot.length ? (
            <div className="cn-chips">
              {a.report.per_spot.map((p) => (
                <SpotChip key={p.id} p={p} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <footer className="cn-agent-foot">
        <span>
          <bdi dir="ltr" className="mono">
            {tok(a.usage)}
          </bdi>{" "}
          {t(TXT.tokens)}
        </span>
        <span>
          <bdi dir="ltr" className="mono">
            {secs(a.ms)}
          </bdi>{" "}
          {t(TXT.sec)}
        </span>
      </footer>
    </article>
  );
}

function SpotChip({ p }: { p: PerSpot }) {
  const { t, lang } = useI18n();
  const key = p.verdict ? (p.verdict === "dispatch" ? "for_dispatch" : "against_dispatch") : p.signal ?? p.strength ?? "neutral";
  const word = p.verdict ? t(p.verdict === "dispatch" ? TXT.dispatch : TXT.reject) : SIGNAL[key] ? t(SIGNAL[key]) : key;
  const tip = lang === "ar" ? p.finding_ar ?? p.concern_ar ?? p.reason_ar : p.finding ?? p.concern ?? p.reason;
  return (
    <span className={`cn-chip cn-chip-${key}`} title={tip ?? undefined}>
      <bdi dir="ltr" className="mono">
        {p.id}
      </bdi>{" "}
      {word}
    </span>
  );
}

function DecisionCard({ d }: { d: CouncilDecision }) {
  const { t, lang } = useI18n();
  const L = (en: string, ar: string) => (lang === "ar" && ar ? ar : en);
  const n = d.checks?.numbers;
  return (
    <article className={`cn-dec cn-dec-${d.verdict}`}>
      <header className="cn-dec-head">
        <bdi dir="ltr" className="mono cn-dec-id">
          {d.id}
        </bdi>
        <span className={`cn-verdict cn-verdict-${d.verdict}`}>{t(d.verdict === "dispatch" ? TXT.dispatch : TXT.reject)}</span>
        {d.priority ? (
          <span className={`cn-prio cn-prio-${d.priority}`}>
            {t(TXT.priority)}: {t(TXT[d.priority])}
          </span>
        ) : null}
      </header>
      <p className="cn-dec-reason">
        <Bidi text={L(d.reason, d.reason_ar)} />
      </p>
      <dl className="cn-dec-dl">
        <dt>{t(TXT.skeptic)}</dt>
        <dd>
          <Bidi text={L(d.skeptic_concern, d.skeptic_concern_ar)} />
        </dd>
        <dt>{t(TXT.resolved)}</dt>
        <dd>
          <Bidi text={L(d.resolved_by, d.resolved_by_ar)} />
        </dd>
      </dl>
      {n ? (
        <p className={`cn-check${n.unmatched.length ? " cn-check-bad" : ""}`}>
          {n.unmatched.length ? sub(t(TXT.numbersBad), { list: n.unmatched.join("; ") }) : sub(t(TXT.numbersOk), { m: n.matched, n: n.total })}
        </p>
      ) : null}
    </article>
  );
}
