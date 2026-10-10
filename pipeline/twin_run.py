import pickle, json, math, numpy as np, networkx as nx, wntr, sys
from pyproj import Transformer
OUT = sys.argv[1]
D = pickle.load(open('twin_graph.pkl','rb')); G, xy, lat, lon, elev = D['G'], D['node_xy'], D['lat'], D['lon'], D['elev']
m = json.load(open('twin_meta.json')); c = m['cand']; cx, cy = xy[c]
H = G.subgraph(m['nodes'])
sub = [k for k in H.nodes if math.hypot(xy[k][0]-cx, xy[k][1]-cy) <= 2500]
S = H.subgraph(sub); Z = S.subgraph(next(cc for cc in nx.connected_components(S) if c in cc)).copy()
E = {k: float(elev[k]) for k in Z.nodes}
big = max(d['inch'] for _, _, d in Z.edges(data=True))
src = max({n for a, b, d in Z.edges(data=True) if d['inch'] >= big for n in (a, b)}, key=lambda n: E[n])   # 12-inch feeder entry
src2 = max({n for a, b, d in Z.edges(data=True) if d['inch'] >= 4 for n in (a, b)}, key=lambda n: E[n])  # hilltop on a 4-inch+ main
ZMAX = max(E.values())
DEMAND_LPS_PER_KM = 0.7; TANK_ABOVE = 25.0  # tank water level above the highest junction in the zone
def build(extra_lps=0.0, at=None):
    at = c if at is None else at
    wn = wntr.network.WaterNetworkModel()
    for n in Z.nodes:
        Lk = sum(Z[n][v]['length'] for v in Z[n]) / 2 / 1000
        wn.add_junction(f'J{n}', base_demand=DEMAND_LPS_PER_KM*Lk/1000 + (extra_lps/1000 if n == at else 0), elevation=E[n])
    for i, (a, b, d) in enumerate(Z.edges(data=True)):
        wn.add_pipe(f'P{i}', f'J{a}', f'J{b}', length=max(d['length'], 0.5), diameter=d['inch']*0.0254, roughness=d['C'])
    wn.add_reservoir('TANK', base_head=ZMAX + TANK_ABOVE)
    wn.add_pipe('PTANK', 'TANK', f'J{src}', length=10, diameter=big*0.0254, roughness=130)
    wn.add_reservoir('TANK2', base_head=ZMAX + TANK_ABOVE)
    wn.add_pipe('PTANK2', 'TANK2', f'J{src2}', length=10, diameter=0.2, roughness=130)
    wn.options.hydraulic.headloss = 'H-W'; wn.options.time.duration = 0
    wn.options.hydraulic.demand_model = 'PDD'; wn.options.hydraulic.required_pressure = 15.0; wn.options.hydraulic.minimum_pressure = 0.0
    return wn
def run(extra, at=None):
    wn = build(extra, at); r = wntr.sim.EpanetSimulator(wn).run_sim()
    p = r.node['pressure'].iloc[0]; dem = r.node['demand'].iloc[0]; q = r.link['flowrate'].iloc[0]
    return wn, p, dem, q
wn0, p0, d0, q0 = run(0.0)
wntr.network.io.write_inpfile(wn0, OUT.replace('.json', '.inp'))
# junction where the candidate's service line meets a main (>= 2 inch): walk the graph from the candidate
import collections as _c
def main_attach(start):
    seen = {start}; dq = _c.deque([start])
    while dq:
        u = dq.popleft()
        if max(Z[u][v]['inch'] for v in Z[u]) >= 2 and u != start: return u
        for v in Z[u]:
            if v not in seen: seen.add(v); dq.append(v)
mn = main_attach(c)
print('main attach node', mn, 'pipes there', sorted({Z[mn][v]['inch'] for v in Z[mn]}), 'dist from cand', round(math.hypot(xy[mn][0]-xy[c][0], xy[mn][1]-xy[c][1])), 'm')
res = {}
_, p, d, q = run(1.0, c);  res['svc1'] = p0 - p      # service-line leak at the radar spot
_, p, d, q = run(5.0, mn); res['main5'] = p0 - p     # break on the main next to it
_, p, d, q = run(15.0, mn); res['main15'] = p0 - p
dist_src = nx.multi_source_dijkstra_path_length(Z, {src, src2}, weight='length')
far = max([n for n in Z.nodes if max(Z[n][v]['inch'] for v in Z[n]) >= 4], key=lambda n: dist_src.get(n, 0))
print('far main node', far, 'pipe dist from tanks m', round(dist_src[far]), 'inch', sorted({Z[far][v]['inch'] for v in Z[far]}))
_, p, d, q = run(15.0, far); res['far15'] = p0 - p
nodes = list(Z.nodes)
P0 = np.array([p0[f'J{n}'] for n in nodes])
total_demand = float(d0[[f'J{n}' for n in nodes]].sum()*1000)
print('junctions', len(nodes), 'pipes', Z.number_of_edges(), 'km', round(sum(d['length'] for *_, d in Z.edges(data=True))/1000, 1))
print('tank head', round(ZMAX+TANK_ABOVE, 1), 'tank node elev', round(E[src],1), 'demand L/s', round(total_demand, 1), 'pressure m: min/median/max', P0.min().round(1), np.median(P0).round(1), P0.max().round(1))
print('cand pressure', round(float(p0[f"J{c}"]), 1), 'cand dist to tank node m', round(math.hypot(xy[c][0]-xy[src][0], xy[c][1]-xy[src][1])))
for L, dp in res.items():
    arr = np.array([dp[f'J{n}'] for n in nodes]); order = np.argsort(-arr)
    print(f'{L}: max drop {arr.max():.2f} m, nodes with drop>0.5 m: {(arr>0.5).sum()}, >0.1 m: {(arr>0.1).sum()}')
# best logger site = largest drop among nodes on mains (>=2") excluding candidate & neighbours within 50 m
dp3 = res['far15']
def on_main(n): return max(Z[n][v]['inch'] for v in Z[n]) >= 2
cands = [n for n in nodes if on_main(n) and math.hypot(xy[n][0]-xy[far][0], xy[n][1]-xy[far][1]) > 150]
logger = max(cands, key=lambda n: dp3[f'J{n}'])
print('logger node', logger, 'drop', round(float(dp3[f"J{logger}"]), 2), 'm at', round(lat[logger], 5), round(lon[logger], 5), 'dist from cand', round(math.hypot(xy[logger][0]-xy[c][0], xy[logger][1]-xy[c][1])), 'm')
# export
inv = Transformer.from_crs(32636, 4326, always_xy=True)
edges = []
for i, (a, b, d) in enumerate(Z.edges(data=True)):
    xs, ys = zip(*d['coords']); lo_, la_ = inv.transform(xs, ys)
    pts = [[round(x, 6), round(y, 6)] for x, y in zip(lo_, la_)]
    if len(pts) > 2: pts = [pts[0]] + pts[1:-1][::max(1, len(pts)//8)] + [pts[-1]]
    edges.append({'c': pts, 'in': d['inch'], 'mat': d['mat'], 'q': round(abs(float(q0[f'P{i}']))*1000, 2)})
out = {'cand': {'lat': lat[c], 'lon': lon[c], 'node': int(c), 'p0': round(float(p0[f'J{c}']), 1)},
       'tank2': {'lat': lat[src2], 'lon': lon[src2], 'elev': round(E[src2], 1)}, 'tank': {'lat': lat[src], 'lon': lon[src], 'head': round(ZMAX+TANK_ABOVE, 1), 'elev': round(E[src], 1)},
       'far': {'lat': lat[far], 'lon': lon[far], 'node': int(far)}, 'main': {'lat': lat[mn], 'lon': lon[mn], 'node': int(mn), 'dist_m': round(math.hypot(xy[mn][0]-xy[c][0], xy[mn][1]-xy[c][1]))}, 'logger': {'lat': lat[logger], 'lon': lon[logger], 'drop_main5': round(float(dp3[f'J{logger}']), 2), 'dist_m': round(math.hypot(xy[logger][0]-xy[c][0], xy[logger][1]-xy[c][1]))},
       'nodes': [{'lat': round(lat[n], 6), 'lon': round(lon[n], 6), 'z': round(E[n], 1), 'p': round(float(p0[f'J{n}']), 1), 'svc1': round(float(res['svc1'][f'J{n}']), 3), 'm5': round(float(res['main5'][f'J{n}']), 3), 'm15': round(float(res['main15'][f'J{n}']), 3), 'far15': round(float(res['far15'][f'J{n}']), 3)} for n in nodes],
       'edges': edges, 'stats': {'junctions': len(nodes), 'pipes': Z.number_of_edges(), 'km': round(sum(d['length'] for *_, d in Z.edges(data=True))/1000, 1), 'demand_lps': round(total_demand, 1),
       'p_min': round(float(P0.min()), 1), 'p_med': round(float(np.median(P0)), 1), 'p_max': round(float(P0.max()), 1), 'max_drop': {str(k): round(float(np.max([v[f'J{n}'] for n in nodes])), 2) for k, v in res.items()}, 'n_drop_gt1m': {str(k): int(sum(1 for n in nodes if v[f'J{n}'] > 1.0)) for k, v in res.items()}, 'n_drop_gt1m_excl_svc': int(sum(1 for n in nodes if res['svc1'][f'J{n}'] > 1.0 and math.hypot(xy[n][0]-xy[c][0], xy[n][1]-xy[c][1]) > 30))},
       'assumptions': {'demand_lps_per_km': DEMAND_LPS_PER_KM, 'tank_above_highest_junction_m': TANK_ABOVE, 'hazen_williams_C': {'GI': 100, 'ST': 110, 'DI': 130, 'PE': 140, 'PVC': 140}, 'radius_m': 2500}}
json.dump(out, open(OUT, 'w')); print('wrote', OUT)
