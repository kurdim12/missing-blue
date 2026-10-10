# Plain algorithm baseline: simulate the 32 network states once at nominal demand, then pick the state whose
# predicted readings are closest (least squares) to the measured readings. No learning, no uncertainty.
import numpy as np, json, itertools, warnings, wntr, sys
warnings.filterwarnings('ignore')
from hf_model import build, Z, ZMAX
from sklearn.model_selection import train_test_split
R = json.load(open(sys.argv[1])); GAPS = R['gap_order']
d = np.load('hf_data.npz', allow_pickle=True); X, Q, Y, J = d['X'], d['Q'], d['Y'], list(d['J'])
rng = np.random.default_rng(7)
Xn = X + rng.normal(0, 0.2, X.shape).astype('float32'); Qn = Q * (1 + rng.normal(0, 0.02, Q.shape))
state = (Y * (2 ** np.arange(Y.shape[1])[::-1])).sum(1)
idx = np.arange(len(Y)); tr, te = train_test_split(idx, test_size=0.3, stratify=state, random_state=1)
col = {int(j[1:]): k for k, j in enumerate(J)}
S10 = [col[s['node']] for s in R['sensors_base']] + [col[s['node']] for s in R['sensors_ig']]
S3 = S10[:3]
wn = build(); states = list(itertools.product([1, 0], repeat=len(GAPS))); ref_p, ref_q = [], []
for st in states:
    for k, g in enumerate(GAPS): wn.get_link(g).initial_status = wntr.network.LinkStatus.Open if st[k] else wntr.network.LinkStatus.Closed
    r = wntr.sim.EpanetSimulator(wn).run_sim()
    ref_p.append(r.node['pressure'].iloc[0][J].values); ref_q.append(float(abs(r.link['flowrate'].iloc[0]['PT1']) + abs(r.link['flowrate'].iloc[0]['PT2'])) * 1000)
ref_p, ref_q, ref_y = np.array(ref_p), np.array(ref_q), np.array(states)
def run(S):
    pred = []
    for t in te:
        err = ((ref_p[:, S] - Xn[t, S]) ** 2).sum(1) + ((ref_q - Qn[t]) / 1.0) ** 2
        pred.append(ref_y[int(np.argmin(err))])
    pred = np.array(pred)
    return [round(float((pred[:, g] == Y[te, g]).mean()), 3) for g in range(len(GAPS))], round(float((pred == Y[te]).all(1).mean()), 3)
for name, S in (('3 loggers', S3), ('10 loggers (same AI-chosen sites)', S10)):
    g, s = run(S); print('ALGORITHM', name, 'gap acc', g, 'all-5', s)
print('AI Bayes 10 loggers', R['eval']['10']['bayes_gap_acc'], 'all-5', R['eval']['10']['bayes_state_acc'])
print('AI MLP   10 loggers', R['eval']['10']['mlp_gap_acc'], 'all-5', R['eval']['10']['mlp_state_acc'])
