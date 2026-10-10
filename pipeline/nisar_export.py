import h5py, sys, os, json, numpy as np
from pyproj import Transformer
from scipy.ndimage import uniform_filter, label, map_coordinates, binary_erosion
from PIL import Image
files, OUT = sys.argv[1:-1], sys.argv[-1]          # files in date order
os.makedirs(OUT, exist_ok=True)
LON0, LON1, LAT0, LAT1 = map(float, os.environ["BBOX"].split(","))
nx, ny = int(os.environ["NX"]), int(os.environ["NY"])
lon = np.linspace(LON0, LON1, nx); lat = np.linspace(LAT1, LAT0, ny)
LO, LA = np.meshgrid(lon, lat)
def load(p):
    f = h5py.File(p, 'r'); g = f['science/LSAR/GCOV/grids/frequencyA']
    epsg = int(g['projection'][()]); xs = g['xCoordinates'][()]; ys = g['yCoordinates'][()]
    tx, ty = Transformer.from_crs(4326, epsg, always_xy=True).transform(LO, LA)
    cf = (tx - xs[0]) / (xs[1]-xs[0]); rf = (ty - ys[0]) / (ys[1]-ys[0])
    ca, cb = int(max(cf.min()-40,0)), int(min(cf.max()+40, len(xs))); ra, rb = int(max(rf.min()-40,0)), int(min(rf.max()+40, len(ys)))
    hh = g['HHHH'][ra:rb, ca:cb].astype('f8'); hv = g['HVHV'][ra:rb, ca:cb].astype('f8')
    bad = ~np.isfinite(hh) | (hh <= 0) | ~np.isfinite(hv) | (hv <= 0)
    def flt(a):
        a = np.where(bad, 0, a); w = uniform_filter((~bad).astype(float), 5)
        return uniform_filter(a, 5) / np.maximum(w, 1e-6)
    good = binary_erosion(~bad, iterations=25)      # drop 500 m at swath / no-data edges
    R, C = rf - ra, cf - ca
    rp = lambda a, o=1: map_coordinates(a, [R, C], order=o, mode='constant', cval=0)
    HH = 10*np.log10(np.maximum(rp(flt(hh)), 1e-6)); HV = 10*np.log10(np.maximum(rp(flt(hv)), 1e-6))
    G = rp(good.astype(float), 0) > 0.5
    return HH, HV, G, os.path.basename(p)
D = [load(p) for p in files]
dates = [n.split('_')[11][:8] for *_, n in D]
dates = [f'{d[:4]}-{d[4:6]}-{d[6:]}' for d in dates]
valid = np.logical_and.reduce([g for *_, g, _ in D])
HH0, HV0 = D[0][0], D[0][1]
chg = []
for HH, HV, _, _ in D[1:]:
    dh = HH - HH0; dv = HV - HV0
    dh -= np.median(dh[valid]); dv -= np.median(dv[valid])    # remove scene-wide calibration offset
    dh[~valid] = np.nan; dv[~valid] = np.nan; chg.append((dh, dv))
# base images
for (HH, _, _, _), d in zip(D, dates):
    v = np.clip((HH + 25) / 30, 0, 1); img = (v*255).astype(np.uint8); img[~valid] = 0
    Image.fromarray(img, 'L').save(f'{OUT}/hh_{d}.png')
# per-pass wet change frames for the time-lapse
for k, (dh, dv) in enumerate(chg, 1):
    m_ = (dh >= 2.0) & (dv >= 1.5)
    fr = np.zeros((ny, nx, 4), np.uint8); fr[m_] = [40, 150, 255, 200]
    Image.fromarray(fr, 'RGBA').save(f'{OUT}/wet_{dates[k]}.png')
# persistent wetting: HH and HV both up vs first date, at EVERY later date
T_HH, T_HV = 2.0, 1.5
pers = np.logical_and.reduce([(dh >= T_HH) & (dv >= T_HV) for dh, dv in chg])
mean_dh = np.nanmean([dh for dh, _ in chg], 0); mean_dv = np.nanmean([dv for _, dv in chg], 0)
# overlay: blue = persistent wet anomaly, faint orange = drying
rgba = np.zeros((ny, nx, 4), np.uint8)
s = np.clip((np.nan_to_num(mean_dh) - T_HH) / 4, 0, 1)
rgba[pers] = np.c_[np.full(pers.sum(), 30), (140+100*s[pers]).astype(int), np.full(pers.sum(), 255), (150+105*s[pers]).astype(int)]
dry = np.logical_and.reduce([(dh <= -T_HH) & (dv <= -T_HV) for dh, dv in chg]) & valid
rgba[dry] = [240, 140, 40, 110]
Image.fromarray(rgba, 'RGBA').save(f'{OUT}/persistent_wet.png')
# clusters
lab, n = label(pers); spots = []
for i in range(1, n+1):
    ii, jj = np.where(lab == i); k = ii.size
    if k < 4: continue
    kind = 'compact (leak-sized)' if k <= 60 else ('medium' if k <= 250 else 'large (likely construction / irrigation / land change)')
    spots.append({'lat': round(float(lat[ii].mean()), 5), 'lon': round(float(lon[jj].mean()), 5), 'pixels': int(k), 'area_m2': int(k*400),
                  'dHH_db': round(float(np.nanmean(mean_dh[ii, jj])), 2), 'dHV_db': round(float(np.nanmean(mean_dv[ii, jj])), 2), 'kind': kind})
spots.sort(key=lambda s: (s['kind'].startswith('compact'), s['dHH_db'] + s['dHV_db']), reverse=True)
for k, s_ in enumerate(spots, 1): s_['rank'] = k
json.dump(spots, open(f'{OUT}/hotspots.json', 'w'))
with open(f'{OUT}/hotspots.csv', 'w') as fh:
    fh.write('rank,lat,lon,area_m2,dHH_db,dHV_db,kind,google_maps\n')
    for s_ in spots: fh.write(f"{s_['rank']},{s_['lat']},{s_['lon']},{s_['area_m2']},{s_['dHH_db']},{s_['dHV_db']},{s_['kind']},https://maps.google.com/?q={s_['lat']},{s_['lon']}\n")
stats = {'dates': dates, 'valid_frac': round(float(valid.mean()), 3), 'persistent_wet_px': int(pers.sum()), 'persistent_wet_frac': round(float(pers.sum()/valid.sum()), 4),
         'n_clusters': len(spots), 'n_compact': sum(s_['kind'].startswith('compact') for s_ in spots), 'bounds': [LAT0, LON0, LAT1, LON1],
         'dHH_p95': [round(float(np.nanpercentile(dh, 95)), 2) for dh, _ in chg]}
json.dump(stats, open(f'{OUT}/stats.json', 'w'), indent=1); print(json.dumps(stats, indent=1)); print(json.dumps(spots[:12], indent=0))

# ---- GeoTIFF export (EPSG:4326, north-up, same grid as the PNGs) ----
import rasterio
from rasterio.transform import from_bounds
TIF = os.environ['TIFDIR']; os.makedirs(TIF, exist_ok=True)
tr = from_bounds(LON0, LAT0, LON1, LAT1, nx, ny)
def wtif(name, arr, dtype='float32', nodata=np.nan, desc=''):
    a = arr.astype(dtype)
    with rasterio.open(f'{TIF}/{name}', 'w', driver='GTiff', height=ny, width=nx, count=1, dtype=dtype, crs='EPSG:4326', transform=tr, nodata=nodata, compress='deflate') as ds:
        ds.write(a, 1); ds.set_band_description(1, desc)
for (HH, HV, G, _), d in zip(D, dates):
    h = HH.copy(); h[~valid] = np.nan; v = HV.copy(); v[~valid] = np.nan
    wtif(f'nisar_hh_db_{d}.tif', h, desc=f'NISAR GCOV HH backscatter (dB, 100 m boxcar) {d}')
    wtif(f'nisar_hv_db_{d}.tif', v, desc=f'NISAR GCOV HV backscatter (dB, 100 m boxcar) {d}')
for (dh, dv), d in zip(chg, dates[1:]):
    wtif(f'change_hh_db_{dates[0]}_to_{d}.tif', dh, desc=f'HH change dB vs {dates[0]}, scene median removed')
    wtif(f'change_hv_db_{dates[0]}_to_{d}.tif', dv, desc=f'HV change dB vs {dates[0]}, scene median removed')
wtif('persistent_wet_mask.tif', pers.astype('uint8'), dtype='uint8', nodata=255, desc='1 = HH>=+2dB and HV>=+1.5dB at both later passes')
print('tifs written to', TIF)
