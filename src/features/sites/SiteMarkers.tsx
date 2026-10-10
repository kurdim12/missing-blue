// W1–W7 markers for the Map & sites screen. Same look as the overview markers, and the same rule for close pairs
// (W1 / W2 and W5 / W6 are 150–480 m apart): the western one of a close pair gets its label on the left of its dot, so
// neither label sits under the other spot's dot. The dot stays on the real spot position; only the label moves.
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { useMap } from "../../map/BaseMap";
import type { SpotFeature } from "../../types";
import { labelSides } from "../overview/layers";

export function SiteMarkers({
  spots,
  selected,
  onSelect,
  status,
}: {
  spots: SpotFeature[];
  selected: string | null;
  onSelect: (id: string) => void;
  status: (id: string) => "dispatch" | "reject" | "pending";
}) {
  const map = useMap();
  const { t } = useI18n();
  const els = useRef(new Map<string, HTMLElement>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    const sides = labelSides(spots);
    els.current.clear();
    for (const f of spots) {
      const id = f.properties.spot_id;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `ov-marker sm-marker${sides.get(id) === "left" ? " ov-label-left" : ""}`;
      el.dir = "ltr";
      el.setAttribute("aria-label", t({ en: `Wet spot ${id}`, ar: `البقعة الرطبة ${id}` }));
      const dot = document.createElement("span");
      dot.className = "ov-marker-dot";
      const label = document.createElement("span");
      label.className = "ov-marker-label";
      label.textContent = id;
      el.append(dot, label);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(id);
      });
      markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(f.geometry.coordinates).addTo(map));
      els.current.set(id, el);
    }
    return () => {
      for (const m of markers) m.remove();
      els.current.clear();
    };
  }, [map, spots, t]);

  useEffect(() => {
    for (const [id, el] of els.current) {
      el.classList.toggle("is-selected", id === selected);
      el.setAttribute("aria-pressed", String(id === selected));
      const st = statusRef.current(id);
      el.classList.toggle("sm-reject", st === "reject");
      el.classList.toggle("sm-dispatch", st === "dispatch");
    }
  });
  return null;
}
