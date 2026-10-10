import pickle, numpy as np, wntr, itertools, warnings, time, sys
warnings.filterwarnings('ignore')
from hf_model import build, Z, ZMAX
import json; GAPS = json.load(open('hf_gaps_pick.json'))
N_PER = int(sys.argv[1]); S0, S1 = int(sys.argv[2]), int(sys.argv[3]); OUTF = sys.argv[4]
rng = np.random.default_rng(2026 + S0)
J = [f'J{n}' for n in Z.nodes]
wn = build(); base_dem = {j: wn.get_node(j).demand_timeseries_list[0].base_value for j in J}
states = list(itertools.product([1, 0], repeat=len(GAPS)))     # 1 = connected (real), 0 = not connected
X, Q, Y, S = [], [], [], []
t0 = time.time()
for si, st in enumerate(states):
    if not (S0 <= si < S1): continue
    for k, g in enumerate(GAPS):
        wn.get_link(g).initial_status = wntr.network.LinkStatus.Open if st[k] else wntr.network.LinkStatus.Closed
    for r in range(N_PER):
        gm = rng.uniform(0.6, 1.4); noise = rng.lognormal(0, 0.25, len(J)); head = ZMAX + 25 + rng.uniform(-3, 3)
        for j, z in zip(J, noise): wn.get_node(j).demand_timeseries_list[0].base_value = base_dem[j] * gm * z
        for t in ('T1', 'T2'): wn.get_node(t).head_timeseries.base_value = head
        res = wntr.sim.EpanetSimulator(wn).run_sim()
        X.append(res.node['pressure'].iloc[0][J].values.astype('float32'))
        Q.append(float(abs(res.link['flowrate'].iloc[0]['PT1']) + abs(res.link['flowrate'].iloc[0]['PT2'])) * 1000)
        Y.append(st); S.append((gm, head))
    if si % 8 == 7: print('state', si + 1, '/', len(states), round(time.time() - t0), 's', flush=True)
np.savez_compressed(OUTF, X=np.array(X), Q=np.array(Q), Y=np.array(Y), S=np.array(S), J=np.array(J), GAPS=np.array(GAPS))
print('done', np.array(X).shape, round(time.time() - t0), 's')
