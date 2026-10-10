// Screen "impact" (#/impact): Impact & business. Plain cards; every figure is loaded from data/ (via the API),
// computed from it, cited with a link, or labelled ASSUMED / PLAN. No prices. Strings: src/features/story/strings.ts.
import type { ScreenProps } from "../screens";
import { screenById } from "../screens";
import { getJson, useApi } from "../api";
import { fmt, fmtDate, unit, useI18n, useT, withUnit } from "../i18n";
import type { TriageInfo } from "../features/triage/useTriageStream";
import { href } from "../router";
import { Badge, Button, EmptyState, Page, PageHeader, Panel, SourceNote, Stat, Tag } from "../ui";
import { CitedSource } from "../features/story/CitedSource";
import { fill, storyVars, useStoryFacts } from "../features/story/facts";
import { NextStep } from "../features/story/NextStep";
import { CITED, DAYS_PER_YEAR, LITRES_PER_M3, SECONDS_PER_DAY } from "../features/story/sources";
import { impactStrings } from "../features/story/strings";
import { useTriageUsage } from "../features/story/usage";
import "../features/story/story.css";

export default function Impact(_props: ScreenProps) {
  const { lang, t: tr } = useI18n();
  const t = useT(impactStrings);
  const facts = useStoryFacts();
  const usage = useTriageUsage();
  const info = useApi(() => getJson<TriageInfo>("/api/triage"), []);
  const radiusM = info.data?.rules.dispatch_radius_m;
  // the dispatch radius is the triage rule served by the API (server/triage.ts), never typed here
  const v: Record<string, string> = { ...storyVars(facts, lang), d: typeof radiusM === "number" ? withUnit(radiusM, "m", lang, 0) : "–" };
  const def = screenById("impact")!;

  return (
    <Page>
      <PageHeader kicker={tr(def.journey)} title={t("title")} lead={t("lead")} />

      <div className="grid-3">
        <Panel title={t("dataTitle")} badges={<Badge kind="REAL" size="sm" label="NISAR" />}>
          <div className="story-stack">
            <Stat size="lg" label={tr({ en: "per pass, for the radar", ar: "لكل مرور، للرادار" })} value={t("dataValue")} />
            <p className="muted">{fill(t("dataNote"), v)}</p>
            <CitedSource who={tr(CITED.repeatDays.who)} url={CITED.repeatDays.url} />
            <CitedSource who={tr(CITED.nisarPublic.who)} date={CITED.nisarPublic.date} url={CITED.nisarPublic.url} />
          </div>
        </Panel>

        <Panel title={t("pipeTitle")} badges={<Badge kind="REAL" size="sm" />}>
          <div className="story-stack">
            <p className="story-figure-text">{t("pipeValue")}</p>
            {facts.pipesError ? (
              <EmptyState compact error={facts.pipesError} />
            ) : (
              <p className="muted">{fill(t("pipeNote"), { count: facts.pipes ? fmt(facts.pipes.count, 0) : "–", km: v.km })}</p>
            )}
            <SourceNote file="data/pipes/karak_pipes.geojson" href="https://www.arcgis.com/home/item.html?id=7f8adf3ae966453f8cec976d9c35ef48">
              ArcGIS item 7f8adf3a…
            </SourceNote>
          </div>
        </Panel>

        <Panel title={t("sensorsTitle")}>
          <div className="story-stack">
            <p className="story-figure-text">{t("sensorsValue")}</p>
            <p className="muted">{t("sensorsNote")}</p>
            <div>
              <Tag tone="warn">{tr({ en: "to confirm with the utility", ar: "يُؤكَّد مع شركة المياه" })}</Tag>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title={t("leakTitle")} badges={<Badge kind="ASSUMED" size="sm" label={tr({ en: "leak size", ar: "حجم التسرب" })} />}>
          <div className="story-stack">
            <div className="stat-grid">
              <Stat size="lg" label={`${v.leak} · ${t("leakPerDay")}`} value={fmt(facts.leakM3Day, 1)} unit={unit("m3/day", lang)} />
              <Stat size="lg" label={`${v.leak} · ${t("leakPerYear")}`} value={fmt(facts.leakM3Year, 0)} unit={unit("m3/year", lang)} />
            </div>
            <p className="muted story-math">
              {fill(t("leakMath"), {
                leak: v.leak,
                sec: fmt(SECONDS_PER_DAY, 0),
                lpm: fmt(LITRES_PER_M3, 0),
                dpy: fmt(DAYS_PER_YEAR, 0),
                perDay: v.perDay,
                perYear: v.perYear,
              })}
            </p>
            <p className="faint">{facts.leakFromTwin ? t("leakAssumed") : t("leakAssumedFallback")}</p>
            {facts.leakFromTwin ? <SourceNote file="data/twin/mazar_zone_results.json" /> : null}
          </div>
        </Panel>

        <Panel title={t("crewTitle")} badges={<Badge kind="REAL" size="sm" />}>
          <div className="story-stack">
            {facts.spotsError ? (
              <EmptyState compact error={facts.spotsError} />
            ) : (
              <div className="stat-grid">
                <Stat size="lg" label={t("crewSites")} value={v.nGo} note={facts.dispatch.length ? facts.dispatch.map((s) => s.spot_id).join(" · ") : undefined} source="data/wet_spots/wet_spots.geojson" />
                {facts.pipesError ? (
                  <EmptyState compact error={facts.pipesError} />
                ) : (
                  <Stat
                    size="lg"
                    label={t("crewInstead")}
                    value={facts.pipes ? fmt(facts.pipes.km_total, 0) : "–"}
                    unit={tr({ en: "km of pipe", ar: "كم من الأنابيب" })}
                    source="data/pipes/karak_pipes.geojson"
                  />
                )}
              </div>
            )}
            <p className="muted">{fill(t("crewNote"), v)}</p>
          </div>
        </Panel>
      </div>

      <Panel title={t("runTitle")} subtitle={t("noPrice")}>
        <div className="grid-2">
          <div className="story-run">
            <h3 className="story-run-h">{t("runLaptop")}</h3>
            <ul className="story-bullets">
              <li>{t("runLaptop1")}</li>
              <li>{t("runLaptop2")}</li>
              <li>{t("runLaptop3")}</li>
              <li>{t("runLaptop4")}</li>
              <li>{t("runLaptop5")}</li>
            </ul>
          </div>
          <div className="story-run">
            <h3 className="story-run-h">{t("runClaude")}</h3>
            <ul className="story-bullets">
              <li>{t("runClaude1")}</li>
              <li>{t("runClaude2")}</li>
            </ul>
            <div className="story-tokens" role="status">
              <div className="story-tokens-head">
                <span>{t("tokensLast")}</span>
                {usage?.source === "recorded" ? <Badge kind="RECORDED" size="sm" /> : null}
              </div>
              {usage?.noTokens ? (
                <div className="story-stack">
                  <p className="muted">
                    {t("tokensRecorded")}
                    {usage.at ? <> · {fmtDate(usage.at, lang)}</> : null}
                  </p>
                </div>
              ) : usage ? (
                <>
                  <div className="story-tokens-total">
                    <span className="num">{fmt(usage.total, 0)}</span> <span className="muted">{t("tokensTotal")}</span>
                  </div>
                  <div className="faint">
                    {t("tokensIn")} <span className="num">{fmt(usage.input_tokens, 0)}</span> · {t("tokensOut")}{" "}
                    <span className="num">{fmt(usage.output_tokens, 0)}</span>
                    {usage.model ? (
                      <>
                        {" · "}
                        <bdi dir="ltr" className="mono">
                          {usage.model}
                        </bdi>
                      </>
                    ) : null}
                    {usage.at ? <> · {fmtDate(usage.at, lang)}</> : null}
                  </div>
                </>
              ) : (
                <div className="story-stack">
                  <p className="muted">{t("tokensNone")}</p>
                  <div>
                    <Button size="sm" href={href("/triage")}>
                      {t("tokensOpen")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title={t("scaleTitle")}>
          <ul className="story-bullets">
            <li>{fill(t("scale1"), v)}</li>
            <li>{t("scale2")}</li>
            <li>{t("scale3")}</li>
          </ul>
        </Panel>
        <Panel title={t("payTitle")} badges={<Badge kind="PLAN" />}>
          <div className="story-stack">
            <ul className="story-bullets">
              <li>{t("pay1")}</li>
              <li>{t("pay2")}</li>
            </ul>
            <p className="story-strong">{t("payHonest")}</p>
          </div>
        </Panel>
      </div>

      <Panel title={t("benefitTitle")} actions={<Button size="sm" variant="ghost" href={href("/problem")}>{t("benefitLink")}</Button>}>
        <p className="muted">{t("benefitBody")}</p>
      </Panel>

      <NextStep facts={facts} />
    </Page>
  );
}
