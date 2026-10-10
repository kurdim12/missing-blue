# Missing Blue: handoff for Claude Code

AI Quest 2026 (HTU), AI App Hackathon, Sector 2 "next.society() — Smart Society & Public Services". **Hand-in deadline: Saturday 10 Oct 2026, 1:00 PM Amman time** (Submit page; resubmission allowed until then). Presentations from 1:30 PM in W-002 / W-003: **7 minutes present + live demo, then 3 minutes of questions.**

## Official judging (from aiquest2026.site/#/hack)
Panel of three: **domain** judge (relevance, impact, feasibility in the sector), **AI/technical** judge (implementation, AI & data-science innovation, architecture), **business** judge (viability, scalability, sustainability, market). Six criteria, same for every team:
| Criterion | Official wording | Where Missing Blue earns it |
|---|---|---|
| Impact on Jordan | A real problem with a clear group of people in Jordan who benefit | 41% NRW (Petra, Aug 2026); works for networks with no sensor data, only a pipe map; "Water & resources → leak detection" is a listed challenge area |
| Innovation & Creativity | A fresh angle, or AI used where it truly adds value | Free NASA radar + utility's own pipe map; AI beats plain algorithm and says "can't tell" |
| Feasibility & Scalability | A realistic path to real users, data and cost | Data cost 0; NISAR covers all Jordan every 12 days; no sensors in the ground needed to start |
| Technical Implementation | A working demo; **honesty about what is mocked** | Provenance badge on every screen: REAL / SIMULATED / ASSUMED |
| User Experience & Design | Usable by its intended users, **including in Arabic** | Arabic-first crew view on a phone; AR/EN toggle with RTL |
| Presentation & Pitch | Problem, demo, impact and next step, within the time | 7-minute script in `PITCH_7MIN.md` |
Sector question the panel will ask: **"Who is left out today, and do you reach them?"** The business judge will ask **who pays and what it costs to run.**

## What must be handed in (all before 1:00 PM)
1. Functional prototype. 2. **Source repository** (public or shared with judges). 3. **Pitch deck** (link set to "anyone with the link"). 4. **README that explains how to run it.** 5. Live demonstration. Every link must open for someone who is not you.

Missing Blue finds hidden water leaks in Jordan. NASA–ISRO's NISAR L-band radar flags ground that turned wet and stayed wet during the dry season. We check each wet spot against the utility's **real pipe network**. An AI agent decides which spots get a crew, a hydraulic twin shows why pressure sensors miss these leaks, and the AI writes a bilingual (Arabic/English) work order.

Everything in `data/` is real public data or computed from it. The only assumptions are in the hydraulic twin, and they are listed below. Keep it that way.

---

## Hard rules

1. **Never invent data.** Every number on screen must come from a file in `data/` or be computed from one. If something is an assumption, label it "assumed" in the UI.
2. **Label provenance in the UI**: REAL (radar, pipes, elevation) vs ASSUMED (twin demand, tank level, leak size).
3. **No personal data.** The ArcGIS source also has a "customers" layer with subscriber points. It was deliberately not downloaded. Do not fetch it.
4. **Do not redistribute the raw pipe network publicly** (critical infrastructure, no licence stated, though published openly by its owner). The repo must be public or shared with judges, so: put `data/pipes/` in `.gitignore`, and ship `scripts/fetch_pipes` that downloads layer 6 (never layer 2) from the owner's public ArcGIS FeatureServer. The README explains this. Credit the source.
5. Wet spots are **candidates**, never "confirmed leaks".

---

## Folder map

```
data/
  pipes/karak_pipes.geojson        8,778 real pipes, LineString, EPSG:4326
  pipes/karak_pipes.csv            same, one row per pipe (start/end coords)
  wet_spots/wet_spots.geojson      7 NISAR persistent wet spots, Point
  wet_spots/wet_spots.csv          same as CSV
  radar/nisar_hh_db_<date>.tif     NISAR HH backscatter, dB, float32 (3 dates)
  radar/nisar_hv_db_<date>.tif     NISAR HV backscatter, dB, float32 (3 dates)
  radar/change_hh_db_<a>_to_<b>.tif HH change vs 2026-09-04, dB (scene median removed)
  radar/change_hv_db_<a>_to_<b>.tif HV change vs 2026-09-04, dB
  radar/persistent_wet_mask.tif    uint8: 1 = wet at both later passes
  elevation/copernicus_dem30_karak.tif  Copernicus DEM GLO-30 clip, metres
  twin/mazar_zone.inp              EPANET model of the Mazar zone (open in EPANET 2.2 / WNTR)
  twin/mazar_zone_results.json     twin nodes, edges, pressures, leak scenarios
pipeline/                          Python scripts that produced the data
demo/missing-blue.html             working 7-step demo (single HTML) = UX reference
```

All rasters share one grid: EPSG:4326, bounds lon 35.63–35.79, lat 31.03–31.24, 760 × 1160 pixels (~20 m), north-up.

---

## Data dictionary

### `pipes/karak_pipes.geojson` (REAL)
Source: ArcGIS Online public item `7f8adf3ae966453f8cec976d9c35ef48` ("WaterNetwork_Muta Area_WFL1", organisation "AJI Group", account `aji_portaladmin`), published 5 Mar 2026 as "maps for validation"; layer 6 `WaterNetwork_updated_9_2020` (CAD file last saved 17 Jul 2022). Service: `https://services1.arcgis.com/CrtKrltq2pK2sCKF/arcgis/rest/services/WaterNetwork_Muta_Area_WFL1/FeatureServer/6`. 8,779 records (8,778 with geometry), 1,286.6 km. **No licence is stated on the item**: demo use only, do not redistribute, credit the source. Publisher identity (possibly Arabtech Jardaneh International) is unconfirmed.

| field | meaning |
|---|---|
| pipe_id | `KRK-00001` … stable id we assigned |
| cad_layer | original CAD layer name, e.g. `2GI`, `3-4GI`, `12DI` |
| diameter_in / diameter_mm | parsed from the layer: number = inches; `3-4` = ¾", `1-2` = ½", `1-1-2` = 1½" |
| material | `galvanized_iron` (GI), `steel` (ST), `ductile_iron` (DI/DIA), `polyethylene` (PE), `pvc` (BVC) |
| class | trunk ≥ 8", main 4–6", distribution 1.5–3", service < 1.5", unknown = numeric layers like `500` |
| length_m | geodesic-ish length in metres |
| source_handle | CAD entity handle from the source |

km by class: trunk 169, main 321, distribution 394, service 359, unknown 44.
Note: CAD lines are not a clean graph. Connections were rebuilt in `pipeline/twin_build.py` by snapping endpoints within 3 m and drawing gaps up to 8 m to the nearest line.

### `wet_spots/wet_spots.geojson` (REAL, computed)
| field | meaning |
|---|---|
| spot_id | W1–W7 |
| lat, lon | cluster centroid |
| area_m2 | cluster area (20 m pixels × count) |
| hh_rise_db, hv_rise_db | mean HH / HV rise vs 2026-09-04, averaged over both later passes |
| nearest_pipe_m | distance to nearest real pipe (pipe densified every 5 m) |
| nearest_pipe_layer / nearest_pipe | that pipe's CAD layer / readable size + material |
| on_pipe_40m | true if within 40 m |
| ground_hh_db_400m | mean HH dB in a 400 m window on 2026-09-28 (context only; do NOT use it to call land built-up) |
| landcover_2023/2024/2025 | Sentinel-2 10 m Land Use/Land Cover (Impact Observatory/Microsoft/Esri), dominant class of 25 samples within ~50 m |

Results: **W7** (31.05727, 35.68692): spot centre 6 m from a ¾" galvanized iron service line at the west edge of al-Mazar al-Janubi; land cover built area 2023–2025. **W3** (31.21237, 35.75522): 38 m from a 1" GI line on **open rangeland** at the NE edge of Karak (not built-up). W1, W2, W4, W5, W6: 177 m to 1.4 km from any pipe, on farmland (cropland in at least one of 2023–2025), most likely irrigation.

**Position accuracy is about ±50 m** (20 m pixels, 100 m averaging). Never display metre precision as fact; say "spot centre X m from pipe".

**Rain check:** ERA5 via Open-Meteo (CC BY 4.0): 0.0 mm at Mazar and Karak between 4 and 28 Sep 2026 (only 30 Aug and 30 Sep traces).

### Radar rule (how wet spots were found)
NISAR L2 GCOV (provisional), track 151, frame 73, descending, HH+HV. Passes on 2026-09-04, 2026-09-16, 2026-09-28.
1. 5×5 boxcar (100 m) in linear power, then dB.
2. Change vs 2026-09-04 for each later pass, subtract the scene median (calibration shift).
3. Pixel is wet if HH ≥ +2 dB **and** HV ≥ +1.5 dB at **both** later passes. 500 m trimmed from no-data edges.
4. Connected clusters ≥ 4 pixels (1,600 m²). 160 pixels total, 7 clusters, 0.02% of the area.
Scene 95th-percentile HH change is only ~0.8 dB, so the 2 dB threshold is selective.

Source granules (NASA Earthdata login needed, ~1.9 GB each):
- `NISAR_L2_PR_GCOV_029_151_D_073_2005_DHDH_A_20260904T162544_20260904T162618_P05023_N_F_J_002`
- `NISAR_L2_PR_GCOV_030_151_D_073_2005_DHDH_A_20260916T162543_20260916T162618_P05023_N_F_J_001`
- `NISAR_L2_PR_GCOV_031_151_D_073_2005_DHDH_A_20260928T162543_20260928T162618_P05023_N_F_J_001`
Download pattern: `https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/<granule>/<granule>.h5`

### `twin/` (REAL geometry + ASSUMED operation)
Mazar zone: all connected pipes within 2.5 km of W7. 850 junctions, 883 pipes, 63.6 km. Elevation from Copernicus DEM (150 m median filter removes buildings). Solved with EPANET via WNTR, Hazen-Williams, pressure-driven demand (required 15 m).

ASSUMED: demand 0.7 L/s per km of pipe; two supply points at the same water level, 25 m above the highest junction (head 1305.6 m): the 12" feeder entry and the hilltop node on the 4" main; Hazen-Williams C: GI 100, ST 110, DI 130, PE/PVC 140.

`mazar_zone_results.json`:
- `nodes[]`: `lat, lon, z` (elevation m), `p` (baseline pressure m), `svc1` (pressure drop m for a 1 L/s leak at W7), `m5`/`m15` (5 / 15 L/s at the main junction 193 m from W7), `far15` (15 L/s break on a main 3.7 km away)
- `edges[]`: `c` coords, `in` diameter inches, `mat`, `q` baseline flow L/s
- `cand`, `tank`, `tank2`, `far`, `main`, `logger`: key locations
- `stats`: median pressure 18.3 m, delivered 36.6 L/s, junctions dropping > 1 m: leak at W7 → 1 other junction; far main break → 788 of 850.

**Story point:** a small service-line leak (what the radar found) is invisible to network pressure loggers; a big main break is visible everywhere. Radar and loggers complement each other.

### Context numbers (cite them like this)
- Jordan non-revenue water: **41%** (Minister of Water and Irrigation, Petra news agency, 24 Aug 2026), down from about half in 2022; national target 25% by 2040 (National Water Strategy 2023–2040).
- NISAR L-band data public since 20 July 2026 (ASF DAAC), labelled PROVISIONAL. L-band wavelength 24 cm (NASA). 12-day repeat orbit (JPL). GCOV posting 10 or 20 m by mode; ours is 20 m.
- Say "L-band responds to soil moisture and penetrates vegetation deeper than C/X-band"; do NOT say it sees through pavement or is "more sensitive" than other bands.
- Town coordinates (GeoNames): Karak Castle 31.1806 N 35.7014 E; Mu'tah 31.0925 N 35.6944 E; al-Mazar al-Janubi 31.0672 N 35.6947 E.
- Full sources and verification: the doc "Missing Blue · Sources & Verification" (ask the owner for the link) and `SOURCES.md`.
- 1 L/s = 86.4 m³ per day.

---

## What to build (the platform)

Owner's stack: TypeScript/Hono on Cloudflare Workers + D1 + R2, Next.js, Python/FastAPI, Supabase. Pick the fastest path to a working demo by 1 PM. Suggested:

**Frontend (Next.js + MapLibre GL JS):**
- Map with an OSM basemap, the radar layer (HH dB or change) as a raster overlay, pipes styled by class, wet spots as markers.
- Spot panel: radar values, nearest pipe, ground brightness, verdict, "Generate work order".
- Twin view for the Mazar zone: pipes coloured by pressure, scenario buttons (normal / leak at W7 / main break), drop shown per junction.
- Language toggle AR/EN; work order printable view.
- Provenance badges on every layer (REAL / ASSUMED).

**API (Hono on Workers or FastAPI):**
```
GET  /api/spots                     -> wet_spots.geojson
GET  /api/pipes?bbox=minLon,minLat,maxLon,maxLat -> pipes in bbox (GeoJSON)
GET  /api/spots/:id                 -> spot + nearest pipe + ground brightness
POST /api/triage                    -> Claude agent; tools: list_wet_spots, nearest_pipe, land_cover, simulate_leak; returns {decisions:[{id,verdict,priority,reason}],summary}
POST /api/workorder {spot_id, lang} -> Claude writes the order from facts only (numbers copied exactly)
GET  /api/twin/mazar?scenario=base|svc1|far15 -> nodes/edges with pressure or drop
```
Store pipes/spots in D1 (or Supabase/PostGIS), rasters in R2 (convert the TIFs to Cloud-Optimized GeoTIFF or pre-render PNG tiles with the bounds above).

**AI (the judges will ask "where is the AI"):**
- Triage agent = Claude with tools: list_wet_spots, nearest_pipe, land_cover, simulate_leak. Reject rule: > 40 m from any pipe on farmland. Tell it position accuracy is ±50 m and there was 0 mm rain between passes.
- Work order = Claude in Arabic + English, facts only. Template in `demo/missing-blue.html` (search `MB-KRK-0007`).
- Never let the model invent numbers; pass facts as JSON and say "copy numbers exactly".

**Priority order (stop when time runs out):**
1. Map + pipes + wet spots + spot panel (real data visible).
2. AI triage endpoint + UI.
3. Work order AR/EN.
4. Twin view with scenarios (data already computed; just render `mazar_zone_results.json`).
5. Radar overlay + time slider over the 3 dates.

**Done means:** a judge can open the link, see real pipes and NASA radar spots on a real map of Karak, click W7, watch the AI explain why it gets a crew, and read the Arabic work order.

---

## Re-running the pipeline (optional)
Python 3.10+: `pip install h5py numpy scipy pyproj pillow rasterio shapely networkx wntr`
- `nisar_export.py`: radar → wet spots + GeoTIFFs. Env: `BBOX=35.63,35.79,31.03,31.24 NX=760 NY=1160 TIFDIR=out/` ; args: three .h5 in date order, then an output folder.
- `pipes_match.py <pipes.geojson> <hotspots.json> <out.json>`: nearest pipe per spot.
- `twin_build.py <pipes.geojson> <dem.tif> twin_graph.pkl` (env `TOL=8 SN=3`), then `twin_sim.py`, then `twin_run.py <out.json>` (writes .inp next to it).
Scripts were written for a hackathon night: paths are passed as arguments, but read them before re-running.

## Known limits (say them before judges do)
- Candidates, not confirmed leaks; a crew confirms with an acoustic detector. A garden next to a pipe can pass the filter.
- Pipe record is from 2020; newer pipes are missing.
- NISAR products are marked provisional by NASA.
- Twin demand and tank levels are assumed; geometry and elevation are real.

---

## HydroFingerprint AI (the core AI layer)

**Question it answers:** the Karak drawing has **107 gaps** in the Mazar system (pipe ends 1–8 m from another pipe). Which are real connections? Pressure physics can tell, if loggers sit in the right places.

**Data (`data/hydrofingerprint/`):**
- `hf_data.npz`: 4,800 EPANET runs. `X` pressure (m) at all 868 junctions, `Q` total inflow (L/s), `Y` (n×5) 1 = gap connected, `S` (demand multiplier, tank head), `J` junction ids, `GAPS` = G104, G2, G105, G98, G6.
- `hydrofingerprint_results.json`: gap locations/sizes, logger positions (3 spread + 7 AI-chosen, in order), information curves (AI vs random), test accuracies, one held-out demo case.

**Method (pipeline/hf_*.py):**
1. `hf_gaps.py`: rebuild the Mazar network with strict 1 m snapping; every pipe end 1–8 m from another pipe becomes an explicit candidate link (107). Bug fixed: real distance check, not bounding box.
2. `hf_model.py`: EPANET model (WNTR); close each gap alone and measure pressure change; pick 5 medium-impact gaps (15–150 junctions move > 0.5 m) at least 150 m apart.
3. `hf_sim.py`: all 2^5 = 32 network states × 150 scenarios (demand ×0.6–1.4, per-node lognormal σ 0.25, tank level ±3 m).
4. `hf_train.py`: readings = logger pressures + inflow with noise (0.2 m, 2%). Split 2,520 train / 840 validation / 1,440 test. Models: Bayesian (shrinkage LDA over the 32 states → P(each gap connected)) and an MLP (64-64). Logger placement: greedy, each step picks the junction that most reduces validation log-loss (empirical information gain), from candidates on pipes ≥ 2".

**Results (1,440 unseen scenarios):**
| Loggers | Info (bits of 5) | Gap accuracy A–E (Bayes) | All 5 right |
|---|---|---|---|
| 3 spread | 0.0 | ~50% each (chance) | 3.1% |
| +1 AI-chosen | 1.6 | 92.5 / 71 / 65 / 50 / 50 | 12.4% |
| +7 AI-chosen (10) | 3.63 | **100 / 93.1 / 99.4 / 99.7 / 49.3** | **46.1%** |
| 10 random | 1.71 | n/a | n/a |
MLP with 10 loggers: 100 / 79.4 / 97.4 / 99.5 / 48.5, all-5 37.2%. The physics-based Bayesian model beats the neural net. Gap E (G6, max effect ~2 m) is not resolvable by pressure: the system reports "can't tell" and sends a crew.

**Honesty:** gaps and pipes are real; pressure readings are SIMULATED from our model (no public logger data for Karak). This proves the method under known truth; it does not prove which Karak gaps are connected. Single pressure zone assumed (no PRVs), so some modelled pressures are unrealistically high (up to ~175 m).

**Platform features for it:** `GET /api/hf/results`, a map of gaps + loggers, a logger-count switch (3 / 4 / 10), the probability bars per gap, "reveal truth", and the info-vs-loggers chart. Claude (LLM) explains the result and writes the field instruction ("check valve at Gap E").

## How to describe the AI and the stack (say exactly this)
- **Physics-guided machine learning:** a Bayesian classifier and a neural network trained on 4,800 EPANET simulations of a real Jordanian network, tested on 1,440 unseen cases.
- **Active sensing:** greedy information-gain placement of pressure loggers; AI-placed loggers extract 3.6 bits vs 1.7 for random placement.
- **Calibrated uncertainty:** probabilities per connection; refuses to decide when the physics can't (Gap E).
- **Remote sensing:** NISAR L-band change detection, multi-temporal rule, verified against rainfall (ERA5) and land cover (Sentinel-2).
- **LLM agent:** Claude with tool use over real data for triage and Arabic/English work orders.
- **Stack:** Python (NumPy, SciPy, scikit-learn, WNTR/EPANET 2.2, rasterio, shapely, pyproj, h5py); TypeScript front end (MapLibre/Canvas); Claude API for the agent. Data in GeoJSON/GeoTIFF/EPANET .inp.
Do not claim a GNN; say it is the scale-up path for many networks.

## HydroFingerprint: rigor added (10 Oct, 02:00–03:00)
Files in `data/hydrofingerprint/`: `hydrofingerprint_robustness.json`, `hydrofingerprint_scale9.json`, `hf_live_model.json`, `hf10_a.npz`, `hf10_b.npz`. Scripts: `hf_baseline.py`, `hf_robust.py`, `hf_scale_sim.py`, `hf_scale_train.py`, `hf_export_live.py`.

**1. Plain-algorithm baseline** (`hf_baseline.py`): one reference simulation per network state at nominal demand, pick the closest by least squares, given the SAME 10 logger sites.
| 10 loggers | Gap A | B | C | D | E | all 5 |
|---|---|---|---|---|---|---|
| Algorithm | 100 | 86.1 | 83.2 | 70.8 | 49.5 | 26.7% |
| AI (Bayesian) | 100 | 93.3 | 99.4 | 99.9 | 49.8 | 46.9% |

**2. Robustness to model mismatch** (`hf_robust.py`, 800 new scenarios): pipe roughness ×0.8–1.2 per pipe, demand ×0.5–1.6 with node σ 0.4, tank ±5 m, noise 0.3 m / 3%. AI all-5: 46.9% → **45.4%**; algorithm 26.7% → 23.9%; MLP 46.2% → 42.9%.

**3. Calibration** (Bayesian P(connected)): ECE 1.7% (nominal) / 2.6% (shifted); Brier 0.067 / 0.080. When it says ≥ 90% or ≤ 10% (about 70% of decisions) it is right **99.9% / 99.1%**.

**4. Scale** (`hf_scale_*`, 9 gaps = 512 states, 3,800 random-state simulations, 15 loggers = 3 spread + 12 AI-placed): all-9 correct: MLP **19.8%**, Bayesian 17.8%, plain algorithm (needs 512 reference sims) **3.9%**, chance 0.2%. Per gap MLP: 100 / 90.6 / 98.9 / 62.6 / 90.4 / 100 / 49.7 / 82.6 / 96.7%. The algorithm needs 2^K simulations; K = 20 → ~1 million; 107 gaps impossible.

**5. Live in-browser AI** (`hf_live_model.json`): 32 class means and a shared covariance (Ledoit-Wolf on standardized residuals) over inflow + 140 candidate logger sites, plus 24 held-out cases. The page computes the posterior with a Cholesky solve and picks the next logger by expected entropy reduction (5-point Gauss–Hermite). Checked in Python against the same 24 cases: mean gap accuracy 47.5% (3 loggers) → 77.5% (5) → 84.2% (7) → 85.8% (10); mean uncertainty 4.94 → 2.08 → 1.38 → 1.18 bits. MLP results vary between training runs (gap B 79–97%); the Bayesian model is stable, so quote Bayesian numbers.
