import numpy as np, json, itertools, warnings, wntr, sys, math, pickle
warnings.filterwarnings('ignore')
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis as LDA
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import log_loss
a, b = np.load('hf10_a.npz', allow_pickle=True), np.load('hf10_b.npz', allow_pickle=True)
X = np.vstack([a['X'], b['X']]); Q = np.concatenate([a['Q'], b['Q']]); Y = np.vstack([a['Y'], b['Y']]); J = list(a['J']); GAPS = list(a['GAPS']); K = len(GAPS)
rng = np.random.default_rng(5); Xn = X + rng.normal(0, 0.2, X.shape).astype('float32'); Qn = Q * (1 + rng.normal(0, 0.02, Q.shape))
idx = np.arange(len(Y)); tr, te = train_test_split(idx, test_size=0.3, random_state=1); tr, va = train_test_split(tr, test_size=0.25, random_state=2)
G = pickle.load(open('hf_graph.pkl', 'rb')); Z, xy, lat, lon = G['Z'], G['node_xy'], G['lat'], G['lon']
nodes = [int(j[1:]) for j in J]
cand = [k for k, n in enumerate(nodes) if max((Z[n][v]['inch'] for v in Z[n] if not Z[n][v]['gap']), default=0) >= 2 and np.std(X[:, k]) > 0.05]
R5 = json.load(open(sys.argv[1])); col = {n: k for k, n in enumerate(nodes)}; base = [col[s['node']] for s in R5['sensors_base']]
F = lambda S, rows: np.column_stack([Xn[rows][:, S], Qn[rows]])
def loss(S):
    tot = 0
    for g in range(K):
        m = LDA(solver='lsqr', shrinkage='auto').fit(F(S, tr), Y[tr, g]); tot += log_loss(Y[va, g], m.predict_proba(F(S, va)), labels=[0, 1])
    return tot
S = list(base); curve = [(len(S), round(K * math.log(2) - loss(S), 3))]
for step in range(12):
    pool = [c for c in cand if c not in S]; pool = list(rng.choice(pool, size=min(60, len(pool)), replace=False))
    best = min(pool, key=lambda c: loss(S + [c])); S.append(best); curve.append((len(S), round(K * math.log(2) - loss(S), 3)))
bitsc = [(n, round(v / math.log(2), 2)) for n, v in curve]; print('info bits (of', K, '):', bitsc)
def evalS(S):
    sc = StandardScaler().fit(F(S, tr)); Xt = sc.transform(F(S, te))
    lda = [LDA(solver='lsqr', shrinkage='auto').fit(sc.transform(F(S, tr)), Y[tr, g]) for g in range(K)]
    pl = np.column_stack([m.predict(Xt) for m in lda])
    mlp = MLPClassifier(hidden_layer_sizes=(128, 64), max_iter=800, random_state=0, early_stopping=True).fit(sc.transform(F(S, tr)), Y[tr]); pm = mlp.predict(Xt)
    acc = lambda p: [round(float((p[:, g] == Y[te, g]).mean()) * 100, 1) for g in range(K)]
    return {'bayes_gap': acc(pl), 'bayes_all': round(float((pl == Y[te]).all(1).mean()) * 100, 1), 'mlp_gap': acc(pm), 'mlp_all': round(float((pm == Y[te]).all(1).mean()) * 100, 1)}
e3 = evalS(base); e15 = evalS(S); print('3 spread', e3); print('15 (3+12 AI)', e15)
# plain algorithm: needs one reference simulation per network state (2^K)
from hf_model import build, ZMAX
wn = build(); refs, refq, refy = [], [], []
for st in itertools.product([1, 0], repeat=K):
    for k, g in enumerate(GAPS): wn.get_link(g).initial_status = wntr.network.LinkStatus.Open if st[k] else wntr.network.LinkStatus.Closed
    r = wntr.sim.EpanetSimulator(wn).run_sim(); refs.append(r.node['pressure'].iloc[0][J].values); refq.append(float(abs(r.link['flowrate'].iloc[0]['PT1']) + abs(r.link['flowrate'].iloc[0]['PT2'])) * 1000); refy.append(st)
refs, refq, refy = np.array(refs), np.array(refq), np.array(refy)
pa = np.array([refy[int(np.argmin(((refs[:, S] - Xn[t, S]) ** 2).sum(1) + (refq - Qn[t]) ** 2))] for t in te])
ea = {'gap': [round(float((pa[:, g] == Y[te, g]).mean()) * 100, 1) for g in range(K)], 'all': round(float((pa == Y[te]).all(1).mean()) * 100, 1), 'reference_sims': int(2 ** K)}
print('algorithm 15', ea)
json.dump({'gaps': GAPS, 'n_states': 2 ** K, 'n_scenarios': int(len(Y)), 'n_train': int(len(tr)), 'n_val': int(len(va)), 'n_test': int(len(te)), 'info_bits_curve': bitsc,
           'eval_3': e3, 'eval_15': e15, 'algorithm_15': ea, 'sensors': [{'lat': round(float(lat[nodes[k]]), 6), 'lon': round(float(lon[nodes[k]]), 6), 'node': nodes[k]} for k in S]}, open(sys.argv[2], 'w'))
