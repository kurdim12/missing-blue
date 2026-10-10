// Standard padded page with a header (title, lead, badges). Use inside layout: "page" screens.
import type { ReactNode } from "react";

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`page${wide ? " page-wide" : ""}`}>{children}</div>;
}

export function PageHeader({
  title,
  lead,
  badges,
  actions,
  kicker,
}: {
  title: ReactNode;
  lead?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <header className="page-head">
      {kicker ? <p className="page-kicker">{kicker}</p> : null}
      <div className="page-head-row">
        <h1 className="page-title">{title}</h1>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {lead ? <p className="page-lead">{lead}</p> : null}
      {badges ? <div className="badge-row">{badges}</div> : null}
    </header>
  );
}

/** Keep a technical token LTR inside Arabic text: <Ltr>W7</Ltr>, <Ltr mono>KRK-00001</Ltr> */
export function Ltr({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <bdi dir="ltr" className={mono ? "mono" : undefined}>
      {children}
    </bdi>
  );
}
