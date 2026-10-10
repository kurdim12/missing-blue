import { useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";

export function Spinner({ label, inline }: { label?: string; inline?: boolean }) {
  const t = useT(shellStrings);
  return (
    <span className={`spinner${inline ? " spinner-inline" : ""}`} role="status">
      <span className="spinner-ring" aria-hidden="true" />
      <span className="spinner-label">{label ?? t("loading")}</span>
    </span>
  );
}
