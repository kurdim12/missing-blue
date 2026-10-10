// Screen "problem" (#/problem): the problem with its source, who is left out, who benefits, what Missing Blue does,
// and what is real. Demo mode passes ?focus=honesty for the 0:40–1:00 beat. Strings: src/features/story/strings.ts.
import { useEffect, useRef } from "react";
import type { ScreenProps } from "../screens";
import { screenById } from "../screens";
import { useI18n, useT, withUnit } from "../i18n";
import { href } from "../router";
import { Badge, Button, EmptyState, Page, PageHeader, Panel, Spinner, Stat } from "../ui";
import { CitedSource } from "../features/story/CitedSource";
import { pmText, useStoryFacts } from "../features/story/facts";
import { CITED } from "../features/story/sources";
import { problemStrings } from "../features/story/strings";
import "../features/story/story.css";

export default function Problem({ query, embedded }: ScreenProps) {
  const { lang, t: tr } = useI18n();
  const t = useT(problemStrings);
  const facts = useStoryFacts();
  const def = screenById("problem")!;
  const focus = query.get("focus");
  const honestyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus === "honesty") honestyRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  return (
    <Page>
      <PageHeader kicker={tr(def.journey)} title={t("title")} lead={t("lead")} />

      <section className="story-hero" aria-label={tr(CITED.nrw.who)}>
        <div className="story-hero-figure num">{withUnit(CITED.nrw.value, "%", lang)}</div>
        <div className="story-hero-body">
          <p className="story-hero-text">{t("nrwOf")}</p>
          <p className="muted">{t("target", { target: withUnit(CITED.nrwTarget.value, "%", lang), year: String(CITED.nrwTarget.year) })}</p>
          <CitedSource who={tr(CITED.nrw.who)} date={CITED.nrw.date} url={CITED.nrw.url} />
        </div>
      </section>

      <div className="grid-2">
        <Panel title={t("leftOutTitle")}>
          <div className="story-stack">
            <p>{t("leftOut1")}</p>
            <p className="story-strong">{t("leftOut2")}</p>
            <CitedSource who={tr(CITED.govAi.who)} url={CITED.govAi.url} />
          </div>
        </Panel>
        <Panel title={t("benefitsTitle")}>
          <ul className="story-list">
            <li>
              <b>{t("benefitOffice")}</b>
              <span className="muted">{t("benefitOfficeBody")}</span>
            </li>
            <li>
              <b>{t("benefitCrew")}</b>
              <span className="muted">{t("benefitCrewBody")}</span>
            </li>
            <li>
              <b>{t("benefitHomes")}</b>
              <span className="muted">{t("benefitHomesBody")}</span>
            </li>
          </ul>
        </Panel>
      </div>

      <div ref={honestyRef} className={`story-focusable${focus === "honesty" ? " is-focus" : ""}`}>
        <div className="grid-2">
          <Panel tone="raised" title={t("whatTitle")}>
            <p className="story-oneliner">{t("whatLine")}</p>
          </Panel>
          <Panel tone="raised" title={t("honestTitle")}>
            <div className="story-stack">
              <p>{t("honestLine")}</p>
              <ul className="story-prov">
                <li>
                  <Badge kind="REAL" />
                  <span>{t("realWhat")}</span>
                </li>
                <li>
                  <Badge kind="SIMULATED" />
                  <span>{t("simWhat")}</span>
                </li>
                <li>
                  <Badge kind="ASSUMED" />
                  <span>{t("assumedWhat")}</span>
                </li>
              </ul>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title={t("foundTitle")} badges={<Badge kind="REAL" size="sm" />}>
        {facts.spotsLoading ? (
          <Spinner />
        ) : facts.spotsError ? (
          <EmptyState compact error={facts.spotsError} />
        ) : (
          <div className="stat-grid">
            <Stat
              label={t("foundSpots")}
              value={String(facts.spots?.length ?? "–")}
              note={facts.accuracyM !== null ? `${tr({ en: "position", ar: "دقة الموقع" })} ${pmText(facts.accuracyM, lang)}` : undefined}
              source="data/wet_spots/wet_spots.geojson"
            />
            <Stat
              label={t("foundRain")}
              value={facts.rainMm === null ? "–" : withUnit(facts.rainMm, "mm", lang, 1)}
              note="ERA5 · Open-Meteo"
              source="data/wet_spots/wet_spots.geojson"
            />
            {facts.pipesError ? (
              <EmptyState compact error={facts.pipesError} />
            ) : (
              <Stat label={t("foundKm")} value={facts.pipes ? withUnit(facts.pipes.km_total, "km", lang, 0) : "–"} source="data/pipes/karak_pipes.geojson" />
            )}
          </div>
        )}
      </Panel>

      {!embedded ? (
        <div className="page-actions">
          <Button variant="primary" size="lg" href={href("/overview")}>
            {t("seeMap")}
          </Button>
          <Button size="lg" href={href("/demo")}>
            {t("startDemo")}
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
