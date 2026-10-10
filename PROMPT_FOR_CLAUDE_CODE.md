You are building **Missing Blue**, the demo platform for the AI Quest 2026 AI App Hackathon (HTU, Amman), Sector 2 next.society(). **Hand-in closes Saturday 10 Oct 2026, 1:00 PM Amman time; aim to be done at 12:30 PM.** Presentation from 1:30 PM: 7 minutes present + live demo, 3 minutes questions. It must run in a browser on a laptop with unreliable Wi-Fi.

## We are scored on six official criteria; build for them
| Criterion (official wording) | What the build must show |
|---|---|
| **Impact on Jordan**: a real problem with a clear group of people in Jordan who benefit | Opening screen states the problem with its source (41% NRW) and names who benefits: Karak water office, field crews, and households on rotation supply in villages like al-Mazar and Mu'tah |
| **Innovation & Creativity**: AI used where it truly adds value | AI triage with a visible tool log; HydroFingerprint live; "AI vs plain algorithm" numbers on screen |
| **Feasibility & Scalability**: a realistic path to real users, data and cost | Impact & business screen: data cost 0 (NASA/ISRO, public), revisit every 12 days, no sensors needed to start, what runs where |
| **Technical Implementation**: a working demo, **honesty about what is mocked** | REAL / SIMULATED / ASSUMED badge on every layer and every result. Never hide a badge |
| **User Experience & Design**: usable by its intended users, **including in Arabic** | Crew view Arabic-first, phone-sized, big buttons. AR/EN toggle with full RTL everywhere |
| **Presentation & Pitch**: problem, demo, impact, next step, within the time | Demo mode that follows `PITCH_7MIN.md` exactly, keyboard-driven, never more than one click per step |

## Hand-in (all required, before 1:00 PM)
1. Working prototype. 2. **Public GitHub repo.** 3. Pitch deck link (the team makes the deck). 4. **README that explains how to run it.** 5. Live demo.
Create the repo and push in the first 15 minutes; push after every build step so a rough version can be submitted early. The owner dislikes git and terminals: do every git/gh step for him, and give him one link at the end.

## Read first, in this order
1. `CLAUDE.md`: data dictionary, verified facts, honesty rules, judging table, HydroFingerprint results. Treat it as the spec.
2. `PITCH_7MIN.md`: the 7-minute script and judge Q&A. Demo mode follows it.
3. `USER_JOURNEY.md`: the four journeys (NRW engineer, field crew, records officer, judge). Build screens for these journeys.
4. `SOURCES.md`: the source for every number.
5. `demo/missing-blue.html`: a working single-file demo. Reuse its logic and wording; do not copy its layout blindly.

## Hard rules (never break)
- **Every number on screen comes from a file in `data/`** or is computed from one. No invented data, no placeholder numbers, no fake users, no invented prices or JD figures.
- **Label provenance on every layer and result:** REAL (radar, pipes, elevation, rain, land cover), SIMULATED (pressure readings), ASSUMED (twin demand, tank level, leak size).
- **Never claim a leak is confirmed.** Wet spots are inspection candidates. Show radar position accuracy as ±50 m; never present metre precision as fact.
- **Do not load or fetch the "customers" layer** (layer 2) from the ArcGIS source. No personal data anywhere.
- **Do not commit the raw pipe network.** `data/pipes/` goes in `.gitignore`. Add `scripts/fetch_pipes.(ts|py)` that downloads layer 6 only from `https://services1.arcgis.com/CrtKrltq2pK2sCKF/arcgis/rest/services/WaterNetwork_Muta_Area_WFL1/FeatureServer/6` (paged query, `f=geojson`, `outSR=4326`) into `data/pipes/`. The demo laptop already has the local copy.
- **No GNN claims.** The AI is a physics-guided Bayesian model + neural network + information-gain logger placement + a Claude agent.
- Works **offline** except live Claude calls; every AI screen has a recorded fallback that loads instantly and is tagged "Recorded run".

## Stack
- **Frontend:** Vite + React + TypeScript, MapLibre GL JS (OSM raster basemap when online, plain dark background when offline). Arabic/English toggle with full RTL for Arabic.
- **Backend:** Hono, run locally with Node for the demo. Serve `data/` statically.
- **AI:** Claude API (Messages API with tool use) for triage and work orders, key from `.env` (`ANTHROPIC_API_KEY`, never committed; ship `.env.example`). HydroFingerprint inference runs **in the browser** from `data/hydrofingerprint/hf_live_model.json` (port the `LIVE` engine from `demo/missing-blue.html`: Cholesky solve, posterior over 32 states, expected-entropy logger choice).
- Convert rasters once: `data/radar/*.tif` → PNG overlays, bounds lon 35.63–35.79, lat 31.03–31.24 (EPSG:4326, 760×1160). Commit the PNGs, not the TIFs. Reference: `pipeline/nisar_export.py`.

## Screens (each mapped to a journey step and a criterion)
1. **Problem** (Impact): one screen, Arabic and English: "41% of Jordan's water is non-revenue (Petra, Aug 2026)", who is left out (networks with no sensor data; Missing Blue needs no sensors in the ground, only a satellite pass and the pipe map), what Missing Blue does in one line. Source link visible.
2. **Overview** (Journey 1, steps 2–3): map with real pipes styled by class (trunk ≥ 8", main 4–6", distribution 1.5–3", service < 1.5"), 7 wet spots, radar overlay toggle, 3-date slider (4 / 16 / 28 Sep 2026), header facts: "7 persistent wet spots · 0 mm rain between passes · 1,287 km of pipe".
3. **AI triage** (Journey 1, step 4; Innovation): button "Triage with AI". `POST /api/triage` runs Claude with tools `list_wet_spots`, `nearest_pipe`, `land_cover`, `simulate_leak` over `data/`. Stream the tool calls into a visible log. Output JSON `{decisions:[{id, verdict, priority, reason}], summary}`. Rules given to the model: dispatch only within 40 m of a real pipe; reject farmland far from pipes; position accuracy ±50 m; 0 mm rain between passes. Fallback: the recorded decisions in the demo file.
4. **Spot detail** (Journey 1, step 5): radar rise, nearest pipe (size, material, distance), land cover 2023–2025, Google Maps link, provenance badges.
5. **Hydraulic twin** (Journey 1, step 6): render `data/twin/mazar_zone_results.json`; scenarios Normal / Leak at W7 1 L/s / Main break 15 L/s; colour pipes by pressure or drop; show "junctions dropping > 1 m". Badge: geometry REAL, operation ASSUMED.
6. **Network records / HydroFingerprint** (Journey 3; Innovation + Technical): 5 tested gaps (A–E) and the candidate logger sites; tap to add/remove loggers; "AI: place next logger" shows expected bits removed; per-gap probability bars with verdicts Connected (≥ 0.9) / Not connected (≤ 0.1) / Can't tell yet; 24 hidden test networks with "Reveal truth". Side panel **"Why AI and not a plain algorithm?"** with numbers from `hydrofingerprint_robustness.json` and `hydrofingerprint_scale9.json` (all-5 accuracy 46.9% vs 26.7%; shifted network 45.4% vs 23.9%; 9-gap 19.8% vs 3.9%; when it says ≥ 90% or ≤ 10% it is right 99%+). Badge: SIMULATED readings.
7. **Work order + crew view** (Journey 1 step 7, Journey 2; UX in Arabic): `POST /api/workorder {spot_id, lang}`; Claude writes Arabic + English from a facts JSON, copying numbers exactly. Crew view opens Arabic first, phone width (test at 390 px): map pin with ±50 m circle, "Open in Google Maps", checklist, "Leak found / No leak" buttons (stored locally for the demo). Show a QR code on the laptop screen that opens the crew view on a judge's phone when online.
8. **Impact & business** (Feasibility + business judge): plain cards, every figure either sourced or labelled ASSUMED:
   - Who benefits / who is left out today: the government's AI leak project works from SCADA sensor data (source in `SOURCES.md`); a network without that data gets nothing from it. Missing Blue starts from a free satellite pass and the pipe map. Label the "how many networks lack sensors" point "to confirm with the utility"; do not state a count.
   - Data cost: 0 (NISAR is free and public, every 12 days). Pipe map: the utility's own.
   - What one hidden 1 L/s leak loses: 86.4 m³/day, 31,536 m³/year (arithmetic, leak size ASSUMED).
   - Crew effort: 2 dispatched sites instead of 1,287 km of pipe in this area.
   - Running cost: what runs on a laptop vs what calls Claude; show the per-run token count from the triage response, not a guessed price.
   - Who pays (our plan, label "PLAN"): the water utility, per-governorate subscription; pilot funded with a utility or donor partner.
   - Next step: pilot in Karak; crew checks W7 and W3; outcomes become the first labels for tuning.
9. **Sources & method** (Technical honesty): every dataset with link and licence (from `SOURCES.md`), the assumptions list, the limits list.
10. **Demo mode**: guided path exactly in the order of `PITCH_7MIN.md` (1 → 2 → 3 → 4 → 5 → 6 → 7 → 8), "Next" button and arrow keys, a small step timer so the presenter stays inside 7:00. Must work with Wi-Fi off.

## API (Hono)
```
GET  /api/spots                 -> data/wet_spots/wet_spots.geojson
GET  /api/pipes?bbox=...        -> pipes in bbox from data/pipes/karak_pipes.geojson
GET  /api/spots/:id             -> spot + nearest pipe + land cover
POST /api/triage                -> Claude agent (tools above); SSE stream of tool calls + final JSON + usage
POST /api/workorder             -> Claude, facts-only, {ar, en, priority}
GET  /api/twin/mazar?scenario=  -> nodes/edges with pressure or drop
GET  /api/hf/model              -> data/hydrofingerprint/hf_live_model.json
GET  /api/hf/results            -> results + robustness + scale9
```
On any Claude error or missing key, return the recorded fallback with `source: "recorded"` and show a small "Recorded run" tag.

## README (graded: "explains how to run it")
Sections: what it is (2 lines) · screenshot · quick start (`npm i`, `cp .env.example .env`, `npm run fetch:pipes`, `npm run dev`, open URL) · works without an API key (recorded runs) · data sources with links and licences · what is REAL / SIMULATED / ASSUMED · architecture diagram (Mermaid: NISAR → pipeline → data/ → Hono API → React; Claude tool loop; in-browser HydroFingerprint) · AI methods and results table · limits · team.

## Build order (each step demoable and pushed; times start when you begin)
0. **(15 min)** Repo skeleton, `.gitignore` (data/pipes, .env, node_modules), README stub, public GitHub repo created and pushed. Give me the repo link.
1. **(80 min)** Overview map with real pipes, wet spots, radar overlay + spot detail. Push. Show me in the browser.
2. **(50 min)** HydroFingerprint screen with the live in-browser model and the "Why AI" panel. Push. Show me.
3. **(40 min)** AI triage with streaming tool log + fallback. Push.
   → **Stop here and tell me: "submit the rough version now."** We hand in early, then resubmit.
4. **(30 min)** Work order AR/EN + Arabic crew phone view + QR.
5. **(20 min)** Twin screen.
6. **(20 min)** Problem screen, Impact & business screen, Sources & method, demo mode with timer.
7. **(15 min)** Final pass: README complete, Arabic RTL check, Wi-Fi off check, no console errors, every number traced to a file, repo opens in a private/incognito window. Push.

## Acceptance checks
- Repo is public and opens logged-out; README quick start works from a fresh clone (with `fetch:pipes`); no `.env`, no raw pipes, no customers layer in git history.
- Turn Wi-Fi off: every screen loads; AI screens show recorded runs.
- Demo mode walks the full pitch in under 7:00 with arrow keys only.
- W7 shows "6 m from a ¾" galvanized iron service line, position ±50 m", land cover "Built area 2023–2025".
- W3 shows "open rangeland", not "built-up".
- HydroFingerprint with the 3 spread loggers shows about 50% on every gap; after AI-placed loggers, gaps A–D move toward certainty and Gap E stays "Can't tell yet" in most cases.
- The twin shows: leak at W7 moves 1 other junction > 1 m; the 15 L/s main break moves 788 of 850.
- Crew view is Arabic first and readable at 390 px width.
- The sources screen lists NASA/ASF, the ArcGIS item (no licence stated), Copernicus DEM, Open-Meteo ERA5, Sentinel-2 land cover, Petra (41% NRW).
- No JD or dollar figure appears anywhere unless it has a source.

Work in small steps. After each step, push, give me a URL I can open, and stop for my review if anything in `data/` looks inconsistent with `CLAUDE.md`.
