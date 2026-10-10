// Empty / error / missing-data state. Pass an ApiError and it shows the honest bilingual reason and hint
// (e.g. "npm run fetch:pipes" or "held back: contains pipe coordinates").
// <EmptyState error={error} onRetry={reload} />   or   <EmptyState title="..." body="..." />
import type { ReactNode } from "react";
import type { ApiError } from "../api";
import { useI18n, useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";
import { Button } from "./Button";

export function EmptyState({
  title,
  body,
  error,
  onRetry,
  action,
  compact,
}: {
  title?: ReactNode;
  body?: ReactNode;
  error?: ApiError | null;
  onRetry?: () => void;
  action?: ReactNode;
  compact?: boolean;
}) {
  const { lang } = useI18n();
  const t = useT(shellStrings);
  const missing = error?.kind === "missing_data";
  const showRetry = Boolean(onRetry && error && !missing);
  return (
    <div
      className={`empty${compact ? " empty-compact" : ""}${error ? (missing ? " empty-missing" : " empty-error") : ""}`}
      role={error ? "status" : undefined}
    >
      {title ? <h3 className="empty-title">{title}</h3> : null}
      {body ? <p className="empty-body">{body}</p> : null}
      {error ? <p className="empty-body">{error.text(lang)}</p> : null}
      {error?.hint ? (
        <p className="empty-hint">
          <code dir="ltr">{error.hint}</code>
        </p>
      ) : null}
      {action || showRetry ? (
        <div className="empty-actions">
          {action}
          {showRetry ? <Button onClick={onRetry}>{t("retry")}</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
