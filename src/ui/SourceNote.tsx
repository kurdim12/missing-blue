// Small "Source: ..." line. File paths and URLs stay LTR inside Arabic.
// <SourceNote file="data/wet_spots/wet_spots.geojson">NISAR L2 GCOV (NASA/ISRO, ASF DAAC)</SourceNote>
import type { ReactNode } from "react";
import { useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";

export function SourceNote({ children, href, file }: { children?: ReactNode; href?: string; file?: string }) {
  const t = useT(shellStrings);
  return (
    <p className="source-note">
      <span className="source-note-k">{t("source")}:</span> {children}
      {file ? (
        <>
          {children ? " · " : null}
          <bdi className="mono" dir="ltr">
            {file}
          </bdi>
        </>
      ) : null}
      {href ? (
        <>
          {" "}
          <a href={href} target="_blank" rel="noopener noreferrer" dir="ltr">
            ↗
          </a>
        </>
      ) : null}
    </p>
  );
}
