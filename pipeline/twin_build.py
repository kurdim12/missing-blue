# Build a hydraulic network (topology) from the real Karak CAD pipe export.
import json, re, sys, math, collections, numpy as np, pickle
from pyproj import Transformer
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
from shapely.ops import substring
import networkx as nx, rasterio
SRC, DEM, OUT = sys.argv[1:4]
LAT0, LAT1, LON0, LON1 = 31.03, 31.24, 35.63, 35.79
fwd = Transformer.from_crs(4326, 32636, always_xy=True); inv = Transformer.from_crs(32636, 4326, always_xy=True)
def parse(layer):
    m = re.match(r'^(\d+(?:-\d+)*)([A-Z]+)$', layer or '')
    if not m: return None
    s, mat = m.group(1), m.group(2)
    inch = {'1-2': .5, '3-4': .75, '1-1-2': 1.5}.get(s)
    if inch is None:
        try: inch = float(s)
        except: return None
    mat = {'DIA': 'DI', 'BVC': 'PVC'}.get(mat, mat)
    C = {'GI': 100, 'ST': 110, 'DI': 130, 'PE': 140, 'PVC': 140}.get(mat, 110)
    return inch, mat, C
lines = []
for f in json.load(open(SRC))['features']:
    g = f['geometry']; p = parse(f['properties'].get('Layer'))
    if not g or not p: continue
    c = g['coordinates']
    if not any(LAT0 <= la <= LAT1 and LON0 <= lo <= LON1 for lo, la in c): continue
    xs, ys = fwd.transform([q[0] for q in c], [q[1] for q in c])
    ls = LineString(list(zip(xs, ys)))
    if ls.length < 0.5: continue
    lines.append({'geom': ls, 'inch': p[0], 'mat': p[1], 'C': p[2], 'layer': f['properties'].get('Layer')})
print('lines in area', len(lines))
tree = STRtree([l['geom'] for l in lines])
# T-junctions: endpoint within 3 m of another line's interior -> split point on that line
TOL = float(__import__("os").environ.get("TOL", "3"))
splits = collections.defaultdict(list)
for i, l in enumerate(lines):
    for pt in (Point(l['geom'].coords[0]), Point(l['geom'].coords[-1])):
        for j in tree.query(pt.buffer(TOL)):
            if j == i: continue
            g = lines[j]['geom']; d = g.distance(pt)
            if d <= TOL:
                s = g.project(pt)
                if 1.0 < s < g.length - 1.0: splits[j].append(s)
segs = []
for i, l in enumerate(lines):
    cuts = sorted(set(round(s, 1) for s in splits.get(i, [])))
    pos = [0.0] + cuts + [l['geom'].length]
    for a, b in zip(pos[:-1], pos[1:]):
        if b - a < 0.3: continue
        sg = substring(l['geom'], a, b)
        segs.append({**{k: v for k, v in l.items() if k != 'geom'}, 'geom': sg})
# node clustering: snap endpoints within 2 m (grid hashing)
SN = float(__import__("os").environ.get("SN", "2")); reps = {}; grid = collections.defaultdict(list); node_xy = []
def node_of(xy):
    gx, gy = int(xy[0] // SN), int(xy[1] // SN)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for k in grid[(gx+dx, gy+dy)]:
                if math.hypot(node_xy[k][0]-xy[0], node_xy[k][1]-xy[1]) <= SN: return k
    k = len(node_xy); node_xy.append(xy); grid[(gx, gy)].append(k); return k
G = nx.Graph()
for e, s in enumerate(segs):
    a = node_of(s['geom'].coords[0]); b = node_of(s['geom'].coords[-1])
    if a == b: continue
    if G.has_edge(a, b) and G[a][b]['length'] <= s['geom'].length: continue
    G.add_edge(a, b, length=s['geom'].length, inch=s['inch'], mat=s['mat'], C=s['C'], layer=s['layer'], coords=list(s['geom'].coords))
comps = sorted(nx.connected_components(G), key=len, reverse=True)
print('nodes', G.number_of_nodes(), 'edges', G.number_of_edges(), 'components', len(comps), 'largest', [len(c) for c in comps[:6]])
# elevation
with rasterio.open(DEM) as ds:
    lon, lat = inv.transform([p[0] for p in node_xy], [p[1] for p in node_xy])
    arr = ds.read(1).astype(float)
    from scipy.ndimage import median_filter
    arr = median_filter(arr, size=5)          # 150 m median: removes building/tree spikes from the surface model
    rows, cols = rasterio.transform.rowcol(ds.transform, lon, lat)
    rows = np.clip(rows, 0, arr.shape[0]-1); cols = np.clip(cols, 0, arr.shape[1]-1)
    elev = arr[rows, cols]
pickle.dump({'G': G, 'node_xy': node_xy, 'lon': lon, 'lat': lat, 'elev': elev}, open(OUT, 'wb'))
# which component holds the radar candidates?
cand = [(31.05727, 35.68692), (31.21237, 35.75522)]
for la, lo in cand:
    x, y = fwd.transform(lo, la); best = min(G.nodes, key=lambda k: math.hypot(node_xy[k][0]-x, node_xy[k][1]-y))
    ci = next(i for i, c in enumerate(comps) if best in c)
    print('candidate', la, lo, '-> node', best, 'dist', round(math.hypot(node_xy[best][0]-x, node_xy[best][1]-y), 1), 'm, component', ci, 'size', len(comps[ci]))
