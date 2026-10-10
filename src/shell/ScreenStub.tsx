// Placeholder used by screen files until their agent replaces them.
import { useI18n, useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";
import { screenById } from "../screens";
import { EmptyState, Page, PageHeader, Tag } from "../ui";

export function ScreenStub({ id }: { id: string }) {
  const { t: tr } = useI18n();
  const t = useT(shellStrings);
  const def = screenById(id);
  if (!def) return null;
  return (
    <Page>
      <PageHeader
        kicker={tr(def.journey)}
        title={tr(def.title)}
        badges={def.criteria.map((c) => (
          <Tag key={c} tone="blue">
            {c}
          </Tag>
        ))}
      />
      <EmptyState title={t("stubTitle")} body={t("stubBody")} />
    </Page>
  );
}
