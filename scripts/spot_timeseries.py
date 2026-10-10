"""Per-spot radar time series for the site card (writes data/wet_spots/spot_timeseries.json).

For each wet spot W1-W7 in data/wet_spots/wet_spots.geojson this reads the public NISAR GeoTIFFs in data/radar/
(no pipe geometry is touched) and stores:
  window_100m  mean HH / HV backscatter (dB) per pass (4, 16, 28 Sep 2026) in a 100 m x 100 m window (5 x 5 px)
               centred on the spot pixel, and the mean HH / HV change vs 4 Sep in the same window (change TIFs,
               scene median already removed by pipeline/nisar_export.py)
  wet_pixels   the same numbers averaged over the spot's own persistent-wet pixels (the connected cluster in
               persistent_wet_mask.tif whose centroid is the spot centre). These are the pixels the wet rule
               (HH >= +2 dB and HV >= +1.5 dB at both later passes) selected, so they are what the trend chart shows.
  wet_px_within_100m  persistent-wet pixels whose centre lies within 100 m of the spot centre
  crop         an 800 m x 800 m (40 x 40 px) box around the spot in the PNG grid of public/radar (same grid as the TIFs),
               plus the spot centre inside it and the persistent-wet cells inside it (for the outline on the "after" image)
  check        cluster mean of (16 Sep + 28 Sep change) / 2 vs hh_rise_db / hv_rise_db in the spot file

Grid: EPSG:4326, lon 35.63-35.79, lat 31.03-31.24, 760 x 1160 px, north-up (~20 m/px). The pixel centres are the
linspace() samples used by pipeline/nisar_export.py (lon[i] = W + i (E-W)/(nx-1)), which is how the spot centres
were computed. Needs numpy + tifffile.  Run:  python scripts/spot_timeseries.py
"""
import json
import math
from pathlib import Path

import numpy as np
import tifffile

ROOT = Path(__file__).resolve().parents[1]
RADAR = ROOT / "data" / "radar"
SPOTS = ROOT / "data" / "wet_spots" / "wet_spots.geojson"
OUT = ROOT / "data" / "wet_spots" / "spot_timeseries.json"
BOUNDS_JSON = ROOT / "public" / "radar" / "bounds.json"

DATES = ["2026-09-04", "2026-09-16", "2026-09-28"]
T_HH, T_HV = 2.0, 1.5          # the wet rule's thresholds (pipeline/nisar_export.py)
WIN = 2                        # 5 x 5 px window = 100 m at 20 m/px
CROP_PX = 40                   # 40 px = 800 m
R_M = 100.0                    # radius for the persistent-wet pixel count


def read(name):
    return np.squeeze(tifffile.imread(RADAR / name)).astype("float64")


def rnd(v, d=2):
    return None if v is None or not np.isfinite(v) else round(float(v), d)


def components(mask):
    """4-connected components (same connectivity as scipy.ndimage.label default). Returns a label array."""
    lab = np.zeros(mask.shape, np.int32)
    n = 0
    H, W = mask.shape
    for r0, c0 in zip(*np.nonzero(mask)):
        if lab[r0, c0]:
            continue
        n += 1
        stack = [(r0, c0)]
        lab[r0, c0] = n
        while stack:
            r, c = stack.pop()
            for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= rr < H and 0 <= cc < W and mask[rr, cc] and not lab[rr, cc]:
                    lab[rr, cc] = n
                    stack.append((rr, cc))
    return lab, n


def main():
    bj = json.loads(BOUNDS_JSON.read_text(encoding="utf-8"))
    b = bj["bounds"]
    W_, S_, E_, N_ = b["west"], b["south"], b["east"], b["north"]
    nx, ny = bj["size"]

    hh = {d: read(f"nisar_hh_db_{d}.tif") for d in DATES}
    hv = {d: read(f"nisar_hv_db_{d}.tif") for d in DATES}
    dhh = {d: read(f"change_hh_db_{DATES[0]}_to_{d}.tif") for d in DATES[1:]}
    dhv = {d: read(f"change_hv_db_{DATES[0]}_to_{d}.tif") for d in DATES[1:]}
    pers_raw = np.squeeze(tifffile.imread(RADAR / "persistent_wet_mask.tif"))
    pers = pers_raw == 1
    assert hh[DATES[0]].shape == (ny, nx), (hh[DATES[0]].shape, (ny, nx))

    lon = np.linspace(W_, E_, nx)
    lat = np.linspace(N_, S_, ny)
    dlon, dlat = (E_ - W_) / (nx - 1), (N_ - S_) / (ny - 1)
    lab, n_lab = components(pers)

    fc = json.loads(SPOTS.read_text(encoding="utf-8"))
    spots_out, checks = [], []
    for f in fc["features"]:
        p = f["properties"]
        sid, slat, slon = p["spot_id"], p["lat"], p["lon"]
        fx = (slon - W_) / dlon          # fractional column of the spot centre (pixel-centre coordinates)
        fy = (N_ - slat) / dlat
        c, r = int(round(fx)), int(round(fy))
        m_per_px_x = dlon * 111320.0 * math.cos(math.radians(slat))
        m_per_px_y = dlat * 110574.0

        sl = (slice(r - WIN, r + WIN + 1), slice(c - WIN, c + WIN + 1))
        win = {
            "hh_db": {d: rnd(np.nanmean(hh[d][sl])) for d in DATES},
            "hv_db": {d: rnd(np.nanmean(hv[d][sl])) for d in DATES},
            "hh_change_db": {DATES[0]: 0.0, **{d: rnd(np.nanmean(dhh[d][sl])) for d in DATES[1:]}},
            "hv_change_db": {DATES[0]: 0.0, **{d: rnd(np.nanmean(dhv[d][sl])) for d in DATES[1:]}},
            "px": int((2 * WIN + 1) ** 2),
        }

        # the spot's own cluster: the component whose centroid (linspace coords) is the spot centre
        best, best_d = None, 1e9
        for k in np.unique(lab[max(r - 30, 0): r + 31, max(c - 30, 0): c + 31]):
            if k == 0:
                continue
            ii, jj = np.nonzero(lab == k)
            dd = abs(lat[ii].mean() - slat) + abs(lon[jj].mean() - slon)
            if dd < best_d:
                best, best_d = k, dd
        ii, jj = np.nonzero(lab == best)
        cl_lat, cl_lon = float(lat[ii].mean()), float(lon[jj].mean())
        wet = {
            "px": int(ii.size),
            "area_m2": int(ii.size * 400),
            "centroid_offset_m": rnd(math.hypot((cl_lat - slat) * 110574.0, (cl_lon - slon) * 111320.0 * math.cos(math.radians(slat))), 1),
            "hh_db": {d: rnd(np.nanmean(hh[d][ii, jj])) for d in DATES},
            "hv_db": {d: rnd(np.nanmean(hv[d][ii, jj])) for d in DATES},
            "hh_change_db": {DATES[0]: 0.0, **{d: rnd(np.nanmean(dhh[d][ii, jj])) for d in DATES[1:]}},
            "hv_change_db": {DATES[0]: 0.0, **{d: rnd(np.nanmean(dhv[d][ii, jj])) for d in DATES[1:]}},
        }
        mean_dh = np.nanmean(np.nanmean([dhh[d][ii, jj] for d in DATES[1:]], 0))
        mean_dv = np.nanmean(np.nanmean([dhv[d][ii, jj] for d in DATES[1:]], 0))

        # persistent-wet pixels within 100 m of the spot centre
        rr, cc = np.nonzero(pers[max(r - 8, 0): r + 9, max(c - 8, 0): c + 9])
        rr = rr + max(r - 8, 0)
        cc = cc + max(c - 8, 0)
        dist = np.hypot((rr - fy) * m_per_px_y, (cc - fx) * m_per_px_x)
        n100 = int((dist <= R_M).sum())

        # 800 m crop in the PNG grid (integer pixel edges). PNG pixel i spans [i, i+1); its centre (i + 0.5) is lon[i].
        x0, y0 = c - CROP_PX // 2, r - CROP_PX // 2
        ya, xa = max(y0, 0), max(x0, 0)     # the crop may run past the grid edge (W4 is ~50 px from the south edge)
        cells = [[int(j + xa - x0), int(i + ya - y0)] for i, j in zip(*np.nonzero(pers[ya: y0 + CROP_PX, xa: x0 + CROP_PX]))]
        inside = max(0, min(x0 + CROP_PX, nx) - xa) * max(0, min(y0 + CROP_PX, ny) - ya) / CROP_PX ** 2
        crop = {
            "png_px": {"x": x0, "y": y0, "w": CROP_PX, "h": CROP_PX},
            "spot_in_crop_px": {"x": rnd(fx + 0.5 - x0, 2), "y": rnd(fy + 0.5 - y0, 2)},
            "m_per_px": {"x": rnd(m_per_px_x, 2), "y": rnd(m_per_px_y, 2)},
            "size_m": {"x": rnd(CROP_PX * m_per_px_x, 0), "y": rnd(CROP_PX * m_per_px_y, 0)},
            "lonlat": {"west": rnd(W_ + (x0 - 0.5) * dlon, 6), "east": rnd(W_ + (x0 + CROP_PX - 0.5) * dlon, 6),
                       "north": rnd(N_ - (y0 - 0.5) * dlat, 6), "south": rnd(N_ - (y0 + CROP_PX - 0.5) * dlat, 6)},
            "inside_grid_frac": rnd(inside, 3),
            "wet_cells": cells,
        }

        chk = {
            "spot_id": sid,
            "file_hh_rise_db": p["hh_rise_db"], "cluster_mean_hh_db": rnd(mean_dh),
            "file_hv_rise_db": p["hv_rise_db"], "cluster_mean_hv_db": rnd(mean_dv),
            "file_area_m2": p["area_m2"], "cluster_area_m2": wet["area_m2"],
            "hh_28sep_cluster": wet["hh_change_db"][DATES[2]], "hv_28sep_cluster": wet["hv_change_db"][DATES[2]],
            "hh_28sep_window": win["hh_change_db"][DATES[2]], "hv_28sep_window": win["hv_change_db"][DATES[2]],
        }
        chk["match"] = (abs(chk["cluster_mean_hh_db"] - p["hh_rise_db"]) <= 0.02 and abs(chk["cluster_mean_hv_db"] - p["hv_rise_db"]) <= 0.02
                        and wet["area_m2"] == p["area_m2"])
        checks.append(chk)
        spots_out.append({"spot_id": sid, "lat": slat, "lon": slon, "pixel": {"col": c, "row": r},
                          "window_100m": win, "wet_pixels": wet, "wet_px_within_100m": n100, "crop": crop})

    out = {
        "name": "nisar_spot_timeseries",
        "passes": DATES,
        "baseline": DATES[0],
        "thresholds_db": {"hh": T_HH, "hv": T_HV},
        "params": {"window_px": 2 * WIN + 1, "window_m": (2 * WIN + 1) * 20, "radius_m": R_M, "crop_px": CROP_PX, "crop_m": CROP_PX * 20, "position_accuracy_m": 50},
        "grid": {"crs": "EPSG:4326", "bounds": b, "size_px": [nx, ny], "m_per_px": 20, "pixel_centres": "linspace(west, east, nx) / linspace(north, south, ny)"},
        "images": {"before": f"hh_{DATES[0]}.png", "after": f"hh_{DATES[2]}.png", "dir": "public/radar", "grey_scale_db": [-25, 5]},
        "spots": spots_out,
        "check": checks,
        "source": "NISAR L2 GCOV PROVISIONAL, track 151 frame 73 (NASA/ISRO, ASF DAAC); TIFs from pipeline/nisar_export.py",
        "notes": [
            "Computed by scripts/spot_timeseries.py from data/radar/*.tif and data/wet_spots/wet_spots.geojson. No pipe data used.",
            "Change = dB vs 2026-09-04 with the scene-wide median removed (pipeline/nisar_export.py). 4 Sep is the baseline, so its change is 0 by definition.",
            "window_100m = mean over the 5 x 5 px (100 m x 100 m) window centred on the spot pixel; small spots are diluted by dry pixels.",
            "wet_pixels = mean over the spot's own persistent-wet cluster (the pixels the wet rule selected); its mean over both later passes reproduces hh_rise_db / hv_rise_db in the spot file (see check).",
            "Radar position is +/-50 m: the crop centre is the cluster centroid, not a measured leak point.",
        ],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes), {len(spots_out)} spots, {n_lab} wet clusters in scene")
    print("spot  file_HH clus_HH | file_HV clus_HV | area file/clus | 28Sep HH clus/win | 28Sep HV clus/win | wet<=100m | match")
    for ch, s in zip(checks, spots_out):
        print(f"{ch['spot_id']:4}  {ch['file_hh_rise_db']:6} {ch['cluster_mean_hh_db']:6} | {ch['file_hv_rise_db']:6} {ch['cluster_mean_hv_db']:6} | "
              f"{ch['file_area_m2']:6}/{ch['cluster_area_m2']:<6} | {ch['hh_28sep_cluster']:6} {ch['hh_28sep_window']:6} | "
              f"{ch['hv_28sep_cluster']:6} {ch['hv_28sep_window']:6} | {s['wet_px_within_100m']:3} | {ch['match']}")


if __name__ == "__main__":
    main()
