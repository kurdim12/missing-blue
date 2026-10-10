// Chip for verdicts and categories (Dispatch / Reject / Can't tell yet ...). Provenance uses <Badge>, not Tag.
import type { ReactNode } from "react";

export type TagTone = "neutral" | "blue" | "ok" | "warn" | "danger" | "violet";

export function Tag({ children, tone = "neutral", title }: { children: ReactNode; tone?: TagTone; title?: string }) {
  return (
    <span className={`tag tag-${tone}`} title={title}>
      {children}
    </span>
  );
}
