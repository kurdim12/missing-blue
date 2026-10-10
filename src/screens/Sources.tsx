// Screen "sources" (#/sources): every dataset with link and licence (SOURCES.md), the assumptions (values loaded
// from data/), the known limits and the AI methods summary. Strings: src/features/story/strings.ts.
import type { ScreenProps } from "../screens";
import { screenById } from "../screens";
import { fmt, useI18n, useT, withUnit } from "../i18n";
import { Badge, EmptyState, Ltr, Page, PageHeader, Panel, Tag } from "../ui";
import { fill, storyVars, useStoryFacts } from "../features/story/facts";
import { DATASETS, RADAR_RULE, TWIN_SCENARIO_KEYS, leakOfScenario } from "../features/story/sources";
import { sourcesStrings } from "../features/story/strings";
import { rainSentence } from "../features/overview/spotText";
import "../features/story/story.css";

export default function Sources(_props: ScreenProps) {
  const { lang, t: tr } = useI18n();
  const t = useT(sourcesStrings);
  const facts = useStoryFacts();
  const v = storyVars(facts, lang);
  const def = screenById("sources")!;

  const tw = facts.twin;
  const res = facts.hf?.results ?? null;
  const rob = facts.hf?.robustness ?? null;
  const s9 = facts.hf?.scale9 ?? null;
  const pct = (n: number | undefined) => (n === undefined ? "–" : withUnit(n, "%", lang));
  const bits = (n: number | undefined) => (n === undefined ? "–" : withUnit(n, "bits", lang, 2));
  const last = <T,>(a: T[] | undefined) => (a && a.length ? a[a.length - 1] : undefined);

  const mvars: Record<string, string> = {
    ...v,
    test: res ? fmt(res.n_test, 0) : "–",
    bitsAi: bits(last(res?.curve_ig)?.info_bits),
    bitsRnd: bits(last(res?.curve_random)?.info_bits),
    conf: pct(rob?.nominal_test.accuracy_when_confident_pct),
    confS: pct(rob?.shifted_test.accuracy_when_confident_pct),
    k9: s9 ? fmt(s9.gaps.length, 0) : "–",
    states: s9 ? fmt(s9.n_states, 0) : "–",
  };

  // Dispatched spots that were never built-up land (W3: open rangeland)
  const notBuilt = facts.dispatch.filter((s) => ![s.landcover_2023, s.landcover_2024, s.landcover_2025].includes("Built area"));
  const svc = withUnit(leakOfScenario("svc1"), "L/s", lang);
  const mains = [...new Set(TWIN_SCENARIO_KEYS.filter((k) => k !== "svc1").map(leakOfScenario))]
    .map((n) => withUnit(n, "L/s", lang))
    .join(lang === "ar" ? " و" : " and ");
  const range = (a: number[]) => a.map((x) => fmt(x, 2)).join("–");

  return (
    <Page wide>
      <PageHeader
        kicker={tr(def.journey)}
        title={t("title")}
        lead={t("lead")}
        badges={
          <>
            <Badge kind="REAL" />
            <Badge kind="SIMULATED" />
            <Badge kind="ASSUMED" />
            <Badge kind="RECORDED" />
            <Badge kind="PLAN" />
          </>
        }
      />

      <Panel title={t("datasets")}>
        <div className="story-ds" role="table" aria-label={t("datasets")}>
          <div className="story-ds-row story-ds-head" role="row">
            <span role="columnheader">{t("colData")}</span>
            <span role="columnheader">{t("colUse")}</span>
            <span role="columnheader">{t("colLicence")}</span>
          </div>
          {DATASETS.map((d) => {
            const extra =
              d.id === "pipes" && facts.pipes
                ? `${fmt(facts.pipes.count, 0)} ${tr({ en: "pipes", ar: "أنبوبًا" })} · ${v.km}`
                : d.id === "nisar" && facts.passes.length
                  ? v.dates
                  : d.id === "rain" && facts.rainCheck
                    ? rainSentence(facts.rainCheck, lang)
                    : null;
            return (
              <div className="story-ds-row" role="row" key={d.id}>
                <div role="cell" className="story-ds-name">
                  <div className="story-ds-title">
                    {d.kind === "CONTEXT" ? (
                      <Tag tone="neutral" title={t("contextTip")}>
                        {t("context")}
                      </Tag>
                    ) : (
                      <Badge kind={d.kind} size="sm" />
                    )}
                    <b>{tr(d.name)}</b>
                  </div>
                  {extra ? (
                    <div className="faint story-ds-extra">
                      <bdi>{extra}</bdi>
                    </div>
                  ) : null}
                  <div className="story-ds-links">
                    {d.links.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" dir="ltr">
                        {l.label} ↗
                      </a>
                    ))}
                    {d.file ? (
                      <bdi dir="ltr" className="mono faint">
                        {d.file}
                      </bdi>
                    ) : null}
                  </div>
                </div>
                <div role="cell" className="muted">
                  {fill(tr(d.use), { acc: v.acc })}
                </div>
                <div role="cell">{tr(d.licence)}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title={t("assumptions")}>
          <ul className="story-items">
            {tw ? (
              <>
                <li>
                  <Badge kind="ASSUMED" size="sm" />
                  <span>{fill(t("aDemand"), { v: withUnit(tw.assumptions.demand_lps_per_km, "L/s", lang) })}</span>
                </li>
                <li>
                  <Badge kind="ASSUMED" size="sm" />
                  <span>{fill(t("aTank"), { v: withUnit(tw.assumptions.tank_above_highest_junction_m, "m", lang) })}</span>
                </li>
                <li>
                  <Badge kind="ASSUMED" size="sm" />
                  <span>
                    {fill(t("aHw"), {
                      v: Object.entries(tw.assumptions.hazen_williams_C)
                        .map(([k, c]) => `${k} ${fmt(c, 0)}`)
                        .join(", "),
                    })}
                  </span>
                </li>
              </>
            ) : facts.twinError ? (
              <li className="story-items-empty">
                <EmptyState compact error={facts.twinError} />
              </li>
            ) : null}
            <li>
              <Badge kind="ASSUMED" size="sm" />
              <span>{fill(t("aLeak"), { svc, mains })}</span>
            </li>
            {res ? (
              <li>
                <Badge kind="SIMULATED" size="sm" />
                <span>
                  {fill(t("aHfSim"), {
                    sims: fmt(res.n_scenarios, 0),
                    pn: withUnit(res.noise.pressure_m, "m", lang),
                    qn: withUnit(res.noise.inflow_pct, "%", lang),
                  })}
                </span>
              </li>
            ) : null}
            {rob ? (
              <li>
                <Badge kind="SIMULATED" size="sm" />
                <span>
                  {fill(t("aHfShift"), {
                    r: range(rob.shift.roughness_factor),
                    d: range(rob.shift.demand_multiplier),
                    t: withUnit(rob.shift.tank_m, "m", lang),
                    pn: withUnit(rob.shift.pressure_noise_m, "m", lang),
                    qn: withUnit(rob.shift.inflow_noise_pct, "%", lang),
                  })}
                </span>
              </li>
            ) : null}
            <li>
              <Badge kind="ASSUMED" size="sm" />
              <span>{t("aZone")}</span>
            </li>
            <li>
              <Badge kind="REAL" size="sm" />
              <span>
                {t("aRadar").split("{rule}")[0]}
                <bdi dir="ltr" className="mono">
                  {RADAR_RULE}
                </bdi>
                {t("aRadar").split("{rule}")[1] ?? ""}
              </span>
            </li>
          </ul>
          {facts.hfError ? <EmptyState compact error={facts.hfError} /> : null}
        </Panel>

        <Panel title={t("limits")}>
          <ul className="story-items story-items-plain">
            <li>{t("l1")}</li>
            <li>{fill(t("l2"), v)}</li>
            <li>{t("l3")}</li>
            <li>{t("l4")}</li>
            <li>{t("l5")}</li>
            <li>{t("l6")}</li>
            {notBuilt.map((s) => (
              <li key={s.spot_id}>
                {t("l7").split("{w3}")[0]}
                <Ltr>{s.spot_id}</Ltr>
                {t("l7").split("{w3}")[1]}
              </li>
            ))}
            <li>{t("l8")}</li>
          </ul>
        </Panel>
      </div>

      <Panel title={t("ai")} badges={<Badge kind="SIMULATED" size="sm" label={tr({ en: "pressure readings", ar: "قراءات الضغط" })} />}>
        {facts.hf && !res && facts.hf.results_missing ? (
          <EmptyState
            compact
            body={
              <>
                {t("hfMissing")} {facts.hf.results_missing.message?.[lang] ?? ""}
              </>
            }
          />
        ) : null}
        <div className="story-methods">
          {(
            [
              ["m1t", "m1"],
              ["m2t", "m2"],
              ["m3t", "m3"],
              ["m4t", "m4"],
              ["m5t", "m5"],
              ["m6t", "m6"],
            ] as const
          ).map(([h, b]) => (
            <div className="story-method" key={h}>
              <h3 className="story-method-h">{t(h)}</h3>
              <p className="muted">{fill(t(b), mvars)}</p>
            </div>
          ))}
          <div className="story-method">
            <h3 className="story-method-h">{tr({ en: "Stack", ar: "التقنيات" })}</h3>
            <p className="muted">
              <bdi dir="ltr">
                Python (NumPy, SciPy, scikit-learn, WNTR / EPANET 2.2, rasterio, shapely, pyproj, h5py) · TypeScript (React, MapLibre, Hono) · Claude API
              </bdi>
            </p>
          </div>
        </div>
        <p className="source-note">
          <bdi dir="ltr" className="mono">
            data/hydrofingerprint/hydrofingerprint_results.json · hydrofingerprint_robustness.json · hydrofingerprint_scale9.json
          </bdi>
        </p>
      </Panel>
    </Page>
  );
}
