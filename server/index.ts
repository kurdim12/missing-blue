// Missing Blue API (Hono on Node). Serves data/ through typed JSON routes, the radar PNGs and the built app.
// Run: npx tsx server/index.ts   (env: PORT default 8787, DIST default "dist")
// Never serves data/ as raw files: pipes go through /api/pipes, the customers layer is never loaded.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FILES,
  MissingDataError,
  ROOT,
  TWIN_SCENARIOS,
  findSpot,
  has,
  loadSpots,
  loadTwin,
  nearestPipe,
  pipesInBbox,
  pipesSummary,
  readData,
  tryReadData,
  type TwinScenario,
} from "./data";
// ---- AI route mount points (owned by screen agents; the stubs return 501 until they are filled in)
import triage from "./triage";
import workorder from "./workorder";

try {
  process.loadEnvFile();
} catch {
  /* no .env: AI routes fall back to recorded runs */
}

const PORT = Number(process.env.PORT || 8787);
const DIST = process.env.DIST || "dist";

const app = new Hono();

/** Run a handler; a missing data file becomes an honest 404 JSON, anything else a 500 JSON. Never crashes the server. */
const safe = (fn: (c: Context) => Response | Promise<Response>) => async (c: Context) => {
  try {
    return await fn(c);
  } catch (e) {
    if (e instanceof MissingDataError) return c.json(e.toJSON(), 404);
    console.error(e);
    return c.json({ error: "server_error", message: { en: String((e as Error)?.message ?? e), ar: "خطأ في الخادم" } }, 500);
  }
};

// ------------------------------------------------------------------ health
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    claude: Boolean(process.env.ANTHROPIC_API_KEY),
    pipes: has(FILES.pipes),
    twin: has(FILES.twin),
    hf: has(FILES.hfModel),
    hf_results: has(FILES.hfResults),
  }),
);

// ------------------------------------------------------------------ spots
app.get("/api/spots", safe((c) => c.json(loadSpots())));

app.get(
  "/api/spots/:id",
  safe((c) => {
    const id = c.req.param("id") ?? "";
    const f = findSpot(id);
    if (!f) return c.json({ error: "not_found", message: { en: `No wet spot ${id}`, ar: `لا توجد بقعة رطبة ${id}` } }, 404);
    const p = f.properties;
    // Pipe identity from the pipe file when present; the reported distance always comes from the spot file (position ±50 m).
    let feature: Record<string, unknown> | null = null;
    if (has(FILES.pipes)) {
      const n = nearestPipe(p.lon, p.lat);
      if (n) feature = { ...n.properties, coordinates: n.geometry.coordinates, matches_spot_file: n.properties.cad_layer === p.nearest_pipe_layer };
    }
    return c.json({
      id: p.spot_id,
      spot: p,
      geometry: f.geometry,
      radar: { hh_rise_db: p.hh_rise_db, hv_rise_db: p.hv_rise_db, passes: p.passes, area_m2: p.area_m2, ground_hh_db_400m: p.ground_hh_db_400m },
      nearest_pipe: {
        distance_m: p.nearest_pipe_m,
        layer: p.nearest_pipe_layer,
        label: p.nearest_pipe,
        on_pipe_40m: p.on_pipe_40m,
        position_accuracy_m: p.position_accuracy_m,
        feature,
        feature_missing: feature ? null : new MissingDataError(FILES.pipes).toJSON(),
      },
      land_cover: ([2023, 2024, 2025] as const).map((year) => ({ year, class: p[`landcover_${year}`] })),
      rain_check: loadSpots().rain_check ?? null,
      sources: { spot: `data/${FILES.spots}`, pipe: `data/${FILES.pipes}` },
    });
  }),
);

// ------------------------------------------------------------------ pipes
app.get(
  "/api/pipes",
  safe((c) => {
    const q = c.req.query("bbox");
    let bbox: [number, number, number, number] | null = null;
    if (q) {
      const v = q.split(",").map(Number);
      if (v.length !== 4 || v.some((x) => !Number.isFinite(x)))
        return c.json({ error: "bad_request", message: { en: "bbox must be minLon,minLat,maxLon,maxLat", ar: "يجب أن يكون bbox بالشكل minLon,minLat,maxLon,maxLat" } }, 400);
      bbox = v as [number, number, number, number];
    }
    const features = pipesInBbox(bbox);
    return c.json({ type: "FeatureCollection", features, query_bbox: bbox, count: features.length });
  }),
);
// count + km in total and by class, computed from the pipe file
app.get("/api/pipes/summary", safe((c) => c.json(pipesSummary())));

// ------------------------------------------------------------------ HydroFingerprint
app.get("/api/hf/model", safe((c) => c.json(readData(FILES.hfModel))));
app.get(
  "/api/hf/results",
  safe((c) => {
    const results = tryReadData(FILES.hfResults);
    return c.json({
      results, // null in a fresh clone (held back); robustness and scale9 are public
      results_missing: results ? null : new MissingDataError(FILES.hfResults).toJSON(),
      robustness: readData(FILES.hfRobustness),
      scale9: readData(FILES.hfScale9),
    });
  }),
);

// ------------------------------------------------------------------ hydraulic twin
const LEAK_AT: Record<TwinScenario, string | null> = { base: null, svc1: "cand", m5: "main", m15: "main", far15: "far" };
app.get(
  "/api/twin/mazar",
  safe((c) => {
    const scenario = (c.req.query("scenario") || "base") as TwinScenario;
    if (!TWIN_SCENARIOS.includes(scenario))
      return c.json({ error: "bad_request", message: { en: `scenario must be one of ${TWIN_SCENARIOS.join(", ")}`, ar: `السيناريو يجب أن يكون أحد: ${TWIN_SCENARIOS.join(", ")}` } }, 400);
    const t = loadTwin();
    const nodes = (t.nodes as any[]).map((n) => ({ lat: n.lat, lon: n.lon, z: n.z, p: n.p, value: scenario === "base" ? n.p : n[scenario] }));
    const values = nodes.map((n) => n.value as number);
    const leakKey = LEAK_AT[scenario];
    return c.json({
      scenario,
      metric: scenario === "base" ? "pressure_m" : "drop_m",
      // leak size is ASSUMED; it is encoded in the scenario key of the results file (svc1 = 1 L/s, m5 = 5 L/s, m15/far15 = 15 L/s)
      leak_lps: scenario === "base" ? null : Number(scenario.replace(/\D/g, "")),
      leak_at: leakKey ? { key: leakKey, ...t[leakKey] } : null,
      nodes,
      edges: t.edges,
      key: { cand: t.cand, tank: t.tank, tank2: t.tank2, far: t.far, main: t.main, logger: t.logger },
      summary: {
        n_nodes: nodes.length,
        n_drop_gt1m: scenario === "base" ? null : values.filter((v) => v > 1).length, // computed from nodes
        max_value: Math.max(...values),
        min_value: Math.min(...values),
      },
      stats: t.stats, // as written by the pipeline (note: n_drop_gt1m keys there are svc1/main5/main15/far15)
      assumptions: t.assumptions,
      source: `data/${FILES.twin}`,
    });
  }),
);

// ------------------------------------------------------------------ AI routes (mount points)
app.route("/api/triage", triage); // server/triage.ts   (POST /api/triage)
app.route("/api/workorder", workorder); // server/workorder.ts (POST /api/workorder)

app.all("/api/*", (c) => c.json({ error: "not_found", message: { en: `No API route ${c.req.path}`, ar: `لا يوجد مسار ${c.req.path}` } }, 404));

// ------------------------------------------------------------------ static
app.use("/radar/*", serveStatic({ root: "./public" }));
app.use("/*", serveStatic({ root: DIST }));
app.get("*", (c) => {
  const index = join(ROOT, DIST, "index.html");
  if (!existsSync(index)) return c.text(`App not built: run  npx vite build --outDir ${DIST}`, 503);
  return c.html(readFileSync(index, "utf-8"));
});

serve({ fetch: app.fetch, port: PORT }, () => console.log(`Missing Blue on http://localhost:${PORT} (static: ${DIST})`));
