// "Next step: a pilot in Karak" card. Shared by the Impact screen and the last demo step.
import { Fragment } from "react";
import { useI18n, useT } from "../../i18n";
import { Badge, Ltr, Panel } from "../../ui";
import type { StoryFacts } from "./facts";
import { nextStrings } from "./strings";

export function SpotIds({ facts }: { facts: StoryFacts }) {
  const { lang } = useI18n();
  const ids = facts.dispatch.map((s) => s.spot_id);
  if (!ids.length) return <>–</>;
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 ? (lang === "ar" ? " و" : i === ids.length - 1 ? " and " : ", ") : null}
          <Ltr>{id}</Ltr>
        </Fragment>
      ))}
    </>
  );
}

export function NextStep({ facts, big, thanks }: { facts: StoryFacts; big?: boolean; thanks?: boolean }) {
  const t = useT(nextStrings);
  const [s2a, s2b] = t("s2").split("{ids}");
  return (
    <Panel tone="accent" className={`story-next${big ? " story-next-big" : ""}`} title={t("title")} badges={<Badge kind="PLAN" />}>
      <ol className="story-next-list">
        <li>{t("s1")}</li>
        <li>
          {s2a}
          <SpotIds facts={facts} />
          {s2b}
        </li>
        <li>{t("s3")}</li>
      </ol>
      {thanks ? <p className="story-next-thanks">{t("thanks")}</p> : null}
    </Panel>
  );
}
