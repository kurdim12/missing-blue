import pickle, math, numpy as np, networkx as nx, wntr, time, warnings
warnings.filterwarnings('ignore')
D = pickle.load(open('hf_graph.pkl', 'rb')); Z, xy, elev, loop = D['Z'], D['node_xy'], D['elev'], D['loop']
E = {n: float(elev[n]) for n in Z.nodes}
ZMAX = max(E.values())
big = max(d['inch'] for *_, d in Z.edges(data=True) if not d['gap'])
src = max({n for a, b, d in Z.edges(data=True) if d['inch'] >= big and not d['gap'] for n in (a, b)}, key=lambda n: E[n])
src2 = max({n for a, b, d in Z.edges(data=True) if d['inch'] >= 4 and not d['gap'] for n in (a, b)}, key=lambda n: E[n])
edges = list(Z.edges(data=True)); EID = {}
def build():
    wn = wntr.network.WaterNetworkModel()
    for n in Z.nodes:
        Lk = sum(Z[n][v]['length'] for v in Z[n] if not Z[n][v]['gap']) / 2 / 1000
        wn.add_junction(f'J{n}', base_demand=0.7 * Lk / 1000, elevation=E[n])
    for i, (a, b, d) in enumerate(edges):
        name = f"G{d['gap_id']}" if d['gap'] else f'P{i}'
        wn.add_pipe(name, f'J{a}', f'J{b}', length=max(d['length'], 0.5), diameter=d['inch'] * 0.0254, roughness=d['C'])
    for t, n, dia in (('T1', src, big * 0.0254), ('T2', src2, 0.2)):
        wn.add_reservoir(t, base_head=ZMAX + 25); wn.add_pipe('P' + t, t, f'J{n}', length=10, diameter=dia, roughness=130)
    o = wn.options; o.hydraulic.headloss = 'H-W'; o.time.duration = 0; o.hydraulic.demand_model = 'PDD'; o.hydraulic.required_pressure = 15.0; o.hydraulic.minimum_pressure = 0.0
    return wn
if __name__ == '__main__':
    wn = build(); t0 = time.time(); r = wntr.sim.EpanetSimulator(wn).run_sim(); dt = time.time() - t0
    p0 = r.node['pressure'].iloc[0]; J = [f'J{n}' for n in Z.nodes]
    print('one run s', round(dt, 2), 'pressure med', round(float(p0[J].median()), 1), 'min', round(float(p0[J].min()), 1), 'max', round(float(p0[J].max()), 1))
    gapnames = [f"G{d['gap_id']}" for *_, d in edges if d['gap']]
    imp = []
    for g in gapnames:
        wn = build(); wn.get_link(g).initial_status = wntr.network.LinkStatus.Closed
        p = wntr.sim.EpanetSimulator(wn).run_sim().node['pressure'].iloc[0][J]
        dp = (p - p0[J]).abs(); imp.append((float(dp.max()), int((dp > 0.5).sum()), g))
    imp.sort(reverse=True)
    import json
    gxy = {f"G{d['gap_id']}": ((xy[a][0]+xy[b][0])/2, (xy[a][1]+xy[b][1])/2) for a, b, d in edges if d['gap']}
    pick = []
    for a_, b_, g in imp:                    # medium-impact gaps: 15-150 junctions move > 0.5 m, spread > 150 m apart
        if 15 <= b_ <= 150 and all(math.hypot(gxy[g][0]-gxy[p][0], gxy[g][1]-gxy[p][1]) > 150 for p in pick): pick.append(g)
        if len(pick) == 5: break
    json.dump(pick, open('hf_gaps_pick.json', 'w')); print('picked', pick)
    print('top gaps by impact (max |dp| m, nodes >0.5 m):'); [print(' ', g, round(a, 2), b) for a, b, g in imp[:15]]
    pickle.dump({'imp': imp, 'src': src, 'src2': src2}, open('hf_impact.pkl', 'wb'))
