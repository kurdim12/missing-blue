// Crew map: pin at the spot centre, the ±50 m search circle (position accuracy from the spot file),
// nearby pipes and the nearest pipe highlighted (pipe file; absent in a fresh clone -> the pin and circle still draw).
import maplibregl from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { api, useApi, type ApiError } from "../../api";
import { BaseMap, useGeoJson, useMap } from "../../map/BaseMap";
import { COLORS, pipeLayers } from "../../map/style";
import { boundsAround, circlePolygon } from "../../map/geo";
import type { LngLat } from "../../types";

export function CrewMap({
  lat,
  lon,
  radiusM,
  pipe,
  onPipesError,
  pinLabel,
}: {
  lat: number;
  lon: number;
  radiusM: number;
  pipe: LngLat[] | null;
  onPipesError?: (e: ApiError | null) => void;
  pinLabel: string;
}) {
  const view = useMemo(() => boundsAround([[lon, lat]], radiusM * 2.2), [lat, lon, radiusM]);
  return (
    <div className="crew-map">
      <BaseMap bounds={view} padding={8} maxZoom={19} attribution="NISAR: NASA/ISRO (ASF DAAC) · Karak pipes: AJI Group (ArcGIS)">
        <NearbyPipes lat={lat} lon={lon} onError={onPipesError} />
        <SearchCircle lat={lat} lon={lon} radiusM={radiusM} />
        <HighlightPipe coords={pipe} />
        <Pin lat={lat} lon={lon} label={pinLabel} />
      </BaseMap>
    </div>
  );
}

function NearbyPipes({ lat, lon, onError }: { lat: number; lon: number; onError?: (e: ApiError | null) => void }) {
  const bbox = useMemo(() => boundsAround([[lon, lat]], 400), [lat, lon]);
  const { data, error } = useApi(() => api.pipes(bbox), [bbox.join(",")]);
  useEffect(() => onError?.(error), [error, onError]);
  // nearby pipes as context (dimmed), on a dark casing so they read on the satellite photo
  const layer = useMemo(() => pipeLayers("crew-pipes", 0.7), []);
  useGeoJson("crew-pipes", data, layer);
  return null;
}

function SearchCircle({ lat, lon, radiusM }: { lat: number; lon: number; radiusM: number }) {
  const data = useMemo(() => ({ type: "FeatureCollection", features: [circlePolygon(lon, lat, radiusM)] }), [lat, lon, radiusM]);
  useGeoJson("crew-circle", data, [
    { id: "crew-circle-fill", type: "fill", paint: { "fill-color": COLORS.uncertainty } },
    // solid dark casing under the dashed edge: the search circle reads on the bright photo in daylight
    { id: "crew-circle-casing", type: "line", paint: { "line-color": COLORS.casingStrong, "line-width": 5 } },
    { id: "crew-circle-line", type: "line", paint: { "line-color": COLORS.uncertaintyLine, "line-width": 2.5, "line-dasharray": [2, 1.5] } },
  ]);
  return null;
}

function HighlightPipe({ coords }: { coords: LngLat[] | null }) {
  const data = useMemo(
    () => (coords && coords.length > 1 ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } : null),
    [coords],
  );
  useGeoJson("crew-pipe-hl", data, [
    { id: "crew-pipe-hl-glow", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.spot, "line-width": 12, "line-opacity": 0.55 } },
    // dark edge between the blue glow and the white core, so the core does not melt into bright ground
    { id: "crew-pipe-hl-casing", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COLORS.casingStrong, "line-width": 6.5 } },
    { id: "crew-pipe-hl-core", type: "line", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 3.5 } },
  ]);
  return null;
}

function Pin({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const el = document.createElement("div");
    el.className = "crew-pin";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
    const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);
    return () => {
      m.remove();
    };
  }, [map, lat, lon, label]);
  return null;
}
