# Missing Blue · conventions for screen agents

The foundation (shell, router, i18n, UI kit, API, map) is shared. **You own exactly one screen file** (plus your own
`src/features/<name>/` folder and, for AI screens, one server file). Do not edit shared files; if you need a change
there, say so in your report.

## File ownership

| Owner | Files |
|---|---|
| foundation | `server/index.ts`, `server/data.ts`, `src/App.tsx`, `src/main.tsx`, `src/screens.ts`, `src/router.ts`, `src/i18n.tsx`, `src/api.ts`, `src/types.ts`, `src/ui/*`, `src/map/*`, `src/shell/*`, `src/styles.css`, `vite.config.ts` |
| each screen agent | `src/screens/<Name>.tsx` and `src/features/<name>/*` (strings, sub-components, CSS, hooks) |
| triage agent | also `server/triage.ts` (mounted at `/api/triage`) |
| work-order agent | also `server/workorder.ts` (mounted at `/api/workorder`) |

Screen files: `Problem`, `Overview`, `SpotDetail`, `Triage`, `Twin`, `Records`, `WorkOrder`, `Crew`, `Impact`, `Sources`, `DemoMode`.

## How a screen plugs in

`src/screens.ts` lists every screen: `id`, `route` (hash, e.g. `/spot/:id`), EN+AR `title`/`short`, `journey`,
`criteria`, `chrome` (`desktop` = with top bar, `phone` = no top bar, used by Crew), `layout` (`page` = scrolling page,
`full` = edge-to-edge for maps) and a lazy `component`. The shell (`src/App.tsx`) matches the hash and renders:

```tsx
// src/screens/SpotDetail.tsx
import type { ScreenProps } from "../screens";
export default function SpotDetail({ params, query, embedded }: ScreenProps) { /* params.id === "W7" */ }
```

- Routes: `#/problem`, `#/overview`, `#/spot/:id`, `#/triage`, `#/twin`, `#/records`, `#/workorder/:id`, `#/crew/:id`,
  `#/impact`, `#/sources`, `#/demo`. Default `#/` → `#/problem`.
- Links: `<a href={href("/spot/W7")}>` or `navigate("/spot/W7")` from `src/router.ts`.
- Query: `#/crew/W7?lang=ar` → `query.get("lang")`. `?lang=ar|en` also sets the language at load (for the QR code).
- `embedded` is passed by Demo mode when it renders another screen inside itself (DemoMode can import screen
  components from the registry: `SCREENS.find(s => s.id === "twin")!.component`).
- A screen that throws is caught by an error boundary; the shell and the demo keep running.

## Strings (AR/EN, full RTL)

Each feature keeps its own strings — never add feature text to a shared file:

```ts
// src/features/twin/strings.ts
import { defineStrings } from "../../i18n";
export const twinStrings = defineStrings({
  en: { title: "Hydraulic twin", moved: "{n} junctions drop more than 1 m" },
  ar: { title: "التوأم الهيدروليكي", moved: "{n} عقدة ينخفض ضغطها أكثر من 1 م" },
});
// in the component
const t = useT(twinStrings);  t("moved", { n: fmt(788, 0) })
```

- `defineStrings` makes TypeScript require the same keys in `ar` as in `en`.
- Inline one-offs: `const { t, lang, dir } = useI18n(); t({ en: "Map", ar: "الخريطة" })`.
- `<html lang dir>` is set by the provider; the toggle persists in `localStorage["mb.lang"]`.
- Use **logical CSS** only: `margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`,
  `border-inline-start`. Never `left/right` for layout. MapLibre control corners are physical: BaseMap already puts its
  zoom buttons on the inline-end side.
- Technical tokens stay LTR inside Arabic: `<Ltr>W7</Ltr>`, `<Ltr mono>KRK-02550</Ltr>`, file paths (`SourceNote` does it).

## Numbers (every number from data/)

From `src/i18n.tsx` (Latin digits in both languages, en-GB grouping):

| helper | example |
|---|---|
| `fmt(n, maxDigits=1, minDigits=0)` | `fmt(1286.6)` → `1,286.6` |
| `fmtSigned(n, d)` | `fmtSigned(2.44, 2)` → `+2.44` |
| `withUnit(n, unit, lang, d)` | `withUnit(6, "m", "ar")` → `6 م` · units in `UNITS` (m, km, mm, m2, m3, m3/day, L/s, dB, in, bits, %) |
| `pm(n, unit, lang)` | `pm(50, "m", lang)` → `±50 m` / `±50 م` |
| `fmtDate(iso, lang)` | `16 Sep 2026` / `16 أيلول 2026` |

Rules: load or compute every figure from an API response; never type a number that exists in `data/`. Radar
positions: "spot centre X m from pipe" plus `pm(spot.position_accuracy_m, "m", lang)`; never metre precision as fact.
Wet spots are inspection **candidates**, never confirmed leaks. No JD/$ figures. No GNN claims.

## Provenance badges (on every layer and every result)

```tsx
<Badge kind="REAL" label={t({ en: "NISAR radar", ar: "رادار NISAR" })} />
<Badge kind="SIMULATED" />   // pressure readings (HydroFingerprint)
<Badge kind="ASSUMED" />     // twin demand, tank level, leak size
<Badge kind="RECORDED" />    // recorded AI run (live call unavailable)
<Badge kind="PLAN" />        // business plan
```
Colours and tooltip text are defined once (`src/features/shell/strings.ts` → `provenanceStrings`). `size="sm"` for map
legends / stat labels. Verdicts and categories use `<Tag tone="ok|warn|danger|blue|violet|neutral">`, not Badge.

## UI kit (`src/ui`)

`import { Badge, Panel, Button, Stat, SourceNote, EmptyState, Spinner, Tag, Page, PageHeader, Ltr } from "../ui";`

- `Page` / `PageHeader` for `layout: "page"` screens. Utility classes: `grid-2`, `grid-3`, `stat-grid`, `badge-row`,
  `muted`, `faint`, `num`, `mono`.
- `Panel title subtitle badges actions tone="default|raised|accent|warn"`.
- `Button variant="primary|secondary|ghost" size="sm|md|lg" href? block?`.
- `Stat label value unit note source badge size` (value already formatted).
- `EmptyState error={apiError} onRetry={reload}` shows the honest bilingual reason + hint for missing data.
- Design tokens are CSS variables in `src/styles.css` (`--surface-1..3`, `--text`, `--text-muted`, `--blue`, `--amber`,
  `--red`, `--mint`, `--violet`, `--s-1..8`, `--r-1..3`, `--fs-xs..3xl`). Put feature CSS in
  `src/features/<name>/<name>.css` and import it from your screen; prefix classes with your feature name.

## API client (`src/api.ts`) and types (`src/types.ts`)

```tsx
const { data, error, loading, reload } = useApi(() => api.spot(params.id), [params.id]);
if (loading) return <Spinner />;
if (error) return <EmptyState error={error} onRetry={reload} />;
```

| client | route | notes |
|---|---|---|
| `api.health()` | `GET /api/health` | `{ok, claude, pipes, twin, hf, hf_results}` |
| `api.spots()` | `GET /api/spots` | wet_spots.geojson (+ `rain_check` string) |
| `api.spot(id)` | `GET /api/spots/:id` | `spot`, `radar`, `nearest_pipe` (distance from the spot file + the matching pipe feature from the pipe file, `feature: null` when pipes are absent), `land_cover[]`, `rain_check` |
| `api.pipes(bbox?)` | `GET /api/pipes?bbox=w,s,e,n` | FeatureCollection + `count`; all 8,778 pipes without bbox (~3.4 MB, cached) |
| `api.pipesSummary()` | `GET /api/pipes/summary` | `{count, km_total, km_by_class}` computed from the pipe file |
| `api.hfModel()` | `GET /api/hf/model` | hf_live_model.json (`base`/`ig` are FEATURE indices: site = `nodes[i-1]`) |
| `api.hfResults()` | `GET /api/hf/results` | `{results (null if held back), results_missing, robustness, scale9}` |
| `api.twin(scenario)` | `GET /api/twin/mazar?scenario=base\|svc1\|m5\|m15\|far15` | nodes `{lat,lon,z,p,value}` (value = pressure for base, drop for scenarios), edges, `key` locations, `leak_at`, `leak_lps` (ASSUMED), `summary.n_drop_gt1m` computed, `stats`, `assumptions` |
| `radar.bounds()` / `radar.url(file)` | `/radar/*` | PNG overlays from `public/radar/` |
| `getJson` / `postJson` | any | for your own routes (POST /api/triage, /api/workorder) |

Twin note: `summary.n_drop_gt1m` for `svc1` is 2 (it includes the leak junction itself); the "1 other junction" in the
pitch is `stats.n_drop_gt1m_excl_svc`. `far15` → 788 of 850.

Missing files (fresh clone): the server answers `404 {error:"missing_data", file, message:{en,ar}, hint}`; the client
throws an `ApiError` with `kind === "missing_data"`; `EmptyState` shows it. Every screen must render something honest
when pipes, twin or HydroFingerprint files are absent — never crash. Held back from git: `data/pipes/*`, `data/twin/*`,
`data/hydrofingerprint/{hydrofingerprint_results,hf_live_model,hf_gaps_pick}.json`, `demo/missing-blue.html`, TIFs.

AI routes: on any Claude error or missing key, return the recorded fallback with `source: "recorded"`; the UI shows
`<Badge kind="RECORDED" />`. Reuse `server/data.ts` (`loadSpots`, `findSpot`, `nearestPipe`, `pipesInBbox`,
`loadTwin`, `readData`, `MissingDataError`) for tools.

## Maps (`src/map`)

```tsx
import { BaseMap, useGeoJson, useImageOverlay, useMap } from "../map/BaseMap";
import { KARAK_BOUNDS, MAZAR_CENTER, PIPE_CLASSES, pipeLineLayer, pipeClassOfDiameter, COLORS, RAMP } from "../map/style";
import { circlePolygon, boundsAround, googleMapsUrl } from "../map/geo";

function PipesLayer() {
  const { data } = useApi(() => api.pipes(), []);
  useGeoJson("pipes", data, [pipeLineLayer("pipes")]);
  return null;
}
<div className="map-screen">
  <BaseMap bounds={KARAK_BOUNDS} attribution="NISAR: NASA/ISRO (ASF DAAC)" onReady={(map) => ...}>
    <PipesLayer />
  </BaseMap>
  <div className="map-overlay map-overlay-start"><Panel>...</Panel></div>
</div>
```

- BaseMap: OSM raster when online, dark ground when offline (navigator.onLine + tile errors; shows a small note).
  Resizes with its container. Children only mount after the map has loaded; `useMap()` gives the map.
- `useGeoJson(sourceId, data, layers, {beforeId?, promoteId?})` adds/updates a source and layers, removed on unmount.
  New `data` → `setData`. Layer ids must be unique across the map.
- `useImageOverlay(id, url, KARAK_BOUNDS, {opacity, visible, beforeId})` for radar PNGs (`radar.url("change_hh_2026-09-16.png")`).
- Pipe class colours/widths are defined once in `style.ts` (`PIPE_CLASSES`: trunk ≥ 8", main 4–6", distribution
  1.5–3", service < 1.5", unknown). Build legends from `PIPE_CLASSES`.
- No glyphs are configured (offline-safe): no symbol/text layers. Use `new maplibregl.Marker({ element })` or HTML
  overlays for labels. Map click: `map.on("click", "layer-id", e => ...)` inside a `useEffect` with cleanup.

## Self-check (shared machine, ~2 GB free RAM)

Heavy jobs (tsc, vite build, a browser run) only while holding the lock, and keep it short:

```bash
python scripts/lock.py acquire <name>
npx tsc --noEmit
npx vite build --outDir dist-<name>
DIST=dist-<name> PORT=<your port> npx tsx server/index.ts &      # serves /api, /radar and your build
# Python Playwright, chromium args ["--enable-unsafe-swiftshader","--use-angle=swiftshader"] for WebGL
python scripts/lock.py release <name>                               # always, also after errors
```

- Use your own port and `dist-<name>` folder; kill your server when done. `dist-*/` is gitignored.
- Dev mode alternative: `npm run dev` (Vite on 5173 proxies `/api` to 8787). `@vitejs/plugin-react` is not used
  (v6 needs Vite 8); JSX is compiled by esbuild, so dev does a full reload instead of Fast Refresh.
- Check 390 px width (phone), Arabic RTL, and Wi-Fi off (no crash; recorded runs) before reporting done.
