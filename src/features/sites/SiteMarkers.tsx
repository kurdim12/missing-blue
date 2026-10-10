// W1–W7 markers for the Map & sites screen. Same look as the overview markers, but close pairs (W5 / W6 are about
// 150 m apart) get their labels pushed apart (the northern one on the left of its dot) so both stay readable. The dot stays on the
// real spot position; only the label moves.
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { useMap } from "../../map/BaseMap";
import type { SpotFeature } from "../../types";

const NEAR_DEG = 0.004; // ~400 m: labels of two spots this close would overlap at the whole-grid zoom

function labelSides(spots: SpotFeature[]): Map<string, "left" | "side"> {
  const out = new Map<string, "left" | "side">();
  const sorted = [...spots].sort((a, b) => a.properties.spot_id.localeCompare(b.properties.spot_id));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (out.has(a.properties.spot_id)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (out.has(b.properties.spot_id)) continue;
      const [ax, ay] = a.geometry.coordinates;
      const [bx, by] = b.geometry.coordinates;
      if (Math.abs(ax - bx) < NEAR_DEG && Math.abs(ay - by) < NEAR_DEG) {
        // the northern one gets its label on the left of the dot, the southern one keeps it on the right
        out.set(a.properties.spot_id, ay >= by ? "left" : "side");
        out.set(b.properties.spot_id, ay >= by ? "side" : "left");
        break;
      }
    }
    if (!out.has(a.properties.spot_id)) out.set(a.properties.spot_id, "side");
  }
  return out;
}

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
      el.className = `ov-marker sm-marker sm-label-${sides.get(id) ?? "side"}`;
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
