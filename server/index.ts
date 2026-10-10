// Missing Blue API (Hono on Node). Serves data/ and the built app; AI routes are added in step 3-4.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DATA = join(ROOT, "data");
const app = new Hono();

const readJson = (rel: string) => JSON.parse(readFileSync(join(DATA, rel), "utf-8"));

app.get("/api/health", (c) =>
  c.json({ ok: true, claude: Boolean(process.env.ANTHROPIC_API_KEY), pipes: existsSync(join(DATA, "pipes", "karak_pipes.geojson")) }),
);
app.get("/api/spots", (c) => c.json(readJson("wet_spots/wet_spots.geojson")));

// static: data files (never the raw pipes over /data; pipes go through /api/pipes with a bbox)
app.use("/data/radar/*", serveStatic({ root: "./public" }));
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Missing Blue on http://localhost:${port}`));
