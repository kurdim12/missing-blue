# Missing Blue: full user journey

Missing Blue helps a Jordanian water utility find hidden leaks and fix its own pipe records, using free satellite radar, its existing pipe drawings, physics-guided AI and a few pressure loggers.

**Status labels used below**
- **[REAL]** works today on real public data in `data/`
- **[SIM]** works today, but the input is simulated (pressure readings)
- **[BUILD]** to be built in the platform for the demo
- **[NEXT]** after the hackathon; needs a utility partner

---

## Who uses it

| Persona | Role | What they need | Device |
|---|---|---|---|
| **Rana**, NRW engineer, Karak water office | Owns non-revenue water targets for Karak, Mu'tah and Mazar | Where to send the leak crew this week, and why | Laptop, office |
| **Abu Khaled**, field crew leader | Runs the acoustic leak-detection crew | A clear job: where, which pipe, what to check | Phone, in the truck |
| **Sami**, GIS / network records officer | Keeps the pipe map; knows it has gaps | Which gaps in the drawing are real connections, and where to measure to find out | Laptop |
| **Judge** at AI Quest | Evaluates the AI, the data and the impact | See real data, see the AI decide, check the sources | Laptop or projector |

---

## Journey 1: Rana finds leaks after a satellite pass (core loop)

| # | Stage | What Rana does | What she sees | AI / data behind it | Status |
|---|---|---|---|---|---|
| 1 | **Trigger** | Gets a notice: "New NISAR pass over Karak, 28 Sep 2026" | Notification with pass date and area | NISAR passes every 12 days; ASF granule list | [NEXT] auto-ingest; [REAL] the 3 passes we have |
| 2 | **Overview** | Opens Missing Blue | Map of Karak: real pipes coloured by size, 7 wet spots, headline "7 spots wet on both passes, 0 mm rain between them" | `wet_spots.geojson`, `karak_pipes.geojson`, ERA5 rain check | [REAL] data, [BUILD] screen |
| 3 | **Understand the signal** | Toggles the radar layer and the 3-date slider | Radar image (bright = buildings), wet change appearing on 16 Sep and staying on 28 Sep | `data/radar/*.tif` change maps | [REAL] data, [BUILD] slider |
| 4 | **AI triage** | Clicks "Triage with AI" | For each spot: Dispatch / Reject, priority and a one-line reason with numbers. 2 dispatched (W7 high, W3 medium), 5 rejected as farmland | Claude agent with tools: `list_wet_spots`, `nearest_pipe`, `land_cover`, `simulate_leak` | [REAL] inputs, [BUILD] endpoint |
| 5 | **Inspect a spot** | Opens W7 | Spot card: radar rise HH +2.4 / HV +1.8 dB; 6 m from a ¾" galvanized iron service line (±50 m position accuracy); built-up land 2023–2025; Google Maps link | wet spot + pipe match + Sentinel-2 land cover | [REAL] |
| 6 | **Why not just use pressure loggers?** | Clicks "Check in hydraulic twin" | Mazar twin: leak at W7 moves pressure at 1 other junction; a main break moves 788 of 850. Message: "Loggers would miss this leak; the radar found it" | EPANET twin (`data/twin/`) | [REAL] geometry, [SIM] operation (assumed demand, tank) |
| 7 | **Dispatch** | Clicks "Create work order" (Arabic / English) | Work order MB-KRK-0007: location, pipe, evidence, what to check, estimated loss 86 m³/day if 1 L/s | Claude writes from facts only, numbers copied exactly | [BUILD] |
| 8 | **Track** | Sees the order in a list | Status: Sent → In progress → Confirmed / Not found | Simple work-order table | [BUILD] minimal |
| 9 | **Learn** | Crew result comes back | Spot marked "Confirmed leak" or "No leak (garden)". Rule and model thresholds tuned on confirmed outcomes | Labels feed retraining | [NEXT] (no confirmed leaks exist yet) |

**Success for Rana:** the crew visits 2 places instead of walking 1,287 km of pipe; each visit has a reason she can defend to her manager.

---

## Journey 2: Abu Khaled executes the job (field)

| # | Stage | What he does | What he sees | Status |
|---|---|---|---|---|
| 1 | Receives job | Opens the link on his phone | Arabic work order first, map pin, "Open in Google Maps" | [BUILD] mobile view |
| 2 | Navigates | Drives to al-Mazar al-Janubi, west edge | Pin and the ±50 m search circle around it, the ¾" service line highlighted | [BUILD] |
| 3 | Searches | Walks the line inside the circle with the ground microphone | Checklist: wet soil, sunken asphalt, green growth, meter box night flow | [BUILD] checklist |
| 4 | Reports | Taps "Leak found" / "No leak" + photo + note | Confirmation sent to Rana | [BUILD] form (local only for demo) / [NEXT] real backend |

**Success for Abu Khaled:** one screen, Arabic, no GIS knowledge needed.

---

## Journey 3: Sami fixes the pipe record (HydroFingerprint)

| # | Stage | What Sami does | What he sees | AI / data behind it | Status |
|---|---|---|---|---|---|
| 1 | **See the problem** | Opens "Network records" | 107 gaps in the Mazar system: pipe ends 1–8 m from another pipe; nobody knows which are connected | Gap finder on the real drawing (`hf_gaps.py`) | [REAL] |
| 2 | **Choose what matters** | Sorts gaps by hydraulic impact | 5 medium-impact gaps highlighted (A–E) | EPANET: close each gap, count junctions that move > 0.5 m | [REAL] network, [SIM] pressures |
| 3 | **Plan measurements** | Has 3 loggers already; clicks "Where should I add loggers?" | AI places loggers one by one near the gaps, each with "expected doubt removed: X bits" | Information-gain placement on the Bayesian model | [SIM], [BUILD] in platform (already working in demo) |
| 4 | **Read the result** | Loads logger readings (demo: one of 24 hidden test networks) | Per gap: probability connected, verdict Connected / Not connected / Can't tell yet | Bayesian posterior over 32 network states, computed in the browser | [SIM] |
| 5 | **Trust check** | Opens "How sure is this?" | When the AI says ≥ 90%, it is right 99%+; it beats the plain algorithm (46.9% vs 26.7% all-five; 45.4% vs 23.9% on a mismatched network) | `hydrofingerprint_robustness.json`, baseline | [SIM] |
| 6 | **Act** | For "Can't tell" gaps (Gap E) | Field instruction: "Pressure cannot decide; check the valve chamber at this point" | Claude writes the field note | [BUILD] |
| 7 | **Update the map** | Marks confirmed connections | GIS record updated, gap closed | [NEXT] write back to utility GIS |

**Success for Sami:** a verified network map without digging up streets, and a measurement plan that costs 7 loggers instead of dozens.

---

## Journey 4: the judging panel (7 minutes + 3 minutes Q&A, official format)

Panel: domain, AI/technical and business judges. Full script and Q&A by judge in `PITCH_7MIN.md`.

| Time | Screen | Criterion it scores | What the panel sees |
|---|---|---|---|
| 0:00 | Problem | Impact on Jordan | 41% non-revenue water (Petra, Aug 2026); who is left out: networks with no sensor data |
| 0:40 | Problem | Technical (honesty) | One-line solution; "real data except simulated pressure readings" |
| 1:00 | Overview: radar | Innovation | NISAR time-lapse 4 → 16 → 28 Sep; 7 spots stay wet; 0 mm rain |
| 1:40 | Overview: pipes | Impact | 1,287 km of the real Karak network |
| 2:00 | AI triage | Innovation, Technical | Claude tool log; 2 dispatched, 5 rejected, each with a reason |
| 2:40 | Twin | Technical | Leak at W7 moves 1 junction; main break moves 788 of 850 (operation ASSUMED) |
| 3:10 | HydroFingerprint (a judge taps) | Innovation, Technical | Live logger placement, bits removed, "can't tell" on Gap E; AI vs plain algorithm |
| 4:20 | Crew phone view | UX & Design (Arabic) | Arabic work order, ±50 m circle, checklist, two buttons |
| 5:00 | Impact & business | Feasibility & Scalability | Data cost 0, every 12 days; 86.4 m³/day per 1 L/s leak; 2 sites vs 1,287 km; who pays (PLAN) |
| 6:10 | Sources & method | Technical (honesty) | Every source, assumptions, limits |
| 6:50 | Next step | Presentation & Pitch | Karak pilot: crew checks W7 and W3; results become labels |

---

## Honesty rules shown in every journey
- Wet spots are inspection candidates, not confirmed leaks.
- Radar position is accurate to about ±50 m.
- Pressure readings in HydroFingerprint are simulated; the method is proven under known truth, not yet in the field.
- The pipe record (2020/2022) has no stated licence; demo use only.
- Twin demand and tank levels are assumptions.
