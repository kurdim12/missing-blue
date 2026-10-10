// HydroFingerprint map: real Karak pipes (context), the candidate logger sites (shaded by the AI's expected doubt removed),
// the loggers in place (numbered HTML markers, tap to remove) and the 5 gaps under test (ring coloured by verdict).
import maplibregl, { type Map as MlMap, type MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "../../api";
import { useI18n, useT } from "../../i18n";
import { BaseMap, useGeoJson, useMap } from "../../map/BaseMap";
import { boundsAround } from "../../map/geo";
import { COLORS, PIPE_CLASSES, pipeLineLayer } from "../../map/style";
import type { HfGap, HfLiveModel } from "../../types";
import { Badge } from "../../ui";
import type { Verdict } from "./engine";
import { GAP_LETTERS, hfStrings } from "./strings";

type Bounds = [number, number, number, number];

export type HfMapProps = {
  model: HfLiveModel;
  gaps: HfGap[] | null;
  S: number[];
  last: number | null;
  gains: Map<number, number>;
  bestBits: number;
  verdicts: Verdict[];
  onToggle: (f: number) => void;
  onMap?: (map: MlMap) => void;
};

const gapMid = (g: HfGap): [number, number] => [(g.a.lon + g.b.lon) / 2, (g.a.lat + g.b.lat) / 2];

export function useHfBounds(model: HfLiveModel, gaps: HfGap[] | null) {
  return useMemo(() => {
    const pts: [number, number][] = model.nodes.map((n) => [n.lon, n.lat]);
    if (gaps) pts.push(...gaps.map(gapMid));
    const all = boundsAround(pts, 250);
    const g = gaps && gaps.length ? boundsAround(gaps.map(gapMid), 350) : all;
    return { all, gaps: g };
  }, [model, gaps]);
}

export function HfMap({ model, gaps, S, last, gains, bestBits, verdicts, onToggle, onMap }: HfMapProps) {
  const t = useT(hfStrings);
  const { lang } = useI18n();
  const bounds = useHfBounds(model, gaps);
  const mapRef = useRef<MlMap | null>(null);
  const [legendOpen, setLegendOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 700));
  const pipes = useApi(() => api.pipes(bounds.all), [bounds.all.join(",")]);

  const fit = (b: Bounds) => mapRef.current?.fitBounds(b, { padding: 40, duration: 700 });

  return (
    <>
      <BaseMap
        bounds={bounds.all}
        attribution="Pipes: AJI Group ArcGIS item (no licence stated) · Gaps: Missing Blue gap finder"
        onReady={(m) => {
          mapRef.current = m;
          (window as unknown as { __hfMap?: MlMap }).__hfMap = m; // for console / browser checks
          onMap?.(m);
        }}
      >
        <PipesLayer data={pipes.data} />
        <Candidates model={model} S={S} gains={gains} bestBits={bestBits} onToggle={onToggle} />
        <GapMarks gaps={gaps} verdicts={verdicts} />
        <Loggers model={model} S={S} last={last} onToggle={onToggle} />
      </BaseMap>
      <details className="hf-legend" open={legendOpen} onToggle={(e) => setLegendOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{t("legend")}</summary>
        <ul className="hf-legend-list">
          <li>
            <span className="hf-key hf-key-gap" aria-hidden="true" />
            <span>{t("legendGap")}</span>
            <Badge kind="REAL" size="sm" />
          </li>
          <li>
            <span className="hf-key hf-key-base" aria-hidden="true" />
            <span>{t("legendBase")}</span>
          </li>
          <li>
            <span className="hf-key hf-key-added" aria-hidden="true" />
            <span>{t("legendAdded")}</span>
            <Badge kind="SIMULATED" size="sm" />
          </li>
          <li>
            <span className="hf-key hf-key-cand" aria-hidden="true" />
            <span>{t("legendCand")}</span>
          </li>
          <li>
            <span className="hf-key hf-key-pipe" aria-hidden="true" style={{ background: PIPE_CLASSES[2].color }} />
            <span>{t("legendPipes")}</span>
            {pipes.error ? <span className="hf-legend-warn">{t("pipesMissing")}</span> : <Badge kind="REAL" size="sm" />}
          </li>
        </ul>
        {pipes.error ? <p className="hf-legend-hint">{pipes.error.text(lang)}</p> : null}
        <div className="hf-legend-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fit(bounds.gaps)}>
            {t("zoomGaps")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fit(bounds.all)}>
            {t("zoomAll")}
          </button>
        </div>
      </details>
    </>
  );
}

function PipesLayer({ data }: { data: unknown }) {
  const base = pipeLineLayer("hf-pipes");
  useGeoJson("hf-pipes", data as object | null, [{ ...base, paint: { ...base.paint, "line-opacity": 0.5 } }], { beforeId: "hf-cand-dot" });
  return null;
}

function Candidates({
  model,
  S,
  gains,
  bestBits,
  onToggle,
}: {
  model: HfLiveModel;
  S: number[];
  gains: Map<number, number>;
  bestBits: number;
  onToggle: (f: number) => void;
}) {
  const map = useMap();
  const fc = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: model.nodes
        .map((n, i) => ({ n, f: i + 1 }))
        .filter(({ f }) => !S.includes(f))
        .map(({ n, f }) => {
          const g = gains.get(f) ?? 0;
          return {
            type: "Feature" as const,
            properties: { f, r: bestBits > 1e-9 ? Math.max(0, Math.min(1, g / bestBits)) : 0 },
            geometry: { type: "Point" as const, coordinates: [n.lon, n.lat] },
          };
        }),
    }),
    [model, S, gains, bestBits],
  );
  useGeoJson("hf-cand", fc, [
    {
      id: "hf-cand-dot",
      type: "circle",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, ["+", 2.2, ["*", 3, ["get", "r"]]], 16, ["+", 4, ["*", 5, ["get", "r"]]]],
        "circle-color": ["interpolate", ["linear"], ["get", "r"], 0, "#4f6670", 0.35, "#9fb4be", 1, "#ffffff"],
        "circle-opacity": ["interpolate", ["linear"], ["get", "r"], 0, 0.55, 1, 1],
        "circle-stroke-width": ["case", [">=", ["get", "r"], 0.999], 2, 0],
        "circle-stroke-color": COLORS.logger,
      },
    },
    { id: "hf-cand-hit", type: "circle", paint: { "circle-radius": 13, "circle-color": "#000", "circle-opacity": 0.01 } },
  ]);

  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  useEffect(() => {
    if (!map) return;
    const click = (e: MapLayerMouseEvent) => {
      const f = Number(e.features?.[0]?.properties?.f);
      if (Number.isFinite(f) && f > 0) toggleRef.current(f);
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leave = () => (map.getCanvas().style.cursor = "");
    map.on("click", "hf-cand-hit", click);
    map.on("mouseenter", "hf-cand-hit", enter);
    map.on("mouseleave", "hf-cand-hit", leave);
    return () => {
      map.off("click", "hf-cand-hit", click);
      map.off("mouseenter", "hf-cand-hit", enter);
      map.off("mouseleave", "hf-cand-hit", leave);
    };
  }, [map]);
  return null;
}

function GapMarks({ gaps, verdicts }: { gaps: HfGap[] | null; verdicts: Verdict[] }) {
  const map = useMap();
  const t = useT(hfStrings);
  useEffect(() => {
    if (!map || !gaps) return;
    const markers = gaps.map((g, i) => {
      const el = document.createElement("div");
      el.className = `hf-gapmark is-${verdicts[i] ?? "undecided"}`;
      el.setAttribute("aria-hidden", "true");
      el.title = `${t("gapName", { g: GAP_LETTERS[i] })} · ${g.id}`;
      const ring = document.createElement("span");
      ring.className = "hf-gapmark-ring";
      const lab = document.createElement("span");
      lab.className = "hf-gapmark-label";
      lab.textContent = GAP_LETTERS[i];
      el.append(ring, lab);
      return new maplibregl.Marker({ element: el }).setLngLat(gapMid(g)).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, gaps, verdicts, t]);
  return null;
}

function Loggers({ model, S, last, onToggle }: { model: HfLiveModel; S: number[]; last: number | null; onToggle: (f: number) => void }) {
  const map = useMap();
  const t = useT(hfStrings);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  useEffect(() => {
    if (!map) return;
    const markers = S.map((f, i) => {
      const n = model.nodes[f - 1];
      const el = document.createElement("button");
      el.type = "button";
      const isBase = model.base.includes(f);
      el.className = `hf-logger ${isBase ? "is-base" : "is-added"}${f === last ? " is-last" : ""}`;
      el.textContent = String(i + 1);
      el.title = t("loggerTip", { k: i + 1 });
      el.setAttribute("aria-label", t("loggerTip", { k: i + 1 }));
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleRef.current(f);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([n.lon, n.lat]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, model, S, last, t]);
  return null;
}
