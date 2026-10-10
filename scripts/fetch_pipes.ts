// Download the Karak water network (layer 6 ONLY) from its owner's public ArcGIS FeatureServer into data/pipes/.
// Never layer 2 (that is the customers layer: personal data). The raw network is not committed to git.
// Source: ArcGIS Online item 7f8adf3ae966453f8cec976d9c35ef48 ("WaterNetwork_Muta Area_WFL1", AJI Group); no licence stated.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LAYER = "https://services1.arcgis.com/CrtKrltq2pK2sCKF/arcgis/rest/services/WaterNetwork_Muta_Area_WFL1/FeatureServer/6";
const PAGE = 1000;

type Feature = { type: "Feature"; geometry: { type: string; coordinates: number[][] | number[][][] } | null; properties: Record<string, unknown> };

const SIZES: Record<string, number> = { "3-4": 0.75, "1-2": 0.5, "1-1-2": 1.5, "1-1-4": 1.25 };
const MATERIALS: Record<string, string> = { GI: "galvanized_iron", ST: "steel", DI: "ductile_iron", DIA: "ductile_iron", PE: "polyethylene", BVC: "pvc", PVC: "pvc" };

function parseLayer(layer: string) {
  const m = /^([0-9-]+)\s*([A-Z]+)?$/.exec(layer.trim().toUpperCase());
  if (!m) return { diameter_in: null, material: null };
  const size = m[1];
  const inches = SIZES[size] ?? (/^\d+$/.test(size) ? Number(size) : null);
  const diameter_in = inches !== null && inches > 0 && inches <= 48 ? inches : null; // numeric CAD layers like 500 are not diameters
  return { diameter_in, material: m[2] ? MATERIALS[m[2]] ?? null : null };
}

function pipeClass(d: number | null) {
  if (d === null) return "unknown";
  if (d >= 8) return "trunk";
  if (d >= 4) return "main";
  if (d >= 1.5) return "distribution";
  return "service";
}

function lengthM(coords: number[][]) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1], [x2, y2] = coords[i];
    const k = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    m += Math.hypot((x2 - x1) * 111320 * k, (y2 - y1) * 111320);
  }
  return m;
}

async function main() {
  const all: Feature[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${LAYER}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${PAGE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ArcGIS answered HTTP ${res.status} at offset ${offset}`);
    const page = (await res.json()) as { features?: Feature[]; properties?: { exceededTransferLimit?: boolean } };
    const got = page.features ?? [];
    all.push(...got);
    console.log(`fetched ${all.length} records`);
    if (got.length < PAGE) break;
  }
  const features: Feature[] = [];
  let n = 0;
  for (const f of all) {
    if (!f.geometry || f.geometry.type !== "LineString") continue;
    const coords = f.geometry.coordinates as number[][];
    const layer = String(f.properties.Layer ?? f.properties.layer ?? "");
    const { diameter_in, material } = parseLayer(layer);
    n += 1;
    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        pipe_id: `KRK-${String(n).padStart(5, "0")}`,
        cad_layer: layer,
        diameter_in,
        diameter_mm: diameter_in === null ? null : Math.round(diameter_in * 25.4),
        material,
        class: pipeClass(diameter_in),
        length_m: Math.round(lengthM(coords) * 10) / 10,
        source_handle: f.properties.EntityHandle ?? f.properties.entityhandle ?? null,
      },
    });
  }
  const dir = join(process.cwd(), "data", "pipes");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "karak_pipes.geojson"), JSON.stringify({ type: "FeatureCollection", name: "karak_pipes", features }));
  console.log(`wrote ${features.length} pipes to data/pipes/karak_pipes.geojson (demo use only; do not redistribute)`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
