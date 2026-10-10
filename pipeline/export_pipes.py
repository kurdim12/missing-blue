import json, re, sys
from shapely.geometry import LineString
SRC, OUT = sys.argv[1:3]; LAT0, LAT1, LON0, LON1 = 31.03, 31.24, 35.63, 35.79
def cls(layer):
    m = re.match(r'^(\d+(?:-\d+)*)([A-Z]+)$', layer or '')
    if not m: return None
    s = m.group(1); inch = {'1-2': .5, '3-4': .75, '1-1-2': 1.5}.get(s)
    if inch is None:
        try: inch = float(s)
        except: return None
    mat = {'DIA': 'DI', 'BVC': 'PVC'}.get(m.group(2), m.group(2)); return inch, mat
out = []; km = 0
for f in json.load(open(SRC))['features']:
    g = f['geometry']; c = cls(f['properties'].get('Layer'))
    if not g or not c: continue
    pts = g['coordinates']
    if not any(LAT0-0.01 <= la <= LAT1+0.01 and LON0-0.01 <= lo <= LON1+0.01 for lo, la in pts): continue
    ls = LineString(pts).simplify(0.00002)    # ~2 m
    out.append([c[0], c[1], [[round(x, 5), round(y, 5)] for x, y in ls.coords]])
out.sort(key=lambda r: r[0])
json.dump(out, open(OUT, 'w'), separators=(',', ':')); print(len(out), 'pipes')
