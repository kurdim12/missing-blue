import pickle, math, json, sys, collections, numpy as np, networkx as nx, wntr
from pyproj import Transformer
D = pickle.load(open('twin_graph.pkl', 'rb')); G, xy, lon, lat, elev = D['G'], D['node_xy'], D['lon'], D['lat'], D['elev']
fwd = Transformer.from_crs(4326, 32636, always_xy=True)
cx, cy = fwd.transform(35.68692, 31.05727)
cand = min(G.nodes, key=lambda k: math.hypot(xy[k][0]-cx, xy[k][1]-cy))
comp = next(c for c in nx.connected_components(G) if cand in c); H = G.subgraph(comp).copy()
E = {k: float(elev[k]) for k in H.nodes}
la = [lat[k] for k in H.nodes]; lo = [lon[k] for k in H.nodes]
print('component bbox', min(la), min(lo), max(la), max(lo), 'elev', round(min(E.values())), round(max(E.values())))
inch_len = collections.Counter(); 
for a, b, d in H.edges(data=True): inch_len[d['inch']] += d['length']
print('km by inch', {k: round(v/1000, 1) for k, v in sorted(inch_len.items())})
# source: where the largest pipes are, highest of those nodes (gravity feed from the trunk main)
big = max(d['inch'] for _, _, d in H.edges(data=True))
trunk_nodes = {n for a, b, d in H.edges(data=True) if d['inch'] >= min(big, 8) for n in (a, b)}
src = max(trunk_nodes, key=lambda n: E[n])
print('largest pipe', big, 'in; source node', src, 'elev', round(E[src]), 'at', round(lat[src], 5), round(lon[src], 5))
json.dump({'cand': cand, 'src': src, 'nodes': list(H.nodes)}, open('twin_meta.json', 'w'))
