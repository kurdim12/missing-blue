# Robustness (model mismatch) + calibration for HydroFingerprint
import numpy as np, json, itertools, warnings, wntr, sys
warnings.filterwarnings('ignore')
from hf_model import build, Z, ZMAX
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis as LDA
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
R = json.load(open(sys.argv[1])); GAPS = R['gap_order']; NSH = int(sys.argv[2])
d = np.load('hf_data.npz', allow_pickle=True); X, Q, Y, J = d['X'], d['Q'], d['Y'], list(d['J'])
rng = np.random.default_rng(7)
Xn = X + rng.normal(0, 0.2, X.shape).astype('float32'); Qn = Q * (1 + rng.normal(0, 0.02, Q.shape))
state = (Y * (2 ** np.arange(5)[::-1])).sum(1)
idx = np.arange(len(Y)); tr, te = train_test_split(idx, test_size=0.3, stratify=state, random_state=1)
col = {int(j[1:]): k for k, j in enumerate(J)}
S = [col[s['node']] for s in R['sensors_base']] + [col[s['node']] for s in R['sensors_ig']]
F = lambda Xa, Qa: np.column_stack([Xa[:, S], Qa])
sc = StandardScaler().fit(F(Xn[tr], Qn[tr]))
lda = LDA(solver='lsqr', shrinkage='auto').fit(sc.transform(F(Xn[tr], Qn[tr])), state[tr])
mlp = MLPClassifier(hidden_layer_sizes=(64, 64), max_iter=600, random_state=0, early_stopping=True).fit(sc.transform(F(Xn[tr], Qn[tr])), Y[tr])
bits = np.array([[(c >> (4 - g)) & 1 for g in range(5)] for c in lda.classes_])
# --- shifted test set: the real network differs from our model ---
wn = build(); pipes = [p for p in wn.pipe_name_list if p.startswith('P') and not p.startswith('PT')]
base_r = {p: wn.get_link(p).roughness for p in pipes}; base_dem = {j: wn.get_node(j).demand_timeseries_list[0].base_value for j in J}
srng = np.random.default_rng(99); XS, QS, YS = [], [], []
for i in range(NSH):
    st = srng.integers(0, 2, 5)
    for k, g in enumerate(GAPS): wn.get_link(g).initial_status = wntr.network.LinkStatus.Open if st[k] else wntr.network.LinkStatus.Closed
    rf = srng.uniform(0.8, 1.2, len(pipes))
    for p, f in zip(pipes, rf): wn.get_link(p).roughness = base_r[p] * f
    gm = srng.uniform(0.5, 1.6); z = srng.lognormal(0, 0.4, len(J)); head = ZMAX + 25 + srng.uniform(-5, 5)
    for j, zz in zip(J, z): wn.get_node(j).demand_timeseries_list[0].base_value = base_dem[j] * gm * zz
    for t in ('T1', 'T2'): wn.get_node(t).head_timeseries.base_value = head
    r = wntr.sim.EpanetSimulator(wn).run_sim()
    XS.append(r.node['pressure'].iloc[0][J].values); QS.append(float(abs(r.link['flowrate'].iloc[0]['PT1']) + abs(r.link['flowrate'].iloc[0]['PT2'])) * 1000); YS.append(st)
XS = np.array(XS) + srng.normal(0, 0.3, (NSH, len(J))); QS = np.array(QS) * (1 + srng.normal(0, 0.03, NSH)); YS = np.array(YS)
# plain algorithm reference fingerprints (nominal model)
for p in pipes: wn.get_link(p).roughness = base_r[p]
for j in J: wn.get_node(j).demand_timeseries_list[0].base_value = base_dem[j]
for t in ('T1', 'T2'): wn.get_node(t).head_timeseries.base_value = ZMAX + 25
refs, refq, refy = [], [], []
for st in itertools.product([1, 0], repeat=5):
    for k, g in enumerate(GAPS): wn.get_link(g).initial_status = wntr.network.LinkStatus.Open if st[k] else wntr.network.LinkStatus.Closed
    r = wntr.sim.EpanetSimulator(wn).run_sim(); refs.append(r.node['pressure'].iloc[0][J].values); refq.append(float(abs(r.link['flowrate'].iloc[0]['PT1']) + abs(r.link['flowrate'].iloc[0]['PT2'])) * 1000); refy.append(st)
refs, refq, refy = np.array(refs), np.array(refq), np.array(refy)
def algo(Xa, Qa): return np.array([refy[int(np.argmin(((refs[:, S] - x[S]) ** 2).sum(1) + (refq - q) ** 2))] for x, q in zip(Xa, Qa)])
def score(name, Xa, Qa, Ya):
    Z_ = sc.transform(F(Xa, Qa)); marg = lda.predict_proba(Z_) @ bits; pb = (marg > 0.5).astype(int); pm = mlp.predict(Z_); pa = algo(Xa, Qa)
    acc = lambda p: [round(float((p[:, g] == Ya[:, g]).mean()) * 100, 1) for g in range(5)]
    allv = lambda p: round(float((p == Ya).all(1).mean()) * 100, 1)
    brier = round(float(((marg - Ya) ** 2).mean()), 4)
    bins = np.linspace(0, 1, 11); ece = 0
    for a, b in zip(bins[:-1], bins[1:]):
        m = (marg >= a) & (marg < b if b < 1 else marg <= b)
        if m.sum(): ece += m.sum() / marg.size * abs(marg[m].mean() - Ya[m].mean())
    conf = (marg >= 0.9) | (marg <= 0.1); conf_acc = round(float(((marg >= 0.5).astype(int) == Ya)[conf].mean()) * 100, 1); cover = round(float(conf.mean()) * 100, 1)
    out = {'bayes': acc(pb), 'bayes_all5': allv(pb), 'mlp': acc(pm), 'mlp_all5': allv(pm), 'algorithm': acc(pa), 'algorithm_all5': allv(pa), 'brier': brier, 'ece': round(float(ece), 4), 'confident_share_pct': cover, 'accuracy_when_confident_pct': conf_acc, 'n': int(len(Ya))}
    print(name, json.dumps(out)); return out
res = {'nominal_test': score('NOMINAL', Xn[te], Qn[te], Y[te]), 'shifted_test': score('SHIFTED', XS, QS, YS),
       'shift': {'roughness_factor': [0.8, 1.2], 'demand_multiplier': [0.5, 1.6], 'node_lognormal_sigma': 0.4, 'tank_m': 5, 'pressure_noise_m': 0.3, 'inflow_noise_pct': 3}}
json.dump(res, open(sys.argv[3], 'w'))
