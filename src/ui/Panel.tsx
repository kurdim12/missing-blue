// Card / section container: <Panel title="..." badges={<Badge kind="REAL" />} actions={<Button />}>...</Panel>
import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  badges,
  actions,
  children,
  className = "",
  tone = "default",
  as: Tag = "section",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "default" | "raised" | "accent" | "warn";
  as?: "section" | "div" | "article" | "aside";
}) {
  const head = title || subtitle || badges || actions;
  return (
    <Tag className={`panel panel-${tone} ${className}`}>
      {head ? (
        <header className="panel-head">
          <div className="panel-titles">
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
          </div>
          {badges ? <div className="panel-badges">{badges}</div> : null}
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}
