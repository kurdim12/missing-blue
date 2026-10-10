// Screen "triage" (#/triage): Claude checks every wet spot with tools over data/ and decides dispatch / reject.
// Live when the server has ANTHROPIC_API_KEY; otherwise (or on any error) the server streams the recorded run,
// shown with a RECORDED badge. Tool results are always computed from data/ by the server.
import { useEffect, useMemo } from "react";
import type { ScreenProps } from "../screens";
import { getJson, useApi } from "../api";
import { fmt, pm, useI18n, useT, withUnit } from "../i18n";
import { Badge, Button, EmptyState, Ltr, Page, PageHeader, Panel, Spinner, Tag } from "../ui";
import { triageStrings } from "../features/triage/strings";
import { ToolLog } from "../features/triage/ToolLog";
import { DecisionCard } from "../features/triage/DecisionCard";
import { useTriageStream, type TriageDecision, type TriageInfo } from "../features/triage/useTriageStream";
import "../features/triage/triage.css";

const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const order = (d: TriageDecision) => (d.verdict === "dispatch" ? PRIO_RANK[d.priority ?? "low"] ?? 3 : 10);

export default function Triage({ embedded, query }: ScreenProps) {
  const { lang, t: bi } = useI18n();
  const t = useT(triageStrings);
  const info = useApi(() => getJson<TriageInfo>("/api/triage"), []);
  const { state, run, stop } = useTriageStream();
  const running = state.phase === "running";
  const radius = info.data?.rules.dispatch_radius_m ?? null;

  // Demo mode (embedded) or #/triage?run=1 starts the run on arrival
  const autorun = Boolean(embedded) || query.get("run") === "1";
  useEffect(() => {
    if (autorun) void run("auto");
  }, [autorun, run]);

  const decisions = useMemo(() => [...(state.final?.decisions ?? [])].sort((a, b) => order(a) - order(b)), [state.final]);
  const nDispatch = decisions.filter((d) => d.verdict === "dispatch").length;
  const nReject = decisions.filter((d) => d.verdict === "reject").length;
  const summary = state.final ? (lang === "ar" && state.final.summary_ar ? state.final.summary_ar : state.final.summary) : null;
  const recorded = state.source === "recorded";
  const live = state.source === "live";

  const actions = (
    <>
      <Button variant="primary" size="lg" onClick={() => run("auto")} disabled={running}>
        {state.phase === "idle" ? t("run") : t("runAgain")}
      </Button>
      {running ? (
        <Button variant="ghost" onClick={stop}>
          {t("stop")}
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => run("recorded")}>
          {t("replay")}
        </Button>
      )}
    </>
  );

  return (
    <Page wide>
      {embedded ? (
        <div className="triage-embedded-actions">{actions}</div>
      ) : (
        <PageHeader
          kicker={t("kicker")}
          title={t("title")}
          lead={t("lead")}
          badges={
            <>
              <Badge kind="REAL" label={t("badgeRadar")} />
              <Badge kind="REAL" label={t("badgePipes")} />
              <Badge kind="REAL" label={t("badgeLand")} />
              <Badge kind="ASSUMED" label={t("badgeTwin")} />
              {recorded ? <Badge kind="RECORDED" label={t("badgeRecorded")} /> : null}
            </>
          }
          actions={actions}
        />
      )}

      {/* run status: live or recorded, and why */}
      <div className="triage-status" role="status">
        {running ? <Spinner /> : null}
        {live ? (
          <>
            <Tag tone="violet" title={t("liveTip")}>
              {t("liveTag")}
            </Tag>
            <Ltr mono>{state.model}</Ltr>
            {running ? (
              <span className="muted">
                {t("running")}
                {state.turn ? ` · ${t("turn", { n: fmt(state.turn, 0) })}` : ""}
              </span>
            ) : null}
          </>
        ) : recorded ? (
          <>
            <Badge kind="RECORDED" label={state.recorded?.label} />
            {running ? <span className="muted">{t("replaying")}</span> : null}
            {state.why ? <span className="muted">{t("recordedWhy", { why: bi(state.why) })}</span> : null}
            <span className="faint">{t("recordedNote")}</span>
          </>
        ) : running ? null : info.data ? (
          <span className="muted">
            {info.data.live ? (
              <>
                {t("liveReady")} <Ltr mono>{info.data.model}</Ltr>
              </>
            ) : (
              t("noKey")
            )}
          </span>
        ) : null}
        {state.phase === "error" && state.error ? <Tag tone="danger">{bi(state.error)}</Tag> : null}
      </div>

      <div className="triage-layout">
        <Panel
            className="triage-area-log"
            title={t("logTitle")}
            subtitle={t("logSub")}
            badges={recorded ? <Badge kind="RECORDED" size="sm" /> : <Badge kind="REAL" size="sm" label="data/" />}
          >
            <ToolLog calls={state.calls} running={running} radius={radius} />
          </Panel>

          <Panel title={t("rulesTitle")} tone="raised" className="triage-area-rules">
            {info.loading ? <Spinner /> : null}
            {info.error ? <EmptyState error={info.error} onRetry={info.reload} compact /> : null}
            {info.data ? (
              <>
                <ol className="triage-rule-list">
                  <li>{t("rule1", { d: withUnit(info.data.rules.dispatch_radius_m, "m", lang) })}</li>
                  <li>{t("rule2")}</li>
                  <li>{t("rule3", { acc: pm(info.data.rules.position_accuracy_m, "m", lang) })}</li>
                  <li>
                    {t("rule4")}{" "}
                    <bdi dir="ltr" className="triage-rain">
                      {info.data.rules.rain_check ?? "–"}
                    </bdi>
                  </li>
                  <li>{t("rule5")}</li>
                  <li>{t("rule6")}</li>
                </ol>
                <p className="triage-tools">
                  <span className="muted">{t("tools")}:</span>{" "}
                  {info.data.tools.map((name) => (
                    <code key={name} dir="ltr">
                      {name}
                    </code>
                  ))}
                </p>
              </>
            ) : null}
          </Panel>

          <Panel
            className="triage-area-out"
            title={t("outTitle")}
            subtitle={t("outSub")}
            tone="accent"
            badges={state.final ? recorded ? <Badge kind="RECORDED" size="sm" /> : <Tag tone="violet">{t("liveTag")}</Tag> : null}
          >
            {!state.final ? (
              running ? (
                <div className="triage-out-wait">
                  <Spinner />
                  <p className="muted">{t("outEmpty")}</p>
                </div>
              ) : (
                <EmptyState body={t("outEmpty")} compact />
              )
            ) : (
              <>
                <div className="triage-counts">
                  <div className="triage-count triage-count-dispatch">
                    <span className="num">{fmt(nDispatch, 0)}</span> {t("nDispatch")}
                  </div>
                  <div className="triage-count">
                    <span className="num">{fmt(nReject, 0)}</span> {t("nReject")}
                  </div>
                </div>
                {summary ? (
                  <p className="triage-summary">
                    <span className="triage-summary-k">{t("summary")}:</span> {summary}
                  </p>
                ) : null}
                {state.final.missing_ids.length ? <Tag tone="warn">{t("missing", { list: state.final.missing_ids.join(", ") })}</Tag> : null}
                <div className="triage-cards">
                  {decisions.map((d) => (
                    <DecisionCard key={d.id} d={d} radius={radius} />
                  ))}
                </div>
                {recorded && lang === "ar" ? <p className="faint triage-foot">{t("arTranslated")}</p> : null}
                <p className="triage-usage">
                  <span className="muted">{t("usage")}:</span>{" "}
                  {state.usage?.live ? (
                    <>
                      {t("usageLive", {
                        in: fmt(state.usage.input_tokens, 0),
                        out: fmt(state.usage.output_tokens, 0),
                        cr: fmt(state.usage.cache_read_input_tokens, 0),
                        cw: fmt(state.usage.cache_creation_input_tokens, 0),
                        req: fmt(state.usage.requests, 0),
                      })}{" "}
                      <Ltr mono>{state.usage.model}</Ltr>
                    </>
                  ) : state.usage ? (
                    t("usageRecorded")
                  ) : (
                    "–"
                  )}
                </p>
              </>
            )}
          </Panel>
      </div>
    </Page>
  );
}
