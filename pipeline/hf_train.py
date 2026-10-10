# HydroFingerprint step 3: learn the pressure fingerprint of each network hypothesis
import numpy as np, pickle, json, math, sys, warnings
warnings.filterwarnings('ignore')
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis as LDA
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import log_loss
OUT = sys.argv[1]
d = np.load('hf_data.npz', allow_pickle=True); X, Q, Y, J, GAPS = d['X'], d['Q'], d['Y'], list(d['J']), list(d['GAPS'])
G = pickle.load(open('hf_graph.pkl', 'rb')); Z, xy, lat, lon = G['Z'], G['node_xy'], G['lat'], G['lon']
rng = np.random.default_rng(7)
SIG_P, SIG_Q = 0.2, 0.02                       # logger accuracy 0.2 m, inflow meter 2 %
Xn = X + rng.normal(0, SIG_P, X.shape).astype('float32'); Qn = Q * (1 + rng.normal(0, SIG_Q, Q.shape))
state = (Y * (2 ** np.arange(Y.shape[1])[::-1])).sum(1)          # joint state id 0..31
ok = np.isfinite(Xn).all(1); Xn, Qn, Y, state = Xn[ok], Qn[ok], Y[ok], state[ok]
idx = np.arange(len(Y)); tr, te = train_test_split(idx, test_size=0.3, stratify=state, random_state=1)
tr, va = train_test_split(tr, test_size=0.25, stratify=state[tr], random_state=2)
nodes = [int(j[1:]) for j in J]
cand = [k for k, n in enumerate(nodes) if max((Z[n][v]['inch'] for v in Z[n] if not Z[n][v]['gap']), default=0) >= 2 and np.std(X[:, k]) > 0.05]
def feats(S, rows): return np.column_stack([Xn[rows][:, S], Qn[rows]])
def lda_loss(S):
    m = LDA(solver='lsqr', shrinkage='auto').fit(feats(S, tr), state[tr])
    p = m.predict_proba(feats(S, va)); return log_loss(state[va], p, labels=m.classes_), m
# 3 existing loggers: spread across the zone (farthest-point), not optimised
P = np.array([xy[nodes[k]] for k in cand]); first = int(np.argmax(np.linalg.norm(P - P.mean(0), axis=1)))
base = [cand[first]]
while len(base) < 3:
    dmin = np.min([np.linalg.norm(P - np.array(xy[nodes[b]]), axis=1) for b in base], axis=0); base.append(cand[int(np.argmax(dmin))])
H0 = math.log(32)
def curve(start, chooser, k_add=5):
    S = list(start); out = []
    for step in range(k_add + 1):
        L, m = lda_loss(S); out.append({'n_sensors': len(S), 'val_logloss': round(L, 3), 'info_bits': round((H0 - L) / math.log(2), 2), 'sensors': list(S)})
        if step == k_add: break
        S.append(chooser(S))
    return out
def ig_choice(S):
    pool = [c for c in cand if c not in S]; pool = list(rng.choice(pool, size=min(90, len(pool)), replace=False))
    return min(pool, key=lambda c: lda_loss(S + [c])[0])
def rand_choice(S): return int(rng.choice([c for c in cand if c not in S]))
ig = curve(base, ig_choice, 7); rd = curve(base, rand_choice, 7)
print('IG curve  ', [(c['n_sensors'], c['info_bits']) for c in ig]); print('random    ', [(c['n_sensors'], c['info_bits']) for c in rd])
def evaluate(S):
    sc = StandardScaler().fit(feats(S, tr))
    lda = LDA(solver='lsqr', shrinkage='auto').fit(sc.transform(feats(S, tr)), state[tr])
    mlp = MLPClassifier(hidden_layer_sizes=(64, 64), max_iter=600, random_state=0, early_stopping=True).fit(sc.transform(feats(S, tr)), Y[tr])
    Xt = sc.transform(feats(S, te)); post = lda.predict_proba(Xt); cls = lda.classes_
    bits = np.array([[(c >> (len(GAPS) - 1 - g)) & 1 for g in range(len(GAPS))] for c in cls])
    marg = post @ bits                                         # P(gap connected) from the Bayesian model
    pm = (marg > 0.5).astype(int); pn = mlp.predict(Xt)
    return {'sensors': S, 'bayes_gap_acc': [round(float((pm[:, g] == Y[te, g]).mean()), 3) for g in range(len(GAPS))], 'bayes_state_acc': round(float((pm == Y[te]).all(1).mean()), 3),
            'mlp_gap_acc': [round(float((pn[:, g] == Y[te, g]).mean()), 3) for g in range(len(GAPS))], 'mlp_state_acc': round(float((pn == Y[te]).all(1).mean()), 3), 'n_test': int(len(te))}, (sc, lda, mlp, marg)
ev3, m3 = evaluate(base); ev4, m4 = evaluate(ig[1]['sensors']); ev6, m6 = evaluate(ig[-1]['sensors'])
for name, ev in (('3 spread loggers', ev3), ('+1 chosen by IG', ev4), ('+7 chosen by IG', ev6)): print(name, 'Bayes gap acc', ev['bayes_gap_acc'], 'state', ev['bayes_state_acc'], '| MLP gap acc', ev['mlp_gap_acc'], 'state', ev['mlp_state_acc'])
# demo case: a held-out scenario where at least two gaps are NOT connected
cases = [i for i, t in enumerate(te) if Y[t].sum() == 3]
ci = cases[int(rng.integers(len(cases)))]; t = te[ci]
demo = {'test_row': int(t), 'truth': Y[t].tolist(), 'p_connected_3': [round(float(v), 3) for v in m3[3][ci]], 'p_connected_4': [round(float(v), 3) for v in m4[3][ci]], 'p_connected_10': [round(float(v), 3) for v in m6[3][ci]]}
print('demo truth', demo['truth'], '3 sensors', demo['p_connected_3'], '4 sensors', demo['p_connected_4'], '6', demo['p_connected_10'])
def ll(n): return {'lat': round(float(lat[n]), 6), 'lon': round(float(lon[n]), 6)}
gapinfo = []
for a, b, dd in Z.edges(data=True):
    if dd['gap'] and f"G{dd['gap_id']}" in GAPS:
        gapinfo.append({'id': f"G{dd['gap_id']}", 'gap_m': round(dd['length'], 2), 'pipe_in': dd['inch'], 'a': ll(a), 'b': ll(b)})
gapinfo.sort(key=lambda g: GAPS.index(g['id']))
out = {'gaps': gapinfo, 'gap_order': GAPS, 'n_scenarios': int(len(Y)), 'n_train': int(len(tr)), 'n_val': int(len(va)), 'n_test': int(len(te)), 'noise': {'pressure_m': SIG_P, 'inflow_pct': SIG_Q * 100},
       'sensors_base': [dict(ll(nodes[k]), node=nodes[k]) for k in base], 'sensors_ig': [dict(ll(nodes[k]), node=nodes[k]) for k in ig[-1]['sensors'][3:]],
       'curve_ig': [{k: v for k, v in c.items() if k != 'sensors'} for c in ig], 'curve_random': [{k: v for k, v in c.items() if k != 'sensors'} for c in rd],
       'eval': {'3': {k: v for k, v in ev3.items() if k != 'sensors'}, '4': {k: v for k, v in ev4.items() if k != 'sensors'}, '10': {k: v for k, v in ev6.items() if k != 'sensors'}}, 'demo': demo,
       'network': {'nodes': int(Z.number_of_nodes()), 'pipes': int(sum(1 for *_, dd in Z.edges(data=True) if not dd['gap'])), 'gaps_found': int(sum(1 for *_, dd in Z.edges(data=True) if dd['gap']))}}
json.dump(out, open(OUT, 'w')); print('wrote', OUT)
