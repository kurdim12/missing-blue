// HydroFingerprint live engine: a port of the LIVE block in demo/missing-blue.html.
// Model (data/hydrofingerprint/hf_live_model.json): 32 network states (5 gaps, open/closed), one Gaussian per state with a
// class mean over 141 features (0 = total inflow, 1..140 = pressure at candidate logger sites) and ONE shared covariance.
// Given the loggers in place we compute the posterior over the 32 states (Cholesky solve), P(each gap connected), and the
// expected drop in uncertainty (bits) for every free site (5-point Gauss–Hermite over the predicted reading).
// Everything here is pure TypeScript with no React, so it can be checked from Node as well.
import type { HfLiveModel } from "../../types";

/** Verdict thresholds (same as the demo): ≥ 0.9 connected, ≤ 0.1 not connected, otherwise undecided. */
export const CONNECTED_AT = 0.9;
export const NOT_CONNECTED_AT = 0.1;
export type Verdict = "connected" | "not_connected" | "undecided";
export const verdictOf = (p: number): Verdict => (p >= CONNECTED_AT ? "connected" : p <= NOT_CONNECTED_AT ? "not_connected" : "undecided");

/** Lower-triangular Cholesky factor (demo: diagonal floored at 1e-9). */
export function chol(A: number[][]): number[][] {
  const n = A.length;
  const L = A.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-9)) : s / L[j][j];
    }
  return L;
}

/** Solve (L Lᵀ) w = b. */
export function solve(L: number[][], b: number[]): number[] {
  const n = L.length;
  const y = b.slice();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < i; k++) y[i] -= L[i][k] * y[k];
    y[i] /= L[i][i];
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let k = i + 1; k < n; k++) y[i] -= L[k][i] * y[k];
    y[i] /= L[i][i];
  }
  return y;
}

/** Shannon entropy in bits. */
export const entropy = (p: number[]) => -p.reduce((a, v) => a + (v > 1e-12 ? v * Math.log2(v) : 0), 0);

export type Inference = {
  /** Features used: 0 (inflow meter) + the logger sites. */
  F: number[];
  L: number[][];
  /** Posterior over the 32 network states. */
  post: number[];
  /** P(gap g connected), in the model's gap order. */
  marg: number[];
  /** Uncertainty left, bits (max = log2(32) = 5). */
  H: number;
};

export type HfEngine = ReturnType<typeof createEngine>;

// 5-point Gauss–Hermite nodes/weights for a standard normal (exactly as in the demo).
const GH_Z = [-2.02, -0.96, 0, 0.96, 2.02];
const GH_W = [0.0113, 0.2221, 0.5333, 0.2221, 0.0113];

export function createEngine(model: HfLiveModel) {
  const K = model.mu.length; // 32 states
  const NG = model.gaps.length; // 5 gaps
  // state id = binary, first gap = most significant bit, 1 = connected (see model.note)
  const BITS = [...Array(K)].map((_, k) => [...Array(NG)].map((_, g) => (k >> (NG - 1 - g)) & 1));
  /** All logger sites as FEATURE indices (1..140); site = model.nodes[f - 1]. */
  const SITES = model.nodes.map((_, i) => i + 1);
  const maxBits = Math.log2(K);

  /** Posterior for loggers S (feature indices) on readings x (one held-out case). */
  function infer(S: number[], x: number[]): Inference {
    const F = [0, ...S];
    const C = F.map((i) => F.map((j) => model.cov[i][j]));
    const L = chol(C);
    const ll = model.mu.map((m) => {
      const d = F.map((i) => x[i] - m[i]);
      const w = solve(L, d);
      return -0.5 * d.reduce((a, v, i) => a + v * w[i], 0);
    });
    const mx = Math.max(...ll);
    let p = ll.map((v) => Math.exp(v - mx));
    const z = p.reduce((a, b) => a + b, 0);
    p = p.map((v) => v / z);
    const marg = [...Array(NG)].map((_, g) => p.reduce((a, v, k) => a + v * BITS[k][g], 0));
    return { F, L, post: p, marg, H: entropy(p) };
  }

  /** Expected drop in uncertainty (bits) if a logger is added at feature c. */
  function gain(inf: Inference, x: number[], c: number): number {
    const { F, L, post } = inf;
    const Sc = F.map((i) => model.cov[c][i]);
    const w = solve(L, Sc);
    const v = Math.max(model.cov[c][c] - Sc.reduce((a, s, i) => a + s * w[i], 0), 1e-6);
    const sd = Math.sqrt(v);
    const m = model.mu.map((mu) => mu[c] + F.reduce((a, f, i) => a + w[i] * (x[f] - mu[f]), 0));
    let eh = 0;
    post.forEach((pk, k) => {
      if (pk < 1e-3) return;
      GH_Z.forEach((zz, q) => {
        const y = m[k] + sd * zz;
        let pn = post.map((pj, j) => pj * Math.exp(-((y - m[j]) ** 2) / (2 * v)));
        const s2 = pn.reduce((a, b) => a + b, 0) || 1;
        pn = pn.map((t) => t / s2);
        eh += pk * GH_W[q] * entropy(pn);
      });
    });
    return inf.H - eh;
  }

  /** Expected gain for every free site; best = first maximum (demo tie-break). */
  function gains(S: number[], inf: Inference, x: number[]) {
    const pool = SITES.filter((f) => !S.includes(f));
    const byFeature = new Map<number, number>();
    let best: number | null = null;
    let bestBits = -1;
    for (const f of pool) {
      const g = gain(inf, x, f);
      byFeature.set(f, g);
      if (g > bestBits) {
        bestBits = g;
        best = f;
      }
    }
    return { byFeature, best, bestBits, checked: pool.length };
  }

  return { K, NG, BITS, SITES, maxBits, infer, gain, gains };
}
