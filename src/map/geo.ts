// Small geometry helpers (no extra dependencies).

/** Polygon ring approximating a circle of `radiusM` metres around [lon, lat] (for the ±50 m position circle). */
export function circlePolygon(lon: number, lat: number, radiusM: number, steps = 64) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110574;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lon + (radiusM * Math.cos(a)) / kx, lat + (radiusM * Math.sin(a)) / ky]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
}

/** Bounds [w, s, e, n] around points with a margin in metres. */
export function boundsAround(points: [number, number][], marginM = 0): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    w = Math.min(w, x);
    s = Math.min(s, y);
    e = Math.max(e, x);
    n = Math.max(n, y);
  }
  const lat = (s + n) / 2;
  const dx = marginM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = marginM / 110574;
  return [w - dx, s - dy, e + dx, n + dy];
}

/** Google Maps link for a point (crew + spot detail). */
export const googleMapsUrl = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
