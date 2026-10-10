# Missing Blue · الأزرق المفقود

Free NASA–ISRO NISAR radar finds ground in Karak that turned wet and stayed wet through the dry season. We check every wet spot against the utility's **real pipe network**, an AI agent decides where the crew goes, and the AI writes a bilingual work order. AI Quest 2026 (HTU), Sector 2 next.society().

> Build in progress (10 Oct 2026). Full README with screenshots, architecture and results follows.

## Quick start
```bash
npm install
cp .env.example .env          # optional: ANTHROPIC_API_KEY for live AI (without it: recorded runs)
npm run fetch:pipes           # downloads the Karak network (layer 6 only) into data/pipes/ (not in git)
npm run dev                   # web on http://localhost:5173, API on :8787
```

## Data honesty
- REAL: NISAR radar (NASA/ISRO, provisional), Karak pipe network (public ArcGIS item, no licence stated: demo use only, not redistributed), Copernicus DEM, ERA5 rain (Open-Meteo), Sentinel-2 land cover.
- SIMULATED: pressure readings in HydroFingerprint.
- ASSUMED: hydraulic twin demand, tank levels, leak size.
- Wet spots are inspection candidates, never confirmed leaks. Position accuracy is about ±50 m.

Sources: [SOURCES.md](SOURCES.md) · Spec: [CLAUDE.md](CLAUDE.md) · Pitch: [PITCH_7MIN.md](PITCH_7MIN.md)
