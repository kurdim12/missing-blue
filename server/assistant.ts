// "Ask Missing Blue": a Claude chat agent with read-only tools over data/. It answers in the user's language
// (Arabic or English), copies numbers exactly from tool results, says "not in the data" when it cannot answer and
// never claims a confirmed leak. Every number in the final answer is checked against the tool results; an answer that
// fails the check is repaired once, then falls back.
//
// GET  /api/assistant  -> {live, model, effort, tools, suggestions:[{id, en, ar, recorded:{en, ar}}]}
// POST /api/assistant  {question, lang?: "en"|"ar", suggestion_id?, history?: [{role, content}], mode?: "auto"|"recorded"}
//   Server-Sent Events (every event carries `source: "live" | "recorded" | "unavailable"`):
//   start       {source, lang, model?, why?, recorded?}   a run begins (a fallback sends a second start: the client resets)
//   status      {phase, turn}                          a new model turn: the text draft restarts here
//   tool_call   {i, name, input}
//   tool_result {i, name, input, result, is_error}     computed from data/ (also when replaying a recorded run)
//   delta       {text, turn}                           answer text as it streams (draft = deltas since the last status)
//   final       {answer, tools_used, usage, checks, lang, model?, recorded?, suggestions?}   `answer` is authoritative
//   done        {}
//   error       {message:{en,ar}}
//
// No key, or any live error / failed number check: the recorded live answer for that suggested question is replayed
// (server/recorded/assistant.json, tool calls re-executed against data/). A question with no recording gets an honest
// "live AI unavailable" answer (source "unavailable"); nothing is invented.
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { audit } from "./audit";
import { FILES, MissingDataError, ROOT, findSpot, has, loadSpots, loadTwin, nearestPipe, readData, tryReadData, type Bilingual } from "./data";
import { learningState } from "./learning";
// type-only imports inside this module are erased at runtime: it is plain data shared with the Sources screen
import { CITED, DATASETS, DAYS_PER_YEAR, LITRES_PER_M3, SECONDS_PER_DAY } from "../src/features/story/sources";

const model = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ASSISTANT_EFFORT === "medium" ? "medium" : "low") as "low" | "medium";
const MAX_TOKENS = 8000;
const MAX_TURNS = 8;
const LIVE_TIMEOUT_MS = 120_000;
const DISPATCH_RADIUS_M = 40;
const DROP_THRESHOLD_M = 1;
const RECORDED_FILE = join(ROOT, "server", "recorded", "assistant.json");
export const RECORDED_LABEL: Bilingual = { en: "Recorded run", ar: "تشغيل مسجّل" };

export type Lang = "en" | "ar";
type ToolRun = { name: string; input: Record<string, unknown>; result: unknown; is_error: boolean };
type HistoryItem = { role: "user" | "assistant"; content: string };

/** The four suggested questions (both languages). Recorded live answers exist for each (server/recorded/assistant.json). */
export const SUGGESTIONS: { id: string; en: string; ar: string }[] = [
  { id: "w7_vs_w5", en: "Why does W7 get a crew and W5 not?", ar: "لماذا يُرسَل فريق إلى W7 ولا يُرسَل إلى W5؟" },
  { id: "loggers_w7", en: "Why can't pressure loggers see a small leak at W7?", ar: "لماذا لا ترى أجهزة تسجيل الضغط تسربًا صغيرًا عند W7؟" },
  { id: "gap_e", en: "How sure is the AI about Gap E?", ar: "ما مدى ثقة الذكاء الاصطناعي بشأن الفجوة E؟" },
  { id: "leak_water", en: "What would one hidden 1 L/s leak cost in water?", ar: "كم يكلّف تسرب خفي واحد بمعدل 1 لتر/ثانية من المياه؟" },
];

/** Claude client: the SDK reads ANTHROPIC_API_KEY; a key scoped to a workspace also needs the anthropic-workspace-id
 *  header (the API answers 400 without it), which the SDK does not read from the environment. Same as server/triage.ts. */
export function makeClaudeClient() {
  const ws = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {});
}

// ------------------------------------------------------------------ tools (read-only, all from data/)
const accuracyM = () => Math.max(...loadSpots().features.map((f) => f.properties.position_accuracy_m));
const spotIds = () => loadSpots().features.map((f) => f.properties.spot_id);
const ruleVerdict = (within: boolean) => (within ? "inspect" : "skip");

function metres(lon1: number, lat1: number, lon2: number, lat2: number) {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180),
    ky = 110574;
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * ky);
}
const toolError = (code: string, en: string, ar: string, extra: Record<string, unknown> = {}) => ({
  result: { error: code, message: { en, ar }, ...extra },
  is_error: true,
});
function spotArg(input: Record<string, unknown>) {
  const id = String(input?.spot_id ?? input?.id ?? "").trim();
  return { id, f: id ? findSpot(id) : null };
}
const unknownSpot = (id: string) =>
  toolError("unknown_spot", `No wet spot "${id}". Known spots: ${spotIds().join(", ")}.`, `لا توجد بقعة رطبة "${id}". البقع المعروفة: ${spotIds().join(", ")}.`);

const TWIN_SCENARIOS = ["base", "svc1", "m5", "m15", "far15"] as const;
const leakLps = (scenario: string) => Number(scenario.replace(/\D/g, "")); // the key encodes the ASSUMED leak size (svc1 = 1 L/s)
const LEAK_AT: Record<string, string> = { svc1: "cand", m5: "main", m15: "main", far15: "far" };
const r2 = (v: number) => Math.round(v * 100) / 100;

function runTool(name: string, input: Record<string, unknown>): { result: unknown; is_error: boolean } {
  try {
    switch (name) {
      case "list_wet_spots": {
        const fc = loadSpots();
        return {
          is_error: false,
          result: {
            count: fc.features.length,
            passes: fc.features[0]?.properties.passes ?? [],
            rain_check: fc.rain_check ?? null,
            position_accuracy_m: accuracyM(),
            dispatch_rule: {
              dispatch_radius_m: DISPATCH_RADIUS_M,
              rule: `Send a crew only to a spot whose centre is within ${DISPATCH_RADIUS_M} m of a real pipe; skip spots far from any pipe on farmland (most likely irrigation).`,
            },
            spots: fc.features.map(({ properties: p }) => ({
              spot_id: p.spot_id,
              area_m2: p.area_m2,
              hh_rise_db: p.hh_rise_db,
              hv_rise_db: p.hv_rise_db,
              spot_centre_to_pipe_m: Math.round(p.nearest_pipe_m),
              within_40m: p.on_pipe_40m,
              land_cover_2025: p.landcover_2025,
              rule_verdict: ruleVerdict(p.on_pipe_40m),
            })),
            note: "Wet spots are inspection candidates found by NISAR radar (REAL), never confirmed leaks.",
            source: `data/${FILES.spots}`,
          },
        };
      }
      case "spot_detail": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            area_m2: p.area_m2,
            hh_rise_db: p.hh_rise_db,
            hv_rise_db: p.hv_rise_db,
            rise_is_versus: "the first pass",
            passes: p.passes,
            ground_hh_db_within_400m: p.ground_hh_db_400m,
            spot_centre_to_pipe_m: Math.round(p.nearest_pipe_m),
            within_40m: p.on_pipe_40m,
            nearest_pipe: p.nearest_pipe,
            land_cover: ([2023, 2024, 2025] as const).map((year) => ({ year, class: p[`landcover_${year}`] })),
            position_accuracy_m: p.position_accuracy_m,
            dispatch_radius_m: DISPATCH_RADIUS_M,
            rule_verdict: ruleVerdict(p.on_pipe_40m),
            note: `Inspection candidate, not a confirmed leak. Position accurate to about ±${p.position_accuracy_m} m.`,
            provenance: "REAL: NISAR L-band radar; Karak pipe record; Sentinel-2 land cover",
            source: `data/${FILES.spots}`,
          },
        };
      }
      case "nearest_pipe": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        let record: Record<string, unknown> | null = null;
        if (has(FILES.pipes)) {
          const n = nearestPipe(p.lon, p.lat);
          if (n)
            record = {
              diameter_in: n.properties.diameter_in,
              material: n.properties.material,
              class: n.properties.class,
              matches_spot_file: n.properties.cad_layer === p.nearest_pipe_layer,
            };
        }
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            spot_centre_to_pipe_m: Math.round(p.nearest_pipe_m),
            within_40m: p.on_pipe_40m,
            pipe: p.nearest_pipe,
            position_accuracy_m: p.position_accuracy_m,
            note: `Measured from the radar spot centre; the spot position is accurate to about ±${p.position_accuracy_m} m.`,
            pipe_record: record,
            ...(record ? {} : { pipe_record_missing: new MissingDataError(FILES.pipes).toJSON() }),
            source: `data/${FILES.spots}`,
          },
        };
      }
      case "land_cover": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            land_cover: ([2023, 2024, 2025] as const).map((year) => ({ year, class: p[`landcover_${year}`] })),
            dataset: "Sentinel-2 10 m Land Use/Land Cover (Impact Observatory, Microsoft, Esri)",
            source: `data/${FILES.spots}`,
          },
        };
      }
      case "twin_scenario": {
        const scenario = String(input?.scenario ?? "base");
        if (!(TWIN_SCENARIOS as readonly string[]).includes(scenario))
          return toolError("bad_scenario", `scenario must be one of ${TWIN_SCENARIOS.join(", ")}`, `السيناريو يجب أن يكون أحد: ${TWIN_SCENARIOS.join(", ")}`);
        const t = loadTwin(); // MissingDataError in a fresh clone (held back: pipe coordinates)
        const nodes = t.nodes as Record<string, number>[];
        const zone = { junctions: t.stats.junctions, pipes: t.stats.pipes, km: t.stats.km, demand_lps_assumed: t.stats.demand_lps };
        const provenance = "Network geometry REAL (Karak pipe record); demand, tank level and leak size ASSUMED; pressures SIMULATED (EPANET)";
        if (scenario === "base")
          return {
            is_error: false,
            result: {
              scenario,
              zone,
              pressure_m: { min: t.stats.p_min, median: t.stats.p_med, max: t.stats.p_max },
              assumptions: t.assumptions,
              provenance,
              source: `data/${FILES.twin}`,
            },
          };
        const lps = leakLps(scenario);
        const key = LEAK_AT[scenario];
        const at = t[key] as { lat: number; lon: number };
        const nearSpot = loadSpots().features.find((s) => metres(s.properties.lon, s.properties.lat, at.lon, at.lat) <= s.properties.position_accuracy_m);
        const drops = nodes.map((n) => n[scenario]);
        const perDay = (lps * SECONDS_PER_DAY) / LITRES_PER_M3;
        return {
          is_error: false,
          result: {
            scenario,
            leak_lps_assumed: lps,
            leak_location:
              key === "cand"
                ? `service pipe at the ${nearSpot?.properties.spot_id ?? "candidate"} wet spot`
                : key === "main"
                  ? "on the main near the tank"
                  : "far end of the zone",
            near_wet_spot: nearSpot?.properties.spot_id ?? null,
            junctions_dropping_over_1m: drops.filter((v) => v > DROP_THRESHOLD_M).length,
            ...(scenario === "svc1" ? { other_junctions_dropping_over_1m_excluding_the_leak_junction: t.stats.n_drop_gt1m_excl_svc } : {}),
            zone_junctions: nodes.length,
            max_drop_m: r2(Math.max(...drops)),
            threshold_m: DROP_THRESHOLD_M,
            water_lost_if_it_runs: {
              m3_per_day: r2(perDay),
              m3_per_year: Math.round(perDay * DAYS_PER_YEAR),
              how: `${lps} L/s × ${SECONDS_PER_DAY} s per day ÷ ${LITRES_PER_M3} L per m³; × ${DAYS_PER_YEAR} days per year`,
              note: "Water volume only; there is no water price in this demo's data.",
            },
            zone,
            provenance,
            source: `data/${FILES.twin}`,
          },
        };
      }
      case "hf_results": {
        const res = tryReadData<any>(FILES.hfResults);
        const rob = readData<any>(FILES.hfRobustness);
        const s9 = readData<any>(FILES.hfScale9);
        const LETTERS = "ABCDEFGHIJ".split("");
        const pct = (v: number) => Math.round(v * 1000) / 10;
        const nGaps = (rob.nominal_test?.bayes ?? []).length;
        const gaps = Array.from({ length: nGaps }, (_, i) => {
          const id = res?.gap_order?.[i] ?? null;
          const g = id ? (res.gaps as any[]).find((x) => x.id === id) : null;
          return {
            gap: LETTERS[i],
            record_gap_id: id,
            gap_length_m: g?.gap_m ?? null,
            pipe_in: g?.pipe_in ?? null,
            test_accuracy_pct_ai: rob.nominal_test.bayes[i],
            test_accuracy_pct_ai_when_network_differs: rob.shifted_test.bayes[i],
            test_accuracy_pct_plain_algorithm: rob.nominal_test.algorithm[i],
            ...(res?.eval
              ? {
                  accuracy_pct_by_logger_count: Object.fromEntries(
                    Object.entries(res.eval as Record<string, any>).map(([k, v]) => [`${k}_loggers`, pct(v.bayes_gap_acc[i])]),
                  ),
                }
              : {}),
          };
        });
        return {
          is_error: false,
          result: {
            what: "HydroFingerprint decides which gaps in the pipe map are real connections from pressure readings at a few loggers.",
            gaps,
            all_gaps_right_pct: {
              ai: rob.nominal_test.bayes_all5,
              plain_algorithm: rob.nominal_test.algorithm_all5,
              ai_when_network_differs: rob.shifted_test.bayes_all5,
              plain_algorithm_when_network_differs: rob.shifted_test.algorithm_all5,
            },
            calibration: {
              brier: rob.nominal_test.brier,
              ece: rob.nominal_test.ece,
              confident_share_pct: rob.nominal_test.confident_share_pct,
              accuracy_when_confident_pct: rob.nominal_test.accuracy_when_confident_pct,
              test_cases: rob.nominal_test.n,
            },
            coin_toss_note:
              "About 50% accuracy is a coin toss: pressure barely changes when that gap opens or closes, so the system says 'can't tell yet' and sends a crew to check the valve chamber instead of guessing.",
            ...(res
              ? {
                  simulations: { scenarios: res.n_scenarios, train: res.n_train, validation: res.n_val, test: res.n_test },
                  network: { nodes: res.network.nodes, pipes: res.network.pipes, gaps_in_pipe_map: res.network.gaps_found },
                  information_bits_by_logger_count: (res.curve_ig as any[]).map((c) => ({ loggers: c.n_sensors, bits: c.info_bits })),
                }
              : { results_missing: new MissingDataError(FILES.hfResults).toJSON() }),
            scale_9_gaps: {
              all_gaps_right_pct_ai_15_loggers: s9.eval_15.bayes_all,
              all_gaps_right_pct_plain_algorithm_15_loggers: s9.algorithm_15.all,
              reference_simulations_needed_by_plain_algorithm: s9.algorithm_15.reference_sims,
            },
            provenance: "Pressure readings SIMULATED (EPANET/WNTR) on the REAL pipe-network geometry; accuracies are on held-out simulated test cases",
            source: [`data/${FILES.hfRobustness}`, `data/${FILES.hfScale9}`, ...(res ? [`data/${FILES.hfResults}`] : [])],
          },
        };
      }
      case "sources": {
        const acc = `±${accuracyM()} m`;
        return {
          is_error: false,
          result: {
            datasets: DATASETS.map((d) => ({
              id: d.id,
              name: d.name.en,
              use: d.use.en.replace("{acc}", acc),
              licence: d.licence.en,
              kind: d.kind,
              file: d.file ?? null,
              link: d.links[0]?.url ?? null,
            })),
            cited_context: {
              non_revenue_water_pct: { value: CITED.nrw.value, date: CITED.nrw.date, who: CITED.nrw.who.en, url: CITED.nrw.url },
              target_pct: { value: CITED.nrwTarget.value, year: CITED.nrwTarget.year, who: CITED.nrwTarget.who.en },
              nisar_repeat_days: { value: CITED.repeatDays.value, who: CITED.repeatDays.who.en },
            },
            source: "src/features/story/sources.ts (from SOURCES.md)",
          },
        };
      }
      case "learning_state": {
        const s = learningState();
        return {
          is_error: false,
          result: {
            score_name: s.score_name.en,
            model: s.model,
            model_note: s.model_note.en,
            prior_note: s.prior_note.en,
            n_labels: s.n_labels,
            labels: s.labels.map((l) => ({ spot_id: l.spot_id, outcome: l.outcome, source: "demo label entered in this demo" })),
            weights: s.weights.map((w) => ({ name: w.name, prior: w.prior, posterior: w.posterior, std: w.std })),
            spots: s.spots.map((x) => ({ id: x.id, score: x.score, rank: x.rank, prior_score: x.prior_score, prior_rank: x.prior_rank })),
            source: s.sources.outcomes,
          },
        };
      }
      default:
        return toolError("unknown_tool", `Unknown tool ${name}`, `أداة غير معروفة ${name}`);
    }
  } catch (e) {
    if (e instanceof MissingDataError) return { result: e.toJSON(), is_error: true };
    return toolError("tool_failed", String((e as Error)?.message ?? e), "فشل تنفيذ الأداة");
  }
}

const SPOT_PARAM = {
  type: "object" as const,
  properties: { spot_id: { type: "string", description: "Wet spot id, e.g. W7" } },
  required: ["spot_id"],
};
const NO_PARAMS = { type: "object" as const, properties: {} };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_wet_spots",
    description:
      "All persistent wet spots (W1-W7) NISAR radar found over Karak, Mu'tah and Mazar: area, HH/HV radar rise in dB, whole-metre distance from the spot centre to the nearest real pipe, whether that is within the 40 m dispatch radius, 2025 land cover and the dispatch rule's verdict; plus the radar pass dates, the rain check and the position accuracy.",
    input_schema: NO_PARAMS,
  },
  {
    name: "spot_detail",
    description: "Everything the data holds about one wet spot: radar rise, pass dates, area, distance to the nearest pipe, pipe size and material, land cover 2023-2025, position accuracy and the dispatch rule's verdict.",
    input_schema: SPOT_PARAM,
  },
  {
    name: "nearest_pipe",
    description: "Distance in whole metres from a wet spot's centre to the nearest pipe in the real Karak network record, whether it is within 40 m, and the pipe's size, material and class from the pipe file when present.",
    input_schema: SPOT_PARAM,
  },
  {
    name: "land_cover",
    description: "Land-cover class at a wet spot for 2023, 2024 and 2025 (Sentinel-2 10 m Land Use/Land Cover).",
    input_schema: SPOT_PARAM,
  },
  {
    name: "twin_scenario",
    description:
      "Hydraulic digital twin of the Mazar zone (EPANET results). base = normal day (pressure range); svc1 = a 1 L/s leak on the service pipe at a wet spot; m5 / m15 = 5 / 15 L/s leaks on the main; far15 = a 15 L/s main break at the far end. Returns how many junctions lose more than 1 m of pressure (what a pressure logger could notice), the largest drop, and the water volume the assumed leak loses per day and per year. Leak sizes, demand and tank level are ASSUMED.",
    input_schema: {
      type: "object",
      properties: { scenario: { type: "string", enum: [...TWIN_SCENARIOS] } },
      required: ["scenario"],
    },
  },
  {
    name: "hf_results",
    description:
      "HydroFingerprint results: for each pipe-map gap (A-E) how often the AI decides correctly whether it is a real connection (held-out simulated tests, also when the network differs from the model), versus a plain least-squares algorithm; accuracy by number of pressure loggers; calibration; information gained per logger.",
    input_schema: NO_PARAMS,
  },
  {
    name: "sources",
    description: "Every dataset and cited figure this demo uses: name, what it is used for, licence, provenance (REAL / CONTEXT), data file and link.",
    input_schema: NO_PARAMS,
  },
  {
    name: "learning_state",
    description:
      "The adaptive dispatch model: a Bayesian logistic regression whose prior is the dispatch rule, updated by crew outcomes entered in this demo (demo labels, not real field results). Returns the weights (prior, posterior, std), each spot's dispatch score (0-1, not a probability of a leak) and rank before and after learning.",
    input_schema: NO_PARAMS,
  },
];

function systemPrompt(lang: Lang) {
  const fc = loadSpots();
  const passes = fc.features[0]?.properties.passes ?? [];
  const ids = spotIds();
  const language =
    lang === "ar"
      ? "Answer in Modern Standard Arabic only. Keep Latin digits (0-9), spot ids (W7), gap letters (Gap E -> الفجوة E) and units (m, m³, L/s, dB) as written."
      : "Answer in English only.";
  return `You are "Ask Missing Blue", the question-answering agent of Missing Blue: a leak-finding demo for the water utility in Karak, Jordan. NASA-ISRO NISAR L-band radar (passes ${passes.join(", ")}) flagged persistent wet spots ${ids[0]}-${ids[ids.length - 1]}. Each is checked against the real Karak pipe record and land cover; a hydraulic twin of the Mazar zone shows what pressure loggers could notice; HydroFingerprint decides which gaps in the pipe map are real connections from simulated pressure readings; an adaptive dispatch model learns from crew outcomes entered in this demo.

Use the tools to answer the user's question, then answer once. Rules:
1. ${language}
2. Every number you write must be copied from a tool result in this conversation (rounding is fine, e.g. 1399.5 m -> 1,400 m or 1.4 km). Do not compute new figures, convert units yourself, or estimate costs or prices. If a figure is not in the tool results, do not write it.
3. If the tools cannot answer the question, say plainly that it is not in the data${lang === "ar" ? " (غير موجود في البيانات)" : ""} and say what the data does cover. Never guess.
4. A wet spot is an inspection candidate, never a confirmed leak. Never write that a leak was found or confirmed.
5. Radar positions are accurate to about ±${accuracyM()} m: write "the spot centre is X m from the pipe", in whole metres.
6. Say what is simulated or assumed when you use it: twin pressures are simulated and leak sizes and demand are assumed; HydroFingerprint readings are simulated; the adaptive model learns only from demo labels entered in this demo (not real field results) and its dispatch score is not a probability of a leak.
7. Style: 2 to 5 short sentences of plain text. No headings, tables, lists or markdown. Do not write anything before your tool calls.`;
}

// ------------------------------------------------------------------ checks on the answer
const NUM_RE = /(?<![A-Za-z\d.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g;
const numberOf = (m: RegExpMatchArray) => Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
/** Arabic-Indic digits and separators -> Latin, so an Arabic answer is checked like an English one. */
const latinDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");

function collectNumbers(v: unknown, into: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) into.push(Math.abs(v));
  else if (typeof v === "string") for (const m of latinDigits(v).matchAll(NUM_RE)) into.push(numberOf(m));
  else if (Array.isArray(v)) {
    into.push(v.length); // "3 passes", "7 spots" are counts of what a tool returned
    v.forEach((x) => collectNumbers(x, into));
  } else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, into));
  return into;
}

export function checkNumbers(answer: string, pool: number[]) {
  const text = latinDigits(answer).replace(/^\s*\d+[.)]\s/gm, ""); // list markers are not figures
  const found: { text: string; match: "exact" | "rounded" | "none" }[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const n = numberOf(m);
    const decimals = m[2] ? m[2].length - 1 : 0;
    const tol = 0.5 * 10 ** -decimals + 1e-9;
    let match: "exact" | "rounded" | "none" = "none";
    for (const v of pool) {
      if (Math.abs(n - v) < 1e-9) {
        match = "exact";
        break;
      }
      // rounded; metres written as km; a 0-1 fraction written as a percentage
      if (Math.abs(n - v) <= tol || Math.abs(n * 1000 - v) <= tol * 1000 || (v <= 1 && Math.abs(n - v * 100) <= tol)) match = "rounded";
    }
    found.push({ text: m[0], match });
  }
  return {
    total: found.length,
    matched: found.filter((f) => f.match !== "none").length,
    rounded: found.filter((f) => f.match === "rounded").map((f) => f.text),
    unmatched: found.filter((f) => f.match === "none").map((f) => f.text),
  };
}

const CLAIM_EN = /\b(confirmed leaks?|leaks? (?:was |were |is |are |has been |have been )?(?:found|confirmed))\b/gi;
const CLAIM_AR = /(تسربا? مؤكد|تأكد (?:وجود )?(?:ال)?تسرب|تم (?:العثور على|تأكيد) (?:ال)?تسرب)/g; // matched without tashkeel
const NEG_EN = /\b(not|never|no|isn't|aren't|wasn't|weren't|cannot|can't|unconfirmed|without)\b/i;
const NEG_AR = /(ليس|ليست|لا |لم |غير |دون )/;
/** Phrases that state a leak is confirmed (a negated phrase, e.g. "not a confirmed leak", is fine). */
export function checkClaims(text: string): string[] {
  const answer = text.replace(/[ً-ْ]/g, "");
  const out: string[] = [];
  for (const [re, neg] of [
    [CLAIM_EN, NEG_EN],
    [CLAIM_AR, NEG_AR],
  ] as const)
    for (const m of answer.matchAll(re)) {
      const before = answer.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
      if (!neg.test(before)) out.push(m[0]);
    }
  return out;
}

function checkAnswer(answer: string, runs: ToolRun[], extra: string[]) {
  const pool = collectNumbers([runs.map((r) => r.result), extra]);
  const numbers = checkNumbers(answer, pool);
  const claims = checkClaims(answer);
  return { ok: numbers.unmatched.length === 0 && claims.length === 0 && answer.trim().length > 0, numbers, claims };
}

// ------------------------------------------------------------------ live run
class LiveStop extends Error {
  why: Bilingual;
  constructor(why: Bilingual) {
    super(why.en);
    this.why = why;
  }
}
type Send = (event: string, data: Record<string, unknown>) => Promise<void>;
const noSend: Send = async () => {};

export type LiveAnswer = {
  answer: string;
  calls: { name: string; input: Record<string, unknown> }[];
  tools_used: string[];
  checks: ReturnType<typeof checkAnswer>;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; requests: number };
  model: string;
};

/** One live answer (also used to record server/recorded/assistant.json). Throws LiveStop / SDK errors on failure. */
export async function askLive(question: string, lang: Lang, history: HistoryItem[] = [], send: Send = noSend, signal?: AbortSignal): Promise<LiveAnswer> {
  const client = makeClaudeClient();
  const MODEL = model();
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt(lang), cache_control: { type: "ephemeral" } }];
  const messages: Anthropic.MessageParam[] = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: question }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, requests: 0 };
  const runs: ToolRun[] = [];
  const extra = [question, ...history.map((h) => h.content)];
  let i = 0;
  let repaired = false;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    await send("status", { source: "live", phase: repaired ? "repairing" : "thinking", turn });
    // thinking stays at the model default (adaptive); depth is set with output_config.effort
    const stream = client.messages.stream(
      { model: MODEL, max_tokens: MAX_TOKENS, system, tools: TOOLS, messages, output_config: { effort: EFFORT } },
      signal ? { signal } : undefined,
    );
    let chain = Promise.resolve();
    stream.on("text", (delta) => {
      chain = chain.then(() => send("delta", { source: "live", text: delta, turn }));
    });
    const message = await stream.finalMessage();
    await chain;
    usage.requests++;
    usage.input_tokens += message.usage.input_tokens ?? 0;
    usage.output_tokens += message.usage.output_tokens ?? 0;
    usage.cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;

    // stop_reason first, before reading any content
    if (message.stop_reason === "refusal") throw new LiveStop({ en: "Claude declined this request (refusal).", ar: "رفض Claude هذا الطلب." });
    if (message.stop_reason === "max_tokens")
      throw new LiveStop({ en: `The answer hit the ${MAX_TOKENS}-token limit.`, ar: `بلغ الرد حد ${MAX_TOKENS} رمزًا.` });
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) {
      const answer = message.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      const checks = checkAnswer(answer, runs, extra);
      if (checks.ok)
        return { answer, calls: runs.map((r) => ({ name: r.name, input: r.input })), tools_used: [...new Set(runs.map((r) => r.name))], checks, usage, model: MODEL };
      if (repaired)
        throw new LiveStop({
          en: `The live answer had figures not found in the data (${checks.numbers.unmatched.join(", ") || checks.claims.join(", ")}).`,
          ar: `احتوى الرد المباشر على أرقام غير موجودة في البيانات (${checks.numbers.unmatched.join("، ") || checks.claims.join("، ")}).`,
        });
      repaired = true;
      messages.push({ role: "assistant", content: message.content });
      const problems = [
        checks.numbers.unmatched.length ? `these numbers are not in any tool result: ${checks.numbers.unmatched.join(", ")}` : "",
        checks.claims.length ? `it states a confirmed leak (${checks.claims.join(", ")})` : "",
        answer ? "" : "it is empty",
      ].filter(Boolean);
      messages.push({
        role: "user",
        content: `Your answer breaks the rules: ${problems.join("; ")}. Rewrite it using only numbers copied from tool results (call a tool if you need a figure), in the same language.`,
      });
      continue;
    }

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      const n = i++;
      await send("tool_call", { source: "live", i: n, name: u.name, input });
      const r = runTool(u.name, input);
      runs.push({ name: u.name, input, ...r });
      await send("tool_result", { source: "live", i: n, name: u.name, input, result: r.result, is_error: r.is_error });
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.result), ...(r.is_error ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new LiveStop({ en: `No answer after ${MAX_TURNS} turns.`, ar: `لا إجابة بعد ${MAX_TURNS} جولات.` });
}

function whyLiveFailed(e: unknown): Bilingual {
  if (e instanceof LiveStop) return e.why;
  if (e instanceof Anthropic.AuthenticationError) return { en: "The API key was rejected.", ar: "رُفض مفتاح الواجهة البرمجية." };
  if (e instanceof Anthropic.RateLimitError) return { en: "The Claude API is rate-limited right now.", ar: "واجهة Claude مقيّدة بحد الطلبات الآن." };
  if (e instanceof Anthropic.APIUserAbortError) return { en: "The live answer timed out.", ar: "انتهت مهلة الإجابة المباشرة." };
  if (e instanceof Anthropic.APIConnectionError) return { en: "Cannot reach the Claude API (offline?).", ar: "تعذّر الوصول إلى واجهة Claude (لا اتصال؟)." };
  if (e instanceof Anthropic.APIError) return { en: `The Claude API returned an error (${e.status ?? "?"}).`, ar: `أعادت واجهة Claude خطأ (${e.status ?? "?"}).` };
  return { en: "The live answer failed.", ar: "فشلت الإجابة المباشرة." };
}

// ------------------------------------------------------------------ recorded answers
type RecordedAnswer = {
  id: string;
  lang: Lang;
  question: string;
  answer: string;
  calls: { name: string; input: Record<string, unknown> }[];
  tools_used: string[];
  model: string;
  recorded_at: string;
  usage?: Record<string, number>;
};
type RecordedFile = { _about?: string; label: Bilingual; origin: string; answers: RecordedAnswer[] };

function loadRecorded(): RecordedFile | null {
  try {
    return existsSync(RECORDED_FILE) ? (JSON.parse(readFileSync(RECORDED_FILE, "utf-8")) as RecordedFile) : null;
  } catch {
    return null;
  }
}

const normalize = (s: string) =>
  latinDigits(s)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // tashkeel, tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Which suggested question this is: by id, by exact text, or by close word overlap (either language). */
export function matchSuggestion(question: string, suggestionId?: string | null) {
  if (suggestionId) {
    const s = SUGGESTIONS.find((x) => x.id === suggestionId);
    if (s) return s;
  }
  const q = normalize(question);
  const qw = new Set(q.split(" "));
  let best: { s: (typeof SUGGESTIONS)[number]; score: number } | null = null;
  for (const s of SUGGESTIONS)
    for (const text of [s.en, s.ar]) {
      const t = normalize(text);
      if (t === q) return s;
      const tw = new Set(t.split(" "));
      const inter = [...qw].filter((w) => tw.has(w)).length;
      const score = inter / new Set([...qw, ...tw]).size;
      if (!best || score > best.score) best = { s, score };
    }
  return best && best.score >= 0.6 ? best.s : null;
}

async function replayRecorded(rec: RecordedAnswer, file: RecordedFile, why: Bilingual, send: Send, stream: SSEStreamingApi) {
  const recorded = { label: file.label ?? RECORDED_LABEL, origin: file.origin, recorded_at: rec.recorded_at, model: rec.model, question: rec.question, file: "server/recorded/assistant.json" };
  await send("start", { source: "recorded", lang: rec.lang, why, recorded });
  const runs: ToolRun[] = [];
  for (const [i, call] of rec.calls.entries()) {
    if (stream.aborted) return null;
    await send("tool_call", { source: "recorded", i, name: call.name, input: call.input });
    await stream.sleep(140);
    const r = runTool(call.name, call.input); // re-executed against data/: every tool result shown is real
    runs.push({ name: call.name, input: call.input, ...r });
    await send("tool_result", { source: "recorded", i, name: call.name, input: call.input, result: r.result, is_error: r.is_error });
    await stream.sleep(90);
  }
  await send("status", { source: "recorded", phase: "answering", turn: 1 });
  const parts = rec.answer.match(/\S+\s*/g) ?? [rec.answer];
  for (let k = 0; k < parts.length; k += 3) {
    if (stream.aborted) return null;
    await send("delta", { source: "recorded", text: parts.slice(k, k + 3).join(""), turn: 1 });
    await stream.sleep(35);
  }
  const checks = checkAnswer(rec.answer, runs, [rec.question]);
  await send("final", { source: "recorded", lang: rec.lang, answer: rec.answer, tools_used: rec.tools_used, usage: { live: false }, checks, recorded });
  return checks;
}

function unavailableAnswer(lang: Lang, why: Bilingual) {
  const list = SUGGESTIONS.map((s) => `"${s[lang]}"`).join(lang === "ar" ? "، " : ", ");
  const reason = why[lang].replace(/[.。]\s*$/, "");
  return lang === "ar"
    ? `الذكاء الاصطناعي المباشر غير متاح الآن (${reason}). لن أخمّن إجابة. توجد إجابات مسجّلة للأسئلة المقترحة فقط: ${list}.`
    : `Live AI is unavailable right now (${reason}). I will not guess an answer. Recorded answers exist only for the suggested questions: ${list}.`;
}

function sanitizeHistory(h: unknown): HistoryItem[] {
  if (!Array.isArray(h)) return [];
  const items = h
    .filter((x): x is HistoryItem => !!x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string" && x.content.trim().length > 0)
    .slice(-8)
    .map((x) => ({ role: x.role, content: x.content.slice(0, 4000) }));
  const out: HistoryItem[] = [];
  for (const x of items) {
    if (out.length === 0 && x.role !== "user") continue;
    if (out.length && out[out.length - 1].role === x.role) continue;
    out.push(x);
  }
  if (out.length && out[out.length - 1].role === "user") out.pop();
  return out;
}

// ------------------------------------------------------------------ routes
const router = new Hono();

router.get("/", (c) => {
  const rec = loadRecorded();
  const hasRec = (id: string, lang: Lang) => Boolean(rec?.answers.some((a) => a.id === id && a.lang === lang));
  return c.json({
    live: Boolean(process.env.ANTHROPIC_API_KEY),
    model: model(),
    effort: EFFORT,
    tools: TOOLS.map((t) => t.name),
    suggestions: SUGGESTIONS.map((s) => ({ ...s, recorded: { en: hasRec(s.id, "en"), ar: hasRec(s.id, "ar") } })),
    recorded_label: RECORDED_LABEL,
  });
});

router.post("/", async (c) => {
  let body: { question?: unknown; lang?: unknown; suggestion_id?: unknown; history?: unknown; mode?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    /* validated below */
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (!question) return c.json({ error: "bad_request", message: { en: "question is required", ar: "السؤال مطلوب" } }, 400);
  const lang: Lang = body.lang === "ar" || body.lang === "en" ? body.lang : /[؀-ۿ]/.test(question) ? "ar" : "en";
  const history = sanitizeHistory(body.history);
  const suggestion = matchSuggestion(question, typeof body.suggestion_id === "string" ? body.suggestion_id : null);
  const mode = body.mode === "recorded" ? "recorded" : "auto";

  return streamSSE(c, async (stream) => {
    const send: Send = async (event, data) => {
      if (!stream.aborted) await stream.writeSSE({ event, data: JSON.stringify(data) });
    };
    const ctrl = new AbortController();
    stream.onAbort(() => ctrl.abort());
    const logRun = (source: "live" | "recorded" | "unavailable", data: Record<string, unknown>) =>
      audit({
        kind: "ai_run",
        action: "assistant.answer",
        actor: "claude",
        source,
        summary: {
          en: `Ask Missing Blue (${source === "recorded" ? "recorded run" : source}): ${question.slice(0, 120)}`,
          ar: `اسأل الأزرق المفقود (${source === "recorded" ? "تشغيل مسجّل" : source === "live" ? "مباشر" : "غير متاح"}): ${question.slice(0, 120)}`,
        },
        data: { question: question.slice(0, 300), lang, suggestion_id: suggestion?.id ?? null, ...data },
      });
    try {
      let why: Bilingual;
      if (mode === "recorded") why = { en: "Replay requested.", ar: "طُلبت إعادة التشغيل المسجّل." };
      else if (!process.env.ANTHROPIC_API_KEY) why = { en: "No ANTHROPIC_API_KEY on this machine.", ar: "لا يوجد مفتاح ANTHROPIC_API_KEY على هذا الجهاز." };
      else {
        const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
        try {
          await send("start", { source: "live", lang, model: model() });
          const r = await askLive(question, lang, history, send, ctrl.signal);
          clearTimeout(timer);
          const usage = { live: true, model: r.model, ...r.usage };
          await send("final", { source: "live", lang, answer: r.answer, tools_used: r.tools_used, usage, checks: r.checks, model: r.model });
          await send("done", { source: "live" });
          logRun("live", { tools_used: r.tools_used, numbers: r.checks.numbers.total, usage });
          return;
        } catch (e) {
          clearTimeout(timer);
          if (stream.aborted) return;
          console.error("[assistant] live answer failed:", (e as Error)?.message ?? e);
          why = whyLiveFailed(e);
        }
      }
      const file = loadRecorded();
      const rec = suggestion && file ? (file.answers.find((a) => a.id === suggestion.id && a.lang === lang) ?? null) : null;
      if (rec && file) {
        const checks = await replayRecorded(rec, file, why, send, stream);
        await send("done", { source: "recorded" });
        logRun("recorded", { why, tools_used: rec.tools_used, numbers_unmatched: checks?.numbers.unmatched ?? null });
        return;
      }
      await send("start", { source: "unavailable", lang, why });
      await send("final", {
        source: "unavailable",
        lang,
        answer: unavailableAnswer(lang, why),
        tools_used: [],
        usage: { live: false },
        checks: null,
        suggestions: SUGGESTIONS,
      });
      await send("done", { source: "unavailable" });
      logRun("unavailable", { why });
    } catch (e) {
      console.error("[assistant]", e);
      await send("error", { message: { en: "The assistant failed on the server.", ar: "فشل المساعد على الخادم." } });
    }
  });
});

export default router;
