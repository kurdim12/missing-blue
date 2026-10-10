// Legend section for the basemap under the data layers: on satellite it credits Esri World Imagery as REAL and says what it
// is not (its capture date varies and is not the radar date; it shows the ground, not leaks). On the dark map it credits OSM.
// Render it inside the Overview "Layers and legend" panel, e.g. after the radar section: <BasemapLegend />
import { useT } from "../../i18n";
import { Badge, SourceNote } from "../../ui";
import { useBasemapChoice } from "./basemapKind";
import { overviewStrings } from "./strings";

export function BasemapLegend() {
  const t = useT(overviewStrings);
  const kind = useBasemapChoice();
  return (
    <section className="ov-sec" aria-label={t("basemap")}>
      <div className="ov-sec-head">
        <h3>{t("basemap")}</h3>
        {kind === "satellite" ? <Badge kind="REAL" size="sm" label={t("imageryLabel")} /> : null}
      </div>
      {kind === "satellite" ? (
        <>
          <p className="ov-small">{t("imagery")}</p>
          <p className="faint ov-small">{t("imageryCaveat")}</p>
          <p className="faint ov-small">{t("imageryRefs")}</p>
          <SourceNote>
            <bdi dir="ltr">Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community · Labels © Esri</bdi>
          </SourceNote>
        </>
      ) : (
        <p className="faint ov-small">{t("osmBase")}</p>
      )}
    </section>
  );
}
