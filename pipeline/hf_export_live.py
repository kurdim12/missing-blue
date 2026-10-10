# Export the Bayesian model (class means + shared covariance) for live in-browser inference
import numpy as np, json, pickle, sys
from sklearn.model_selection import train_test_split
from sklearn.covariance import LedoitWolf
R = json.load(open(sys.argv[1])); OUT = sys.argv[2]
d = np.load('hf_data.npz', allow_pickle=True); X, Q, Y, J = d['X'], d['Q'], d['Y'], list(d['J'])
rng = np.random.default_rng(7); Xn = X + rng.normal(0, 0.2, X.shape).astype('float32'); Qn = Q * (1 + rng.normal(0, 0.02, Q.shape))
state = (Y * (2 ** np.arange(5)[::-1])).sum(1)
idx = np.arange(len(Y)); tr, te = train_test_split(idx, test_size=0.3, stratify=state, random_state=1)
G = pickle.load(open('hf_graph.pkl', 'rb')); Z, xy, lat, lon = G['Z'], G['node_xy'], G['lat'], G['lon']
nodes = [int(j[1:]) for j in J]; col = {n: k for k, n in enumerate(nodes)}
cand = [k for k, n in enumerate(nodes) if max((Z[n][v]['inch'] for v in Z[n] if not Z[n][v]['gap']), default=0) >= 2 and np.std(X[:, k]) > 0.05]
keep = [col[s['node']] for s in R['sensors_base']] + [col[s['node']] for s in R['sensors_ig']]
P = np.array([xy[nodes[k]] for k in cand]); chosen = list(keep)
while len(chosen) < 140:                                  # farthest-point sample the rest for even coverage
    C = np.array([xy[nodes[k]] for k in chosen]); dmin = np.min(np.linalg.norm(P[:, None, :] - C[None], axis=2), axis=1)
    chosen.append(cand[int(np.argmax(dmin))])
feat = lambda rows: np.column_stack([Qn[rows], Xn[rows][:, chosen]])      # feature 0 = inflow
Ft = feat(tr); mu = np.array([Ft[state[tr] == k].mean(0) for k in range(32)])
resid = Ft - mu[state[tr]]; sd = resid.std(0) + 1e-9
cov = LedoitWolf().fit(resid / sd).covariance_ * np.outer(sd, sd)    # shrink on standardized scale, like sklearn LDA
sel = [i for i in te if Y[i].sum() in (2, 3)]; sel = list(np.random.default_rng(3).choice(sel, 24, replace=False))
cases = [{'x': [round(float(v), 3) for v in feat([i])[0]], 'truth': Y[i].tolist()} for i in sel]
out = {'gaps': R['gap_order'], 'nodes': [{'lat': round(float(lat[nodes[k]]), 6), 'lon': round(float(lon[nodes[k]]), 6)} for k in chosen],
       'base': [1 + i for i in range(3)], 'ig': [1 + i for i in range(3, 10)],
       'mu': [[round(float(v), 3) for v in row] for row in mu], 'cov': [[round(float(v), 5) for v in row] for row in cov], 'cases': cases,
       'note': 'Feature 0 = total inflow (L/s); features 1..140 = pressure (m) at the listed junctions. Classes: 32 states of 5 gaps, bit order = gaps, 1 = connected (state id = binary, first gap = most significant bit).'}
json.dump(out, open(OUT, 'w'), separators=(',', ':')); import os; print('features', 1 + len(chosen), 'cases', len(cases), 'KB', os.path.getsize(OUT) // 1024)
