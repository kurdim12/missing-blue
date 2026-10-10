// Which background the data layers sit on, for layers that style themselves per basemap (the radar HH grey is lowered
// over the satellite photo so the photo still reads under it). Thin wrappers over the shared store in src/map/basemaps.ts.
import { useBasemap, useBasemapView, type BasemapKind } from "../../map/BaseMap";

export type { BasemapKind };

/**
 * Inside <BaseMap>: "satellite" while the satellite photo is actually drawn under the data, otherwise "map" (the dark map,
 * or the plain dark ground when offline / tiles fail, where the radar should keep its full strength).
 */
export function useBasemapKind(): BasemapKind {
  return useBasemapView().photo ? "satellite" : "map";
}

/** The user's basemap choice (works outside a map, e.g. in a legend panel). */
export const useBasemapChoice = useBasemap;
