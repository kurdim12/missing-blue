import json, sys, math, numpy as np, re
from scipy.spatial import cKDTree
pipes_path, spots_path, out_path = sys.argv[1:4]
fs = json.load(open(pipes_path))['features']; spots = json.load(open(spots_path))
lat0 = 31.13; kx = 111320*math.cos(math.radians(lat0)); ky = 110540
pts, lab = [], []
for i, f in enumerate(fs):
    g = f['geometry']
    if not g: continue
    c = np.array(g['coordinates'])
    for a, b in zip(c[:-1], c[1:]):          # densify every ~5 m
        d = math.hypot((b[0]-a[0])*kx, (b[1]-a[1])*ky); n = max(1, int(d/5))
        for t in np.linspace(0, 1, n+1): pts.append(((a[0]+(b[0]-a[0])*t)*kx, (a[1]+(b[1]-a[1])*t)*ky)); lab.append(i)
tree = cKDTree(np.array(pts)); lab = np.array(lab)
def describe(layer):
    m = re.match(r'^(\d+(?:-\d+)*)([A-Z]+)$', layer or '')
    if not m: return layer, None, None
    size = m.group(1).replace('-1-2', ' 1/2').replace('3-4', '3/4').replace('1-2', '1/2')
    mat = {'GI':'galvanized iron','ST':'steel','DI':'ductile iron','DIA':'ductile iron','PE':'polyethylene','BVC':'PVC'}.get(m.group(2), m.group(2))
    return f'{size}" {mat}', size, mat
for s in spots:
    d, j = tree.query((s['lon']*kx, s['lat']*ky)); f = fs[lab[j]]
    s['pipe_dist_m'] = round(float(d), 1); s['pipe_layer'] = f['properties'].get('Layer')
    s['pipe_desc'] = describe(s['pipe_layer'])[0]
    s['on_pipe'] = d <= 40
json.dump(spots, open(out_path, 'w'), ensure_ascii=False)
on = [s for s in spots if s['on_pipe']]
print(len(spots), 'candidates;', len(on), 'within 40 m of a real pipe')
for s in sorted(spots, key=lambda s: s['pipe_dist_m'])[:25]: print(s['rank'], s['lat'], s['lon'], s['kind'][:7], s['dHH_db'], s['dHV_db'], s['area_m2'], '| pipe', s['pipe_dist_m'], 'm', s['pipe_desc'])
