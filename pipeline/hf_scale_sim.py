# 10 gaps, random network states (1,024 possible), sampled instead of enumerated
import numpy as np, pickle, json, math, wntr, warnings, sys, time
warnings.filterwarnings('ignore')
from hf_model import build, Z, ZMAX, edges, xy
N, SEED, OUT = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
imp = pickle.load(open('hf_impact.pkl', 'rb'))['imp']
gxy = {f"G{d['gap_id']}": ((xy[a][0]+xy[b][0])/2, (xy[a][1]+xy[b][1])/2) for a, b, d in edges if d['gap']}
pick = []
for a_, b_, g in imp:
    if 10 <= b_ <= 250 and all(math.hypot(gxy[g][0]-gxy[p][0], gxy[g][1]-gxy[p][1]) > 120 for p in pick): pick.append(g)
    if len(pick) == 10: break
json.dump(pick, open('hf_gaps10.json', 'w'))
rng = np.random.default_rng(SEED); J = [f'J{n}' for n in Z.nodes]
wn = build(); base = {j: wn.get_node(j).demand_timeseries_list[0].base_value for j in J}
X, Q, Y = [], [], []; t0 = time.time()
for i in range(N):
    st = rng.integers(0, 2, len(pick))
    for k, g in enumerate(pick): wn.get_link(g).initial_status = wntr.network.LinkStatus.Open if st[k] else wntr.network.LinkStatus.Closed
    gm = rng.uniform(0.6, 1.4); z = rng.lognormal(0, 0.25, len(J)); head = ZMAX + 25 + rng.uniform(-3, 3)
    for j, zz in zip(J, z): wn.get_node(j).demand_timeseries_list[0].base_value = base[j] * gm * zz
    for t in ('T1', 'T2'): wn.get_node(t).head_timeseries.base_value = head
    r = wntr.sim.EpanetSimulator(wn).run_sim()
    X.append(r.node['pressure'].iloc[0][J].values.astype('float32')); Q.append(float(abs(r.link['flowrate'].iloc[0]['PT1']) + abs(r.link['flowrate'].iloc[0]['PT2'])) * 1000); Y.append(st)
np.savez_compressed(OUT, X=np.array(X), Q=np.array(Q), Y=np.array(Y), J=np.array(J), GAPS=np.array(pick))
print('done', len(Y), round(time.time() - t0), 's', pick)
