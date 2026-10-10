import json, sys, re, os
from PIL import Image, ImageDraw
pipes_path, out = sys.argv[1:3]
LON0, LON1, LAT0, LAT1 = map(float, os.environ["BBOX"].split(",")); NX, NY = int(os.environ["NX"]), int(os.environ["NY"])
S = 2  # supersample for crisp lines
im = Image.new('RGBA', (NX*S, NY*S), (0,0,0,0)); d = ImageDraw.Draw(im)
def cls(layer):
    m = re.match(r'^(\d+)', layer or ''); 
    if not m: return 'other'
    if re.match(r'^(1-2|3-4|1-1-2)', layer): return 'service'
    v = int(m.group(1))
    return 'trunk' if v >= 8 and v < 100 else ('main' if 4 <= v < 8 else ('dist' if v < 4 else 'other'))
style = {'trunk': ((255, 70, 70, 255), 4), 'main': ((255, 190, 60, 240), 3), 'dist': ((120, 230, 200, 210), 2), 'service': ((180, 200, 210, 150), 1), 'other': ((200, 160, 255, 200), 2)}
n = {}
order={'service':0,'other':1,'dist':2,'main':3,'trunk':4}
for f in sorted(json.load(open(pipes_path))['features'], key=lambda f: order[cls((f.get('properties') or {}).get('Layer'))]):
    g = f['geometry']
    if not g: continue
    c = cls(f['properties'].get('Layer')); n[c] = n.get(c, 0) + 1
    xy = [((lo-LON0)/(LON1-LON0)*NX*S, (LAT1-la)/(LAT1-LAT0)*NY*S) for lo, la in g['coordinates']]
    if all(x < -50 or x > NX*S+50 for x, _ in xy) or all(y < -50 or y > NY*S+50 for _, y in xy): continue
    col, w = style[c]; d.line(xy, fill=col, width=w*S//1)
im = im.resize((NX, NY), Image.LANCZOS); im.save(out); print(n)
