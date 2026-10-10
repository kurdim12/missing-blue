// Screen "assistant": Ask Missing Blue. A chat with a Claude agent that answers from data/ through read-only tools
// (server/assistant.ts). Arabic/English, RTL aware, suggested questions, streaming answer with collapsible tool calls.
// Offline (no key / live error): the recorded live answer for a suggested question is replayed and tagged "Recorded run".
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ScreenProps } from "../screens";
import { getJson, useApi } from "../api";
import { useI18n, type Bi } from "../i18n";
import { Badge, Button, Page, PageHeader, Spinner } from "../ui";
import { askStream, type AssistantInfo, type AssistantSource, type HistoryItem, type Suggestion } from "../features/assistant/stream";
import "../features/assistant/assistant.css";

type ToolView = { i: number; name: string; input: unknown; result?: unknown; is_error?: boolean };
type Msg =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      source: AssistantSource | null;
      tools: ToolView[];
      phase: "thinking" | "streaming" | "done" | "error";
      why?: Bi;
      error?: Bi;
      checks?: { ok?: boolean; numbers?: { total: number; matched: number; unmatched: unknown[] } } | null;
      model?: string;
    };

/** Minimal inline formatting: paragraphs, "- " bullets and **bold**. Text only, never HTML. */
function Rich({ text }: { text: string }) {
  const inline = (s: string, k: number): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <b key={`${k}-${j}`}>{p.slice(2, -2)}</b> : p));
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((b) => b.trim())
        .map((block, k) => {
          const lines = block.split("\n");
          if (lines.every((l) => /^\s*[-•*]\s+/.test(l)))
            return (
              <ul key={k}>
                {lines.map((l, j) => (
                  <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""), j)}</li>
                ))}
              </ul>
            );
          return <p key={k}>{inline(block, k)}</p>;
        })}
    </>
  );
}

function ToolCall({ tool }: { tool: ToolView }) {
  const { t } = useI18n();
  const pending = tool.result === undefined;
  return (
    <details className={`asst-tool${tool.is_error ? " asst-tool-err" : ""}`}>
      <summary>
        <span className="asst-tool-dot" aria-hidden="true" data-pending={pending ? "1" : "0"} />
        <span className="asst-tool-label">{t({ en: "Tool", ar: "أداة" })}</span>
        <code dir="ltr">{tool.name}</code>
        <span className="asst-tool-state">
          {pending ? t({ en: "running…", ar: "قيد التشغيل…" }) : tool.is_error ? t({ en: "error", ar: "خطأ" }) : t({ en: "result from data/", ar: "نتيجة من data/" })}
        </span>
      </summary>
      <div className="asst-tool-body" dir="ltr">
        <div className="asst-tool-h">input</div>
        <pre>{JSON.stringify(tool.input, null, 2)}</pre>
        {!pending ? (
          <>
            <div className="asst-tool-h">result</div>
            <pre>{JSON.stringify(tool.result, null, 2).slice(0, 4000)}</pre>
          </>
        ) : null}
      </div>
    </details>
  );
}

function SourceTag({ source, model }: { source: AssistantSource | null; model?: string }) {
  const { t } = useI18n();
  if (source === "recorded") return <Badge kind="RECORDED" size="sm" />;
  if (source === "live")
    return (
      <span className="asst-live" title={model}>
        {t({ en: "Live", ar: "مباشر" })} · <bdi dir="ltr">{model ?? "Claude"}</bdi>
      </span>
    );
  if (source === "unavailable") return <span className="asst-unavail">{t({ en: "Live AI unavailable", ar: "الذكاء الاصطناعي المباشر غير متاح" })}</span>;
  return null;
}

export default function Assistant({ embedded }: ScreenProps) {
  const { t, lang } = useI18n();
  const info = useApi(() => getJson<AssistantInfo>("/api/assistant"), []);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs]);

  const patchLast = (fn: (m: Extract<Msg, { role: "assistant" }>) => Extract<Msg, { role: "assistant" }>) =>
    setMsgs((list) => {
      const last = list[list.length - 1];
      if (!last || last.role !== "assistant") return list;
      return [...list.slice(0, -1), fn(last)];
    });

  const ask = async (question: string, suggestion?: Suggestion) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: HistoryItem[] = msgs
      .filter((m) => (m.role === "user" ? true : m.phase === "done" && m.source === "live"))
      .map((m) => ({ role: m.role, content: m.text }));
    setMsgs((list) => [...list, { role: "user", text: q }, { role: "assistant", text: "", source: null, tools: [], phase: "thinking" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let draftTurn = 0;
    await askStream(
      { question: q, lang, suggestion_id: suggestion?.id, history },
      (ev, d) => {
        switch (ev) {
          case "start":
            patchLast((m) => ({ ...m, source: d.source, why: d.why, model: d.model ?? d.recorded?.model, tools: [], text: "", phase: "thinking" }));
            break;
          case "status":
            draftTurn = d.turn ?? draftTurn + 1;
            patchLast((m) => ({ ...m, text: "" }));
            break;
          case "tool_call":
            patchLast((m) => ({ ...m, tools: [...m.tools, { i: d.i, name: d.name, input: d.input }] }));
            break;
          case "tool_result":
            patchLast((m) => {
              const tools = [...m.tools];
              for (let k = tools.length - 1; k >= 0; k--)
                if (tools[k].i === d.i && tools[k].result === undefined) {
                  tools[k] = { ...tools[k], result: d.result, is_error: d.is_error };
                  break;
                }
              return { ...m, tools };
            });
            break;
          case "delta":
            patchLast((m) => ({ ...m, text: m.text + (d.text ?? ""), phase: "streaming" }));
            break;
          case "final":
            patchLast((m) => ({ ...m, source: d.source ?? m.source, text: d.answer ?? m.text, checks: d.checks, model: d.model ?? m.model, phase: "done" }));
            break;
          case "error":
            patchLast((m) => ({ ...m, error: d.message, phase: "error" }));
            break;
        }
      },
      ctrl.signal,
    );
    patchLast((m) => (m.phase === "done" || m.phase === "error" ? m : { ...m, phase: m.text ? "done" : "error", error: m.text ? undefined : { en: "No answer arrived.", ar: "لم تصل أي إجابة." } }));
    setBusy(false);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const match = info.data?.suggestions.find((s) => s.en === input.trim() || s.ar === input.trim());
    void ask(input, match);
  };

  const suggestions = info.data?.suggestions ?? [];
  const live = info.data?.live;

  return (
    <Page>
      {!embedded && (
        <PageHeader
          kicker={t({ en: "Ask Missing Blue", ar: "اسأل الأزرق المفقود" })}
          title={t({ en: "Ask a question about the wet spots, pipes and loggers", ar: "اسأل عن البقع الرطبة والأنابيب وأجهزة التسجيل" })}
          lead={t({
            en: "Claude answers only from the project data through read-only tools, copies every number from a tool result (each number is checked) and says so when the data does not hold the answer. Wet spots are candidates, never confirmed leaks.",
            ar: "يجيب Claude من بيانات المشروع فقط عبر أدوات للقراءة، وينسخ كل رقم من نتيجة أداة (ويُفحص كل رقم)، ويقول ذلك حين لا تحوي البيانات الإجابة. البقع الرطبة مرشّحة، وليست تسربات مؤكدة.",
          })}
          badges={
            <>
              {info.data ? (
                live ? (
                  <span className="asst-live">
                    {t({ en: "Live Claude", ar: "Claude مباشر" })} · <bdi dir="ltr">{info.data.model}</bdi>
                  </span>
                ) : (
                  <Badge kind="RECORDED" label={t({ en: "no key: recorded runs only", ar: "لا مفتاح: تشغيلات مسجّلة فقط" })} />
                )
              ) : null}
              <Badge kind="REAL" label={t({ en: "answers from data/", ar: "إجابات من data/" })} />
            </>
          }
        />
      )}

      <div className="asst">
        <div className="asst-log" aria-live="polite">
          {msgs.length === 0 ? (
            <div className="asst-empty">
              <p>{t({ en: "Pick a suggested question or type your own (Arabic or English).", ar: "اختر سؤالًا مقترحًا أو اكتب سؤالك (بالعربية أو الإنجليزية)." })}</p>
            </div>
          ) : null}
          {msgs.map((m, k) =>
            m.role === "user" ? (
              <div key={k} className="asst-msg asst-user" dir="auto">
                {m.text}
              </div>
            ) : (
              <div key={k} className="asst-msg asst-bot">
                <div className="asst-bot-head">
                  <span className="asst-who">{t({ en: "Missing Blue", ar: "الأزرق المفقود" })}</span>
                  <SourceTag source={m.source} model={m.model} />
                  {m.phase === "thinking" || m.phase === "streaming" ? <Spinner inline /> : null}
                </div>
                {m.source === "recorded" && m.why ? (
                  <p className="asst-why">
                    {t({ en: "Replaying a recorded live answer: ", ar: "إعادة تشغيل إجابة مباشرة مسجّلة: " })}
                    {t(m.why)} {t({ en: "Tool calls are re-run on data/ now.", ar: "تُعاد استدعاءات الأدوات على data/ الآن." })}
                  </p>
                ) : null}
                {m.tools.length ? (
                  <div className="asst-tools">
                    {m.tools.map((tool, j) => (
                      <ToolCall key={j} tool={tool} />
                    ))}
                  </div>
                ) : null}
                <div className="asst-text" dir="auto">
                  {m.text ? <Rich text={m.text} /> : m.phase === "thinking" ? <p className="asst-faint">{t({ en: "Reading the data…", ar: "جارٍ قراءة البيانات…" })}</p> : null}
                </div>
                {m.error ? (
                  <p className="asst-err" role="alert">
                    {t(m.error)}
                  </p>
                ) : null}
                {m.phase === "done" && m.checks?.numbers ? (
                  <p className="asst-checks">
                    {m.checks.numbers.unmatched.length === 0
                      ? t({
                          en: `Number check: ${m.checks.numbers.matched} of ${m.checks.numbers.total} numbers match a tool result.`,
                          ar: `فحص الأرقام: ${m.checks.numbers.matched} من ${m.checks.numbers.total} رقمًا تطابق نتيجة أداة.`,
                        })
                      : t({
                          en: `Number check: ${m.checks.numbers.unmatched.length} number(s) not found in a tool result.`,
                          ar: `فحص الأرقام: ${m.checks.numbers.unmatched.length} رقم/أرقام غير موجودة في نتيجة أداة.`,
                        })}
                  </p>
                ) : null}
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>

        {suggestions.length ? (
          <div className="asst-sugg" role="group" aria-label={t({ en: "Suggested questions", ar: "أسئلة مقترحة" })}>
            {suggestions.map((s) => (
              <button key={s.id} type="button" className="asst-chip" disabled={busy} onClick={() => ask(s[lang], s)} dir="auto">
                {s[lang]}
                {s.recorded?.[lang] ? <span className="asst-chip-rec">{t({ en: "recorded", ar: "مسجّل" })}</span> : null}
              </button>
            ))}
          </div>
        ) : info.error ? (
          <p className="asst-err">{info.error.text(lang)}</p>
        ) : null}

        <form className="asst-form" onSubmit={onSubmit}>
          <textarea
            value={input}
            dir="auto"
            rows={2}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder={t({ en: "Ask about a spot, a pipe or a logger…", ar: "اسأل عن بقعة أو أنبوب أو جهاز تسجيل…" })}
            aria-label={t({ en: "Your question", ar: "سؤالك" })}
          />
          {busy ? (
            <Button type="button" variant="secondary" onClick={() => abort.current?.abort()}>
              {t({ en: "Stop", ar: "إيقاف" })}
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!input.trim()}>
              {t({ en: "Ask", ar: "اسأل" })}
            </Button>
          )}
        </form>
        <p className="asst-foot">
          {t({
            en: "Answers are decision support, not a confirmed leak. Position accuracy is ±50 m. Every run is written to the audit log.",
            ar: "الإجابات دعم للقرار، وليست تسربًا مؤكدًا. دقة الموقع ±50 م. يُكتب كل تشغيل في سجل التدقيق.",
          })}
        </p>
      </div>
    </Page>
  );
}
