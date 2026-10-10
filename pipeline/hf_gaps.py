# HydroFingerprint step 1: real ambiguous gaps in the Karak CAD network around Mazar (W7)
import json, re, math, collections, pickle, sys, numpy as np, networkx as nx, rasterio
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
from shapely.ops import substring
from scipy.ndimage import median_filter
D = sys.argv[1]
fwd = Transformer.from_crs(4326, 32636, always_xy=True); inv = Transformer.from_crs(32636, 4326, always_xy=True)
cx, cy = fwd.transform(35.68692, 31.05727); R = 2600
def parse(layer):
    m = re.match(r'^(\d+(?:-\d+)*)([A-Z]+)$', layer or '')
    if not m: return None
    s, mat = m.group(1), {'DIA':'DI','BVC':'PVC'}.get(m.group(2), m.group(2))
    inch = {'1-2': .5, '3-4': .75, '1-1-2': 1.5}.get(s)
    if inch is None:
        try: inch = float(s)
        except: return None
    return inch, mat, {'GI':100,'ST':110,'DI':130,'PE':140,'PVC':140}.get(mat, 110)
lines = []
for f in json.load(open(f'{D}/Karak_Water_Network/karak_water_network_2020.geojson'))['features']:
    g = f['geometry']; p = parse(f['properties'].get('Layer'))
    if not g or not p: continue
    xs, ys = fwd.transform([q[0] for q in g['coordinates']], [q[1] for q in g['coordinates']])
    ls = LineString(list(zip(xs, ys)))
    if ls.length < 0.5 or ls.distance(Point(cx, cy)) > R: continue
    lines.append({'geom': ls, 'inch': p[0], 'mat': p[1], 'C': p[2], 'layer': f['properties'].get('Layer')})
tree = STRtree([l['geom'] for l in lines])
STRICT, LOOSE = 1.0, 8.0
splits = collections.defaultdict(list); cands = []
for i, l in enumerate(lines):
    for end in (0, -1):
        pt = Point(l['geom'].coords[end]); best = None
        for j in tree.query(pt.buffer(LOOSE)):
            if j == i: continue
            d = lines[j]['geom'].distance(pt)
            if best is None or d < best[0]: best = (d, j)
        if best is None: continue
        d, j = best
        if d > LOOSE: continue                      # real distance check (bbox query is not enough)
        g = lines[j]['geom']; s = g.project(pt); q = g.interpolate(s)
        if 0.3 < s < g.length - 0.3: splits[j].append(s)
        if d > STRICT:            # an ambiguous gap: drawn ends do not touch
            cands.append({'line': i, 'end': end, 'target': j, 'd': round(d, 2), 'p': (pt.x, pt.y), 'q': (q.x, q.y)})
# strict network: split lines at projection points, snap ends within 1 m
SN = STRICT; grid = collections.defaultdict(list); node_xy = []
def node_of(xy):
    gx, gy = int(xy[0] // SN), int(xy[1] // SN)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for k in grid[(gx+dx, gy+dy)]:
                if math.hypot(node_xy[k][0]-xy[0], node_xy[k][1]-xy[1]) <= SN: return k
    k = len(node_xy); node_xy.append(xy); grid[(int(xy[0] // SN), int(xy[1] // SN))].append(k); return k
G = nx.Graph()
for i, l in enumerate(lines):
    pos = [0.0] + sorted(set(round(s, 2) for s in splits.get(i, []))) + [l['geom'].length]
    for a, b in zip(pos[:-1], pos[1:]):
        if b - a < 0.2: continue
        sg = substring(l['geom'], a, b); u = node_of(sg.coords[0]); v = node_of(sg.coords[-1])
        if u == v: continue
        if G.has_edge(u, v) and G[u][v]['length'] <= sg.length: continue
        G.add_edge(u, v, length=sg.length, inch=l['inch'], mat=l['mat'], C=l['C'], layer=l['layer'], gap=False, coords=list(sg.coords))
# candidate gap links as explicit short pipes
gl = []
for k, c in enumerate(cands):
    u = node_of(c['p']); v = node_of(c['q'])
    if u == v or G.has_edge(u, v): continue
    inch = min(lines[c['line']]['inch'], lines[c['target']]['inch'])
    G.add_edge(u, v, length=max(c['d'], 0.5), inch=inch, mat='GAP', C=110, layer='GAP', gap=True, gap_id=len(gl), coords=[c['p'], c['q']])
    gl.append({**c, 'u': u, 'v': v, 'inch': inch})
w7 = min(G.nodes, key=lambda k: math.hypot(node_xy[k][0]-cx, node_xy[k][1]-cy))
comp = next(cc for cc in nx.connected_components(G) if w7 in cc); Z = G.subgraph(comp).copy()
bridges = set(map(frozenset, nx.bridges(Z)))
inz = [g for g in gl if g['u'] in comp and g['v'] in comp]
loop = [g for g in inz if frozenset((g['u'], g['v'])) not in bridges]
print('lines', len(lines), 'gap candidates', len(gl), 'in W7 system', len(inz), 'loop-closing (testable by pressure)', len(loop), 'bridges (would cut supply)', len(inz)-len(loop))
print('W7 system: nodes', Z.number_of_nodes(), 'pipes', Z.number_of_edges(), 'km', round(sum(d['length'] for *_, d in Z.edges(data=True))/1000, 1))
print('loop gap sizes m', sorted(g['d'] for g in loop)[:40])
with rasterio.open(f'{D}/Karak_Water_Network/Copernicus_DSM_COG_10_N31_00_E035_00_DEM.tif') as ds:
    arr = median_filter(ds.read(1).astype(float), size=5)
    lon, lat = inv.transform([p[0] for p in node_xy], [p[1] for p in node_xy])
    r, c = rasterio.transform.rowcol(ds.transform, lon, lat)
    elev = arr[np.clip(r, 0, arr.shape[0]-1), np.clip(c, 0, arr.shape[1]-1)]
pickle.dump({'Z': Z, 'node_xy': node_xy, 'lon': lon, 'lat': lat, 'elev': elev, 'loop': loop, 'w7': w7}, open('hf_graph.pkl', 'wb'))
