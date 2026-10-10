"""Convert the NISAR GeoTIFFs in data/radar/ to PNG overlays in public/radar/ (run once; the PNGs are committed).

All rasters share one grid: EPSG:4326, lon 35.63-35.79, lat 31.03-31.24, 760 x 1160 px, north-up.
  hh_<date>.png        HH backscatter in dB, grey (-25 dB black .. +5 dB white), transparent where no data
  change_hh_<date>.png HH rise vs 2026-09-04 (scene median removed): transparent below +1 dB, cyan->blue up to +4 dB
  change_hv_<date>.png same for HV
  wet_mask.png         persistent wet pixels (wet at both later passes)
Needs numpy, Pillow, tifffile.
"""
import json
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / "data" / "radar", ROOT / "public" / "radar"
BOUNDS = {"west": 35.63, "south": 31.03, "east": 35.79, "north": 31.24}


def read(name):
    a = tifffile.imread(SRC / name).astype("float32")
    return np.squeeze(a)


def save(rgba, name):
    Image.fromarray(rgba, "RGBA").save(OUT / name, optimize=True)


def grey(db):
    ok = np.isfinite(db)
    v = np.clip((np.nan_to_num(db, nan=-25.0) + 25.0) / 30.0, 0, 1)
    g = (v * 255).astype("uint8")
    a = np.where(ok, 255, 0).astype("uint8")
    return np.dstack([g, g, g, a])


def change(db, lo=1.0, hi=4.0):
    ok = np.isfinite(db) & (np.nan_to_num(db) >= lo)
    t = np.clip((np.nan_to_num(db) - lo) / (hi - lo), 0, 1)
    r = (40 * (1 - t)).astype("uint8")
    g = (220 - 120 * t).astype("uint8")
    b = np.full(db.shape, 255, "uint8")
    a = np.where(ok, (110 + 145 * t).astype("uint8"), 0).astype("uint8")
    return np.dstack([r, g, b, a])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for date in ("2026-09-04", "2026-09-16", "2026-09-28"):
        save(grey(read(f"nisar_hh_db_{date}.tif")), f"hh_{date}.png")
        made.append(f"hh_{date}.png")
    for date in ("2026-09-16", "2026-09-28"):
        for pol in ("hh", "hv"):
            src = f"change_{pol}_db_2026-09-04_to_{date}.tif"
            lo = 2.0 if pol == "hh" else 1.5  # the wet rule's thresholds: HH >= +2 dB, HV >= +1.5 dB
            save(change(read(src), lo=lo, hi=lo + 3.0), f"change_{pol}_{date}.png")
            made.append(f"change_{pol}_{date}.png")
    mask = read("persistent_wet_mask.tif") > 0
    rgba = np.zeros(mask.shape + (4,), "uint8")
    rgba[mask] = (0, 229, 255, 255)
    save(rgba, "wet_mask.png")
    made.append("wet_mask.png")
    (OUT / "bounds.json").write_text(json.dumps({"bounds": BOUNDS, "size": [760, 1160], "files": made,
                                                 "source": "NISAR L2 GCOV PROVISIONAL, track 151 frame 73 (NASA/ISRO, ASF DAAC)"}, indent=2))
    print("wrote", len(made), "overlays to", OUT)


if __name__ == "__main__":
    main()
