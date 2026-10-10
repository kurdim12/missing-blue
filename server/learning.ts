// Adaptive learning: a Bayesian logistic regression over the wet spots that starts from the dispatch rule and is
// updated by crew outcomes entered in this demo.
//
// Features are computed from data/wet_spots/wet_spots.geojson. The Gaussian prior's MEAN encodes the current dispatch
// rule (near a pipe + built-up => inspect; far + farmland => skip); the radar features start at 0 (the rule does not use
// them). Each crew outcome ("leak" / "no_leak") is one label; the latest label per spot counts. The posterior is found
// by Newton / IRLS (MAP) with a Laplace approximation (mean + std per weight).
//
// The output is a DISPATCH SCORE (0-1) used to rank inspections: it is NOT a probability of a leak. No real field
// outcome exists yet: every label here is a demo label typed into this demo.
//
//   GET  /api/learning/state                 -> LearningState
//   POST /api/learning/outcome {spot_id, outcome: "leak"|"no_leak", note?}  -> {entry, before, after, state}
//   POST /api/learning/reset                 -> {cleared, state}
import { Hono } from "hono";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { audit, LEARNING_DIR } from "./audit";
import { FILES, findSpot, loadSpots, type Bilingual, type SpotProps } from "./data";

export const OUTCOMES_FILE = join(LEARNING_DIR, "outcomes.json");
export const OUTCOMES_REL = "data/learning/outcomes.json";

export type Outcome = "leak" | "no_leak";
export type OutcomeEntry = { id: string; ts: string; spot_id: string; outcome: Outcome; note: string | null; source: "demo" };

// ------------------------------------------------------------------ features (all computed from the spot file)
const YEARS = [2023, 2024, 2025] as const;
const yearsWith = (p: SpotProps, cls: string) => YEARS.filter((y) => p[`landcover_${y}`] === cls).length;
/** Distance scale for the pipe-distance feature: the dispatch radius (40 m, the same rule as on_pipe_40m). */
const DIST_SCALE_M = 40;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);

type FeatureDef = {
  name: string;
  label: Bilingual;
  /** how the raw value becomes the model input */
  transform: string;
  /** prior mean: the dispatch rule */
  prior: number;
  prior_std: number;
  raw: (p: SpotProps) => number | boolean;
  x: (p: SpotProps, ctx: Ctx) => number;
};
type Ctx = { hh: number; hv: number; logArea: number };

const FEATURES: FeatureDef[] = [
  {
    name: "bias",
    label: { en: "Baseline", ar: "خط الأساس" },
    transform: "1",
    prior: -1,
    prior_std: 1,
    raw: () => 1,
    x: () => 1,
  },
  {
    name: "on_pipe_40m",
    label: { en: "Spot centre within 40 m of a pipe", ar: "مركز البقعة ضمن 40 م من أنبوب" },
    transform: "1 if on_pipe_40m else 0",
    prior: 2,
    prior_std: 1,
    raw: (p) => p.on_pipe_40m,
    x: (p) => (p.on_pipe_40m ? 1 : 0),
  },
  {
    name: "nearest_pipe_m",
    label: { en: "Distance to the nearest pipe", ar: "المسافة إلى أقرب أنبوب" },
    transform: `log10(1 + nearest_pipe_m / ${DIST_SCALE_M})`,
    prior: -1.5,
    prior_std: 1,
    raw: (p) => p.nearest_pipe_m,
    x: (p) => Math.log10(1 + p.nearest_pipe_m / DIST_SCALE_M),
  },
  {
    name: "built_up_years",
    label: { en: "Years built-up (2023-2025)", ar: "سنوات المنطقة المبنية (2023-2025)" },
    transform: "years with land cover 'Built area' / 3",
    prior: 1.5,
    prior_std: 1,
    raw: (p) => yearsWith(p, "Built area"),
    x: (p) => yearsWith(p, "Built area") / YEARS.length,
  },
  {
    name: "cropland_years",
    label: { en: "Years cropland (2023-2025)", ar: "سنوات الأراضي الزراعية (2023-2025)" },
    transform: "years with land cover 'Crops' / 3",
    prior: -1.5,
    prior_std: 1,
    raw: (p) => yearsWith(p, "Crops"),
    x: (p) => yearsWith(p, "Crops") / YEARS.length,
  },
  {
    name: "hh_rise_db",
    label: { en: "Radar HH rise", ar: "ارتفاع إشارة الرادار HH" },
    transform: "hh_rise_db - mean over spots (dB)",
    prior: 0,
    prior_std: 1,
    raw: (p) => p.hh_rise_db,
    x: (p, c) => p.hh_rise_db - c.hh,
  },
  {
    name: "hv_rise_db",
    label: { en: "Radar HV rise", ar: "ارتفاع إشارة الرادار HV" },
    transform: "hv_rise_db - mean over spots (dB)",
    prior: 0,
    prior_std: 1,
    raw: (p) => p.hv_rise_db,
    x: (p, c) => p.hv_rise_db - c.hv,
  },
  {
    name: "area_m2",
    label: { en: "Wet area", ar: "مساحة البقعة الرطبة" },
    transform: "log10(area_m2) - mean over spots",
    prior: 0,
    prior_std: 1,
    raw: (p) => p.area_m2,
    x: (p, c) => Math.log10(p.area_m2) - c.logArea,
  },
];

// ------------------------------------------------------------------ small linear algebra (8 x 8)
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Inverse of a symmetric positive-definite matrix by Gauss-Jordan with partial pivoting. */
function inverse(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    if (Math.abs(d) < 1e-12) throw new Error("singular matrix");
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f) for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/** MAP by Newton / IRLS, then the Laplace posterior covariance (inverse Hessian of the negative log posterior). */
export function fitPosterior(X: number[][], y: number[], priorMean: number[], priorStd: number[]) {
  const k = priorMean.length;
  const P = priorStd.map((s) => 1 / (s * s));
  let w = [...priorMean];
  let H: number[][] = [];
  let iters = 0;
  for (; iters < 100; iters++) {
    // gradient of the log posterior and the (positive) Hessian of the negative log posterior
    const g = w.map((wi, j) => -P[j] * (wi - priorMean[j]));
    H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? P[i] : 0)));
    X.forEach((x, n) => {
      const s = sigmoid(dot(x, w));
      const r = y[n] - s;
      const v = s * (1 - s);
      for (let i = 0; i < k; i++) {
        g[i] += r * x[i];
        for (let j = 0; j < k; j++) H[i][j] += v * x[i] * x[j];
      }
    });
    const Hinv = inverse(H);
    const step = Hinv.map((row) => dot(row, g));
    w = w.map((wi, i) => wi + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-10) break;
  }
  // covariance at the MAP
  H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? P[i] : 0)));
  X.forEach((x) => {
    const s = sigmoid(dot(x, w));
    const v = s * (1 - s);
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) H[i][j] += v * x[i] * x[j];
  });
  const cov = inverse(H);
  return { mean: w, cov, iters: iters + 1 };
}

// ------------------------------------------------------------------ outcomes (persisted in data/learning/)
export function readOutcomes(): OutcomeEntry[] {
  if (!existsSync(OUTCOMES_FILE)) return [];
  try {
    const v = JSON.parse(readFileSync(OUTCOMES_FILE, "utf-8"));
    return Array.isArray(v) ? (v as OutcomeEntry[]) : [];
  } catch {
    return [];
  }
}
function writeOutcomes(list: OutcomeEntry[]) {
  if (!existsSync(LEARNING_DIR)) mkdirSync(LEARNING_DIR, { recursive: true });
  writeFileSync(OUTCOMES_FILE, JSON.stringify(list, null, 2), "utf-8");
}

/** The latest outcome per spot (a later crew report for the same spot replaces the earlier one). */
function latestPerSpot(list: OutcomeEntry[]): OutcomeEntry[] {
  const m = new Map<string, OutcomeEntry>();
  for (const e of list) m.set(e.spot_id.toUpperCase(), e);
  return [...m.values()];
}

// ------------------------------------------------------------------ state
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function modelNote(n: number): Bilingual {
  return n > 0
    ? {
        en: `Learned from ${n} demo label${n === 1 ? "" : "s"} entered in this demo, not real field results.`,
        ar: `تعلّم من ${n} ${n === 1 ? "تسمية تجريبية" : "تسميات تجريبية"} أُدخلت في هذا العرض، وليست نتائج ميدانية حقيقية.`,
      }
    : { en: "Prior only (the dispatch rule): no crew outcome entered yet.", ar: "المعرفة المسبقة فقط (قاعدة الإرسال): لم تُدخل أي نتيجة فريق بعد." };
}

export type LearningState = ReturnType<typeof computeState>;

/** Pure: the model state for a given outcome list (used by the routes, the assistant tool and the math check). */
export function computeState(outcomes: OutcomeEntry[]) {
  const spots = loadSpots().features.map((f) => f.properties);
  const ctx: Ctx = {
    hh: mean(spots.map((p) => p.hh_rise_db)),
    hv: mean(spots.map((p) => p.hv_rise_db)),
    logArea: mean(spots.map((p) => Math.log10(p.area_m2))),
  };
  const xOf = (p: SpotProps) => FEATURES.map((f) => f.x(p, ctx));
  const priorMean = FEATURES.map((f) => f.prior);
  const priorStd = FEATURES.map((f) => f.prior_std);

  const labels = latestPerSpot(outcomes).filter((e) => findSpot(e.spot_id));
  const X = labels.map((e) => xOf(findSpot(e.spot_id)!.properties));
  const y = labels.map((e) => (e.outcome === "leak" ? 1 : 0));
  const post = labels.length ? fitPosterior(X, y, priorMean, priorStd) : { mean: priorMean, cov: priorStd.map((s, i) => priorStd.map((_, j) => (i === j ? s * s : 0))), iters: 0 };

  const rows = spots.map((p) => {
    const x = xOf(p);
    const z = dot(x, post.mean);
    const zsd = Math.sqrt(Math.max(0, dot(x, post.cov.map((row) => dot(row, x)))));
    return { p, x, score: sigmoid(z), prior_score: sigmoid(dot(x, priorMean)), band: [sigmoid(z - zsd), sigmoid(z + zsd)] as [number, number] };
  });
  const rankBy = (key: "score" | "prior_score") => {
    const order = [...rows].sort((a, b) => b[key] - a[key]).map((r) => r.p.spot_id);
    return (id: string) => order.indexOf(id) + 1;
  };
  const rank = rankBy("score"), priorRank = rankBy("prior_score");
  const labelOf = new Map(labels.map((e) => [e.spot_id.toUpperCase(), e.outcome]));

  const n = labels.length;
  return {
    model: "Bayesian logistic regression (Gaussian prior = dispatch rule; Newton/IRLS MAP; Laplace posterior)",
    score_name: {
      en: "Dispatch score (0-1), not a probability of a leak",
      ar: "درجة الإرسال (0-1)، وليست احتمال وجود تسرب",
    },
    n_labels: n,
    n_outcomes_logged: outcomes.length,
    labels: labels.map((e) => ({ id: e.id, spot_id: e.spot_id, outcome: e.outcome, note: e.note, ts: e.ts, source: e.source })),
    provenance: n > 0 ? "DEMO LABEL" : "PLAN",
    model_note: modelNote(n),
    prior_note: {
      en: "The prior mean encodes the current dispatch rule: near a pipe + built-up => inspect; far + farmland => skip. Radar features start at 0.",
      ar: "متوسط المعرفة المسبقة يرمّز قاعدة الإرسال الحالية: قرب أنبوب + منطقة مبنية => افحص؛ بعيد + أرض زراعية => تجاوز. خصائص الرادار تبدأ من 0.",
    },
    weights: FEATURES.map((f, i) => ({
      name: f.name,
      label: f.label,
      transform: f.transform,
      prior: f.prior,
      prior_std: f.prior_std,
      posterior: r3(post.mean[i]),
      std: r3(Math.sqrt(post.cov[i][i])),
      moved: r3(post.mean[i] - f.prior),
    })),
    spots: rows
      .map((r) => ({
        id: r.p.spot_id,
        score: r3(r.score),
        rank: rank(r.p.spot_id),
        prior_score: r3(r.prior_score),
        prior_rank: priorRank(r.p.spot_id),
        /** places moved up (+) or down (-) versus the prior ranking */
        change: priorRank(r.p.spot_id) - rank(r.p.spot_id),
        score_delta: r3(r.score - r.prior_score),
        /** score at the posterior mean -/+ one posterior std of the linear predictor */
        band: [r3(r.band[0]), r3(r.band[1])] as [number, number],
        label: labelOf.get(r.p.spot_id.toUpperCase()) ?? null,
        features: Object.fromEntries(FEATURES.slice(1).map((f) => [f.name, f.raw(r.p)])),
      }))
      .sort((a, b) => a.rank - b.rank),
    fit: { iterations: post.iters },
    sources: { spots: `data/${FILES.spots}`, outcomes: OUTCOMES_REL },
  };
}

export const learningState = () => computeState(readOutcomes());

// ------------------------------------------------------------------ routes
const router = new Hono();

router.get("/state", (c) => c.json(learningState()));

router.post("/outcome", async (c) => {
  let body: { spot_id?: unknown; outcome?: unknown; note?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    /* validated below */
  }
  const spot = typeof body.spot_id === "string" ? findSpot(body.spot_id.trim()) : null;
  if (!spot)
    return c.json(
      {
        error: "bad_request",
        message: { en: `Unknown spot_id ${JSON.stringify(body.spot_id ?? null)}`, ar: `معرّف بقعة غير معروف ${JSON.stringify(body.spot_id ?? null)}` },
      },
      400,
    );
  if (body.outcome !== "leak" && body.outcome !== "no_leak")
    return c.json({ error: "bad_request", message: { en: 'outcome must be "leak" or "no_leak"', ar: 'يجب أن تكون النتيجة "leak" أو "no_leak"' } }, 400);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const list = readOutcomes();
  const before = computeState(list).spots.find((s) => s.id === spot.properties.spot_id)!;
  const entry: OutcomeEntry = {
    id: `L${list.length + 1}`,
    ts: new Date().toISOString(),
    spot_id: spot.properties.spot_id,
    outcome: body.outcome,
    note,
    source: "demo",
  };
  list.push(entry);
  writeOutcomes(list);
  const state = computeState(list);
  const after = state.spots.find((s) => s.id === spot.properties.spot_id)!;
  audit({
    kind: "outcome",
    action: "learning.outcome",
    actor: "demo user",
    source: "demo",
    summary: {
      en: `Demo crew label for ${entry.spot_id}: ${entry.outcome === "leak" ? "leak" : "no leak"} (entered in this demo, not a real field result). Dispatch score ${before.score} -> ${after.score}.`,
      ar: `تسمية فريق تجريبية لـ ${entry.spot_id}: ${entry.outcome === "leak" ? "تسرب" : "لا تسرب"} (أُدخلت في هذا العرض، وليست نتيجة ميدانية حقيقية). درجة الإرسال ${before.score} -> ${after.score}.`,
    },
    data: { ...entry, score_before: before.score, score_after: after.score, rank_before: before.rank, rank_after: after.rank, n_labels: state.n_labels },
  });
  return c.json({
    entry,
    before: { score: before.score, rank: before.rank },
    after: { score: after.score, rank: after.rank },
    state,
  });
});

router.post("/reset", (c) => {
  const cleared = readOutcomes();
  writeOutcomes([]);
  audit({
    kind: "reset",
    action: "learning.reset",
    actor: "demo user",
    source: "demo",
    summary: {
      en: `Learning reset to the prior (the dispatch rule); ${cleared.length} demo label(s) cleared.`,
      ar: `أُعيد التعلّم إلى المعرفة المسبقة (قاعدة الإرسال)؛ حُذفت ${cleared.length} تسمية تجريبية.`,
    },
    data: { cleared },
  });
  return c.json({ cleared: cleared.length, state: computeState([]) });
});

export default router;
