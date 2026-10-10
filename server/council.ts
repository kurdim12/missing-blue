// AI council (multi-agent) over the radar wet spots. Mounted by the wiring stage at /api/council:
//   app.route("/api/council", council)
//
//   POST /api/council {mode?: "live" | "recorded"}   -> Server-Sent Events (below). Default: live when a key exists.
//   GET  /api/council                                -> what the council is: agents, roles, tools, model, recording
//
// Five Claude agents, each a separate call with its own system prompt and tools over data/:
//   phase 1, IN PARALLEL (Promise.all):
//     radar      Radar analyst      list_wet_spots, radar_timeseries(spot_id)   data/wet_spots/*
//     network    Network engineer   nearest_pipe(spot_id), simulate_leak(spot_id) data/wet_spots, data/pipes, data/twin
//     landuse    Land-use analyst   land_cover(spot_id), rain_check()           data/wet_spots (Sentinel-2 LULC, ERA5)
//   phase 2: skeptic    Skeptic (red team): reads the three reports, argues AGAINST every dispatch candidate
//   phase 3: dispatcher Dispatcher: one decision per spot, applying the rules, answering the skeptic
//
// SSE events (every one carries `source: "live" | "recorded"`):
//   run_start    {source, model, agents[], why?, recorded?}   a fallback sends a second run_start: the client resets
//   agent_start  {agent, role_en, role_ar, phase}
//   tool_call    {agent, name, input, result, is_error, result_summary:{en,ar}}   result computed from data/ (also on replay)
//   agent_report {agent, role_en, role_ar, text, text_ar, per_spot[], checks}
//                per_spot: specialists {id, signal: for_dispatch|against_dispatch|neutral, finding, finding_ar}
//                          skeptic     {id, strength: strong|moderate|weak, concern, concern_ar}
//   agent_done   {agent, usage{input_tokens,output_tokens,cache_*,requests}, ms}
//   final        {decisions[], summary, summary_ar, dissent, dissent_ar, candidates[], missing_ids[], checks}
//                decision: {id, verdict: dispatch|reject, priority: high|medium|low|null, reason, reason_ar,
//                           skeptic_concern, skeptic_concern_ar, resolved_by, resolved_by_ar, checks{numbers, rule}}
//   usage        {per_agent:{agent:{usage, ms}}, total, wall_ms, model, live}   recorded: the tokens of the recorded run
//   done         {}
//   error        {message:{en,ar}}                            only if even the recorded run cannot be played
//
// Honesty rules enforced in code: every number an agent writes must exist in the tool results or the FACTS it was
// given (else the agent is told which numbers and must rewrite, twice at most, then the run falls back to the
// recording); the dispatcher cannot dispatch a spot whose centre is more than 40 m from a real pipe; any API error,
// refusal, max_tokens or bad output falls back to server/recorded/council.json (tool calls re-executed against data/).
//
// Recording: COUNCIL_RECORD=1 in the environment makes a successful live run overwrite server/recorded/council.json.
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addUsage,
  checkNumbers,
  claudeModel,
  collectNumbers,
  emptyUsage,
  hasClaudeKey,
  LiveStop,
  makeClaudeClient,
  parseJsonText,
  sumUsage,
  whyLiveFailed,
  type Usage,
} from "./claude";
import { FILES, MissingDataError, ROOT, findSpot, has, loadSpots, loadTwin, nearestPipe, readData, type Bilingual } from "./data";

const RECORDED_FILE = join(ROOT, "server", "recorded", "council.json");
const TIMESERIES_FILE = "wet_spots/spot_timeseries.json";
const LIVE_TIMEOUT_MS = 300_000;
const MAX_TURNS = 8;
const MAX_CORRECTIONS = 2;
/** Dispatch rule (CLAUDE.md: reject > 40 m from any pipe on farmland); mirrors on_pipe_40m in the spot file. */
const DISPATCH_RADIUS_M = 40;
/** Junction pressure-drop threshold of the twin summary ("junctions dropping > 1 m"). */
const DROP_THRESHOLD_M = 1;
/** The pipe record's layer name (CLAUDE.md / SOURCES.md): the network as updated in 2020. */
const PIPE_RECORD_LAYER = "WaterNetwork_updated_9_2020";

// ------------------------------------------------------------------ agents
export const AGENTS = ["radar", "network", "landuse", "skeptic", "dispatcher"] as const;
export type AgentId = (typeof AGENTS)[number];
type Specialist = "radar" | "network" | "landuse";
const SPECIALISTS: Specialist[] = ["radar", "network", "landuse"];

export const ROLES: Record<AgentId, { en: string; ar: string; phase: 1 | 2 | 3; effort: "low" | "medium"; max_tokens: number }> = {
  radar: { en: "Radar analyst", ar: "محلل الرادار", phase: 1, effort: "low", max_tokens: 12000 },
  network: { en: "Network engineer", ar: "مهندس الشبكة", phase: 1, effort: "low", max_tokens: 12000 },
  landuse: { en: "Land-use analyst", ar: "محلل استخدامات الأراضي", phase: 1, effort: "low", max_tokens: 12000 },
  skeptic: { en: "Skeptic (red team)", ar: "المشكّك (الفريق الأحمر)", phase: 2, effort: "low", max_tokens: 12000 },
  dispatcher: { en: "Dispatcher", ar: "مسؤول الإيفاد", phase: 3, effort: "medium", max_tokens: 16000 },
};
const AGENT_TOOLS: Record<AgentId, string[]> = {
  radar: ["list_wet_spots", "radar_timeseries"],
  network: ["nearest_pipe", "simulate_leak"],
  landuse: ["land_cover", "rain_check"],
  skeptic: [],
  dispatcher: [],
};
const roleInfo = (a: AgentId) => ({ agent: a, role_en: ROLES[a].en, role_ar: ROLES[a].ar, phase: ROLES[a].phase });

// ------------------------------------------------------------------ facts every agent is given (numbers allowed)
const spotIds = () => loadSpots().features.map((f) => f.properties.spot_id);
function facts() {
  const fc = loadSpots();
  const passes = fc.features[0]?.properties.passes ?? [];
  return {
    spot_ids: spotIds(),
    spot_count: fc.features.length,
    passes,
    pass_count: passes.length,
    dispatch_radius_m: DISPATCH_RADIUS_M,
    position_accuracy_m: Math.max(...fc.features.map((f) => f.properties.position_accuracy_m)),
    radar_product: "NISAR L2 GCOV, labelled PROVISIONAL by NASA",
    pipe_record: `Karak water network record, layer ${PIPE_RECORD_LAYER}: pipes laid or removed after it are not in the record`,
    candidates_rule: "A wet spot is an inspection candidate, never a confirmed leak; a crew confirms on site with an acoustic detector.",
  };
}

// ------------------------------------------------------------------ tools (all read data/; no coordinates returned)
type ToolOut = { result: unknown; is_error: boolean; summary: Bilingual };
export type ToolRun = { agent: AgentId; name: string; input: Record<string, unknown>; result: unknown; is_error: boolean };

const errOut = (code: string, en: string, ar: string, extra: Record<string, unknown> = {}): ToolOut => ({
  result: { error: code, message: { en, ar }, ...extra },
  is_error: true,
  summary: { en, ar },
});

function spotArg(input: Record<string, unknown>) {
  const id = String(input?.spot_id ?? input?.id ?? "").trim();
  return { id, f: id ? findSpot(id) : null };
}
const unknownSpot = (id: string) =>
  errOut("unknown_spot", `No wet spot "${id}". Known spots: ${spotIds().join(", ")}.`, `لا توجد بقعة رطبة "${id}". البقع المعروفة: ${spotIds().join(", ")}.`, {
    spot_id: id,
  });

function metres(lon1: number, lat1: number, lon2: number, lat2: number) {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110574);
}
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

type SeriesEntry = {
  spot_id: string;
  window_100m?: Record<string, unknown>;
  wet_pixels?: Record<string, unknown>;
  wet_px_within_100m?: number;
};

export function runTool(name: string, input: Record<string, unknown>): ToolOut {
  try {
    switch (name) {
      case "list_wet_spots": {
        const fc = loadSpots();
        const passes = fc.features[0]?.properties.passes ?? [];
        return {
          is_error: false,
          result: {
            count: fc.features.length,
            passes,
            spots: fc.features.map(({ properties: p }) => ({
              spot_id: p.spot_id,
              area_m2: p.area_m2,
              hh_rise_db: p.hh_rise_db,
              hv_rise_db: p.hv_rise_db,
              position_accuracy_m: p.position_accuracy_m,
            })),
            rise_definition: "mean HH / HV rise in dB versus the first pass, averaged over both later passes",
            source: `data/${FILES.spots}`,
          },
          summary: {
            en: `${fc.features.length} wet spots · passes ${passes.join(", ")}`,
            ar: `${fc.features.length} بقع رطبة · المرورات ${passes.join("، ")}`,
          },
        };
      }
      case "radar_timeseries": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        if (has(TIMESERIES_FILE)) {
          const ts = readData<{ baseline?: string; passes?: string[]; thresholds_db?: unknown; spots?: SeriesEntry[]; source?: string }>(TIMESERIES_FILE);
          const e = (ts.spots ?? []).find((s) => s.spot_id.toLowerCase() === p.spot_id.toLowerCase());
          if (e) {
            const pick = (o: Record<string, unknown> | undefined) =>
              o ? { hh_change_db: o.hh_change_db, hv_change_db: o.hv_change_db, px: o.px, ...(o.area_m2 !== undefined ? { area_m2: o.area_m2 } : {}) } : null;
            const wet = pick(e.wet_pixels);
            const hh = (wet?.hh_change_db ?? {}) as Record<string, number>;
            const dates = (ts.passes ?? p.passes).slice(1);
            return {
              is_error: false,
              result: {
                spot_id: p.spot_id,
                baseline: ts.baseline ?? p.passes[0],
                passes: ts.passes ?? p.passes,
                thresholds_db: ts.thresholds_db ?? null,
                wet_pixels: wet,
                window_100m: pick(e.window_100m),
                wet_px_within_100m: e.wet_px_within_100m ?? null,
                source: `data/${TIMESERIES_FILE}`,
              },
              summary: {
                en: `${p.spot_id}: HH change ${dates.map((d) => `${signed(hh[d])} dB (${d})`).join(", ")} on the wet pixels`,
                ar: `${p.spot_id}: تغيّر HH ${dates.map((d) => `${signed(hh[d])} dB (${d})`).join("، ")} على البكسلات الرطبة`,
              },
            };
          }
        }
        // fallback: the spot file only has the rise averaged over both later passes
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            per_pass: null,
            hh_rise_db: p.hh_rise_db,
            hv_rise_db: p.hv_rise_db,
            passes: p.passes,
            note: "Per-pass series file not present; the rise is the mean over both later passes versus the first.",
            source: `data/${FILES.spots}`,
          },
          summary: {
            en: `${p.spot_id}: HH ${signed(p.hh_rise_db)} dB, HV ${signed(p.hv_rise_db)} dB (mean of the later passes)`,
            ar: `${p.spot_id}: HH ${signed(p.hh_rise_db)} dB، HV ${signed(p.hv_rise_db)} dB (متوسط المرورين اللاحقين)`,
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
          if (n) record = { diameter_in: n.properties.diameter_in, material: n.properties.material, class: n.properties.class };
        }
        const d = Math.round(p.nearest_pipe_m); // whole metres: the spot position is only good to about ±50 m
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            spot_centre_to_pipe_m: d,
            within_40m: p.on_pipe_40m,
            pipe: p.nearest_pipe,
            position_accuracy_m: p.position_accuracy_m,
            pipe_record: record,
            ...(record ? {} : { pipe_record_missing: new MissingDataError(FILES.pipes).toJSON() }),
            record_layer: PIPE_RECORD_LAYER,
            note: `Distance from the radar spot centre; the spot position is accurate to about ±${p.position_accuracy_m} m.`,
            source: `data/${FILES.spots}`,
          },
          summary: {
            en: `${p.spot_id}: spot centre ${d} m from a ${p.nearest_pipe} pipe · ${p.on_pipe_40m ? "within" : "beyond"} ${DISPATCH_RADIUS_M} m`,
            ar: `${p.spot_id}: مركز البقعة على بعد ${d} م من أنبوب ${p.nearest_pipe} · ${p.on_pipe_40m ? "ضمن" : "أبعد من"} ${DISPATCH_RADIUS_M} م`,
          },
        };
      }
      case "simulate_leak": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        const t = loadTwin(); // MissingDataError in a fresh clone (held back: pipe coordinates)
        const nodes = t.nodes as Record<string, number>[];
        const count = (k: string) => nodes.filter((n) => n[k] > DROP_THRESHOLD_M).length;
        const d = metres(p.lon, p.lat, t.cand.lon, t.cand.lat);
        if (d > p.position_accuracy_m) {
          return {
            is_error: false,
            result: {
              spot_id: p.spot_id,
              in_twin: false,
              note: "The hydraulic twin (Mazar zone) has no leak scenario at this spot.",
              source: `data/${FILES.twin}`,
            },
            summary: { en: `${p.spot_id}: no twin scenario at this spot`, ar: `${p.spot_id}: لا يوجد سيناريو في التوأم عند هذه البقعة` },
          };
        }
        const other = t.stats.n_drop_gt1m_excl_svc;
        const far = count("far15");
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            in_twin: true,
            twin_zone: { junctions: t.stats.junctions, pipes: t.stats.pipes, km: t.stats.km },
            leak_at_spot: {
              leak_lps_assumed: 1, // the svc1 scenario key encodes the ASSUMED leak size (1 L/s)
              other_junctions_dropping_over_1m: other,
              max_drop_m: t.stats.max_drop?.svc1 ?? null,
            },
            main_break_comparison: {
              leak_lps_assumed: 15, // far15: an ASSUMED 15 L/s break on a main
              junctions_dropping_over_1m: far,
              zone_junctions: nodes.length,
            },
            threshold_m: DROP_THRESHOLD_M,
            provenance: "network geometry REAL (Karak pipe record); demand, tank level and leak sizes ASSUMED; pressures simulated (EPANET)",
            source: `data/${FILES.twin}`,
          },
          summary: {
            en: `${p.spot_id}: a 1 L/s leak here moves ${other} other junction(s) by > 1 m; a 15 L/s main break moves ${far} of ${nodes.length}`,
            ar: `${p.spot_id}: تسرّب 1 L/s هنا يخفض ضغط ${other} عقدة أخرى أكثر من 1 م؛ كسر خط رئيسي 15 L/s يخفض ${far} من ${nodes.length}`,
          },
        };
      }
      case "land_cover": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        const lc = ([2023, 2024, 2025] as const).map((year) => ({ year, class: p[`landcover_${year}`] }));
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            land_cover: lc,
            dataset: "Sentinel-2 10 m Land Use/Land Cover (Impact Observatory, Microsoft, Esri), dominant class within about 50 m",
            source: `data/${FILES.spots}`,
          },
          summary: { en: `${p.spot_id}: ${lc.map((x) => `${x.year} ${x.class}`).join(", ")}`, ar: `${p.spot_id}: ${lc.map((x) => `${x.year} ${x.class}`).join("، ")}` },
        };
      }
      case "rain_check": {
        const fc = loadSpots();
        const rc = fc.rain_check ?? null;
        return {
          is_error: false,
          result: { rain_check: rc, passes: fc.features[0]?.properties.passes ?? [], source: `data/${FILES.spots}` },
          summary: rc ? { en: rc, ar: rc } : { en: "No rain check in the spot file", ar: "لا يوجد فحص للمطر في ملف البقع" },
        };
      }
      default:
        return errOut("unknown_tool", `Unknown tool ${name}`, `أداة غير معروفة ${name}`);
    }
  } catch (e) {
    if (e instanceof MissingDataError) {
      const j = e.toJSON();
      return { result: j, is_error: true, summary: j.message };
    }
    return errOut("tool_failed", String((e as Error)?.message ?? e), "فشل تنفيذ الأداة");
  }
}

const SPOT_PARAM = {
  type: "object" as const,
  properties: { spot_id: { type: "string", description: "Wet spot id, e.g. W3" } },
  required: ["spot_id"],
};
const DATA_TOOLS: Record<string, Anthropic.Tool> = {
  list_wet_spots: {
    name: "list_wet_spots",
    description:
      "Every persistent wet spot the NISAR L-band radar found over Karak, Mu'tah and Mazar: id, area in m², mean HH and HV backscatter rise in dB versus the first pass, the pass dates and the position accuracy in m.",
    input_schema: { type: "object", properties: {} },
  },
  radar_timeseries: {
    name: "radar_timeseries",
    description:
      "Per-pass radar change for one spot: HH and HV change in dB versus the first pass on each later pass, on the spot's wet pixels and in a 100 m window around it, the wet-pixel count and the detection thresholds.",
    input_schema: SPOT_PARAM,
  },
  nearest_pipe: {
    name: "nearest_pipe",
    description:
      "Distance in whole metres from a wet spot's centre to the nearest pipe in the real Karak water network record, whether that is within 40 m, the pipe's size and material, and the record layer name.",
    input_schema: SPOT_PARAM,
  },
  simulate_leak: {
    name: "simulate_leak",
    description:
      "Hydraulic digital twin of the Mazar zone (EPANET results). For a spot inside the twin: how many junctions lose more than 1 m of pressure for a leak at the spot, and for comparison a 15 L/s main break. Says so when the spot has no twin scenario. Leak sizes, demand and tank level are ASSUMED.",
    input_schema: SPOT_PARAM,
  },
  land_cover: {
    name: "land_cover",
    description: "Land-cover class at the spot for 2023, 2024 and 2025 from the Sentinel-2 10 m Land Use/Land Cover maps.",
    input_schema: SPOT_PARAM,
  },
  rain_check: {
    name: "rain_check",
    description: "Rainfall between the radar passes at Mazar and Karak (ERA5 via Open-Meteo).",
    input_schema: { type: "object", properties: {} },
  },
};

// ------------------------------------------------------------------ outputs and their validation
type Signal = "for_dispatch" | "against_dispatch" | "neutral";
type Finding = { id: string; signal: Signal; finding: string; finding_ar: string };
type Report = { text: string; text_ar: string; per_spot: Finding[] };
type Objection = { id: string; strength: "strong" | "moderate" | "weak"; concern: string; concern_ar: string };
type Objections = { text: string; text_ar: string; objections: Objection[] };
type Decision = {
  id: string;
  verdict: "dispatch" | "reject";
  priority: "high" | "medium" | "low" | null;
  reason: string;
  reason_ar: string;
  skeptic_concern: string;
  skeptic_concern_ar: string;
  resolved_by: string;
  resolved_by_ar: string;
};
type Decisions = { decisions: Decision[]; summary: string; summary_ar: string; dissent: string; dissent_ar: string };
type Valid<T> = { ok: true; value: T } | { ok: false; error: string };

const S = (description: string) => ({ type: "string", description });
const SUBMIT: Record<"report" | "objections" | "decisions", Anthropic.Tool> = {
  report: {
    name: "submit_report",
    description: "Submit your specialist report once you have checked every spot.",
    input_schema: {
      type: "object",
      properties: {
        text: S("Your overall finding in at most 2 short English sentences."),
        text_ar: S("The same in Arabic (Latin digits; spot ids, pipe sizes and dates unchanged)."),
        per_spot: {
          type: "array",
          description: "One entry per spot, every spot.",
          items: {
            type: "object",
            properties: {
              id: S("Spot id, e.g. W7"),
              signal: { type: "string", enum: ["for_dispatch", "against_dispatch", "neutral"], description: "What YOUR evidence says about sending a crew." },
              finding: S("One short English sentence with numbers copied exactly from your tool results."),
              finding_ar: S("The same sentence in Arabic."),
            },
            required: ["id", "signal", "finding", "finding_ar"],
          },
        },
      },
      required: ["text", "text_ar", "per_spot"],
    },
  },
  objections: {
    name: "submit_objections",
    description: "Submit your objections against the dispatch candidates.",
    input_schema: {
      type: "object",
      properties: {
        text: S("Your overall challenge in at most 2 short English sentences."),
        text_ar: S("The same in Arabic."),
        objections: {
          type: "array",
          description: "One entry per dispatch candidate, every candidate.",
          items: {
            type: "object",
            properties: {
              id: S("Spot id"),
              strength: { type: "string", enum: ["strong", "moderate", "weak"] },
              concern: S("The single best argument against sending a crew there, one short English sentence."),
              concern_ar: S("The same sentence in Arabic."),
            },
            required: ["id", "strength", "concern", "concern_ar"],
          },
        },
      },
      required: ["text", "text_ar", "objections"],
    },
  },
  decisions: {
    name: "submit_decisions",
    description: "Submit the council's final decision: one per spot.",
    input_schema: {
      type: "object",
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: S("Spot id"),
              verdict: { type: "string", enum: ["dispatch", "reject"] },
              priority: { type: ["string", "null"], enum: ["high", "medium", "low", null], description: "high | medium | low for dispatch, null for reject" },
              reason: S("One short English sentence with numbers copied exactly."),
              reason_ar: S("The same in Arabic."),
              skeptic_concern: S("The skeptic's concern for this spot in a few words, or 'none raised'."),
              skeptic_concern_ar: S("The same in Arabic."),
              resolved_by: S("How the concern is answered, or what the crew must check on site to settle it. One short sentence."),
              resolved_by_ar: S("The same in Arabic."),
            },
            required: ["id", "verdict", "priority", "reason", "reason_ar", "skeptic_concern", "skeptic_concern_ar", "resolved_by", "resolved_by_ar"],
          },
        },
        summary: S("One English sentence."),
        summary_ar: S("The same in Arabic."),
        dissent: S("The skeptic's strongest objection that still stands, one English sentence."),
        dissent_ar: S("The same in Arabic."),
      },
      required: ["decisions", "summary", "summary_ar", "dissent", "dissent_ar"],
    },
  },
};

const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;
function coverAll(ids: string[], what: string): string | null {
  const unknown = ids.filter((id) => !findSpot(id));
  if (unknown.length) return `Unknown spot id(s) ${unknown.join(", ")}. Use only ${spotIds().join(", ")}.`;
  const have = new Set(ids.map((x) => x.toUpperCase()));
  const missing = spotIds().filter((id) => !have.has(id.toUpperCase()));
  return missing.length ? `${what} must cover every spot; missing: ${missing.join(", ")}.` : null;
}

function validateReport(v: unknown): Valid<Report> {
  const r = v as Report;
  if (!r || !str(r.text) || !Array.isArray(r.per_spot)) return { ok: false, error: "Expected {text, text_ar, per_spot: [...]}." };
  for (const f of r.per_spot) {
    if (!f || !str(f.id) || !["for_dispatch", "against_dispatch", "neutral"].includes(f.signal) || !str(f.finding))
      return { ok: false, error: `Each per_spot entry needs id, signal (for_dispatch | against_dispatch | neutral), finding, finding_ar.` };
    f.id = findSpot(f.id)?.properties.spot_id ?? f.id;
  }
  const c = coverAll(r.per_spot.map((f) => f.id), "per_spot");
  if (c) return { ok: false, error: c };
  return { ok: true, value: { text: r.text, text_ar: r.text_ar ?? "", per_spot: r.per_spot } };
}

function validateObjections(candidates: string[]) {
  return (v: unknown): Valid<Objections> => {
    const r = v as Objections;
    if (!r || !str(r.text) || !Array.isArray(r.objections)) return { ok: false, error: "Expected {text, text_ar, objections: [...]}." };
    for (const o of r.objections) {
      if (!o || !findSpot(String(o.id)) || !["strong", "moderate", "weak"].includes(o.strength) || !str(o.concern))
        return { ok: false, error: "Each objection needs a known spot id, strength (strong | moderate | weak), concern, concern_ar." };
      o.id = findSpot(o.id)!.properties.spot_id;
    }
    const have = new Set(r.objections.map((o) => o.id));
    const missing = candidates.filter((c) => !have.has(c));
    if (missing.length) return { ok: false, error: `Object to every candidate; missing: ${missing.join(", ")}.` };
    return { ok: true, value: { text: r.text, text_ar: r.text_ar ?? "", objections: r.objections } };
  };
}

function validateDecisions(v: unknown): Valid<Decisions> {
  const r = v as Decisions;
  if (!r || !Array.isArray(r.decisions) || !str(r.summary)) return { ok: false, error: "Expected {decisions: [...], summary, summary_ar, dissent, dissent_ar}." };
  for (const d of r.decisions) {
    const spot = d && findSpot(String(d.id))?.properties;
    if (!spot) return { ok: false, error: `Unknown spot id ${JSON.stringify(d?.id)}.` };
    d.id = spot.spot_id;
    if (d.verdict !== "dispatch" && d.verdict !== "reject") return { ok: false, error: `verdict for ${d.id} must be "dispatch" or "reject".` };
    if (d.verdict === "reject") d.priority = null;
    else if (!["high", "medium", "low"].includes(String(d.priority))) return { ok: false, error: `priority for ${d.id} must be high, medium or low.` };
    if (d.verdict === "dispatch" && !spot.on_pipe_40m)
      return { ok: false, error: `Rule 1: ${d.id} is not within ${DISPATCH_RADIUS_M} m of a real pipe (nearest_pipe within_40m is false); it cannot be dispatched.` };
    if (!str(d.reason) || !str(d.resolved_by)) return { ok: false, error: `reason and resolved_by for ${d.id} must not be empty.` };
    d.skeptic_concern = str(d.skeptic_concern) ? d.skeptic_concern : "none raised";
  }
  const c = coverAll(r.decisions.map((d) => d.id), "decisions");
  if (c) return { ok: false, error: c };
  return { ok: true, value: { decisions: r.decisions, summary: r.summary, summary_ar: r.summary_ar ?? "", dissent: r.dissent ?? "", dissent_ar: r.dissent_ar ?? "" } };
}

// ------------------------------------------------------------------ number checks
type Texts = { path: string; text: string }[];
const reportTexts = (r: Report): Texts => [
  { path: "text", text: r.text },
  { path: "text_ar", text: r.text_ar },
  ...r.per_spot.flatMap((f) => [
    { path: `${f.id}.finding`, text: f.finding },
    { path: `${f.id}.finding_ar`, text: f.finding_ar },
  ]),
];
const objectionTexts = (r: Objections): Texts => [
  { path: "text", text: r.text },
  { path: "text_ar", text: r.text_ar },
  ...r.objections.flatMap((o) => [
    { path: `${o.id}.concern`, text: o.concern },
    { path: `${o.id}.concern_ar`, text: o.concern_ar },
  ]),
];
const decisionTexts = (d: Decision): Texts =>
  (["reason", "reason_ar", "skeptic_concern", "skeptic_concern_ar", "resolved_by", "resolved_by_ar"] as const).map((k) => ({ path: `${d.id}.${k}`, text: d[k] }));
/** The dispatcher's agent_report: its summary and one reason per spot (same texts live and on replay). */
const dispatcherReportTexts = (text: string, text_ar: string, per: Pick<Decision, "id" | "reason" | "reason_ar">[]): Texts => [
  { path: "text", text },
  { path: "text_ar", text: text_ar },
  ...per.flatMap((x) => [
    { path: `${x.id}.reason`, text: x.reason },
    { path: `${x.id}.reason_ar`, text: x.reason_ar },
  ]),
];
const summaryTexts = (r: Decisions): Texts =>
  (["summary", "summary_ar", "dissent", "dissent_ar"] as const).map((k) => ({ path: k, text: r[k] }));

/** Numbers an agent may write: its own tool results (specialists) or all of them (skeptic, dispatcher), plus FACTS. */
function poolFor(agent: AgentId, runs: ToolRun[]) {
  const own = SPECIALISTS.includes(agent as Specialist) ? runs.filter((r) => r.agent === agent) : runs;
  return collectNumbers([facts(), own.map((r) => r.result)]);
}

function checkTexts(texts: Texts, pool: number[]) {
  let total = 0,
    matched = 0;
  const rounded: string[] = [],
    unmatched: string[] = [];
  for (const t of texts) {
    const c = checkNumbers(t.text ?? "", pool);
    total += c.total;
    matched += c.matched;
    rounded.push(...c.rounded.map((x) => `${t.path}: ${x}`));
    unmatched.push(...c.unmatched.map((x) => `${t.path}: ${x}`));
  }
  return { ok: unmatched.length === 0, total, matched, rounded, unmatched };
}

function finalPayload(v: Decisions, runs: ToolRun[], candidates: string[]) {
  const pool = poolFor("dispatcher", runs);
  const decisions = v.decisions.map((d) => {
    const spot = findSpot(d.id)?.properties;
    const rule = !spot ? "unknown_spot" : d.verdict === "dispatch" && !spot.on_pipe_40m ? "dispatch_beyond_40m" : "ok";
    return { ...d, checks: { numbers: checkTexts(decisionTexts(d), pool), rule } };
  });
  const have = new Set(v.decisions.map((d) => d.id));
  return {
    decisions,
    summary: v.summary,
    summary_ar: v.summary_ar,
    dissent: v.dissent,
    dissent_ar: v.dissent_ar,
    candidates,
    missing_ids: spotIds().filter((id) => !have.has(id)),
    checks: { numbers: checkTexts(summaryTexts(v), pool) },
  };
}

// ------------------------------------------------------------------ prompts
function preamble() {
  const f = facts();
  return `You are one agent of the Missing Blue AI council for the water utility in Karak, Jordan. NASA-ISRO NISAR L-band radar flagged ${f.spot_count} persistent wet spots (${f.spot_ids.join(", ")}): ground whose radar echo rose on the second pass and stayed up on the third (passes ${f.passes.join(", ")}). Three specialists (radar, pipe network, land use) look at the spots in parallel, a skeptic argues against every dispatch candidate, and a dispatcher decides which spots get a field crew.

Writing rules for every agent:
- Copy every number exactly as a tool result or the FACTS give it. Never compute a new number (no differences, sums, ratios, percentages, averages or counts you worked out yourself); if a number is not in your data, write without it.
- Distances in whole metres (or km with one decimal). The radar position is accurate to about ±${f.position_accuracy_m} m: write "spot centre X m from the pipe", never metre precision as fact.
- A wet spot is an inspection candidate, never a confirmed leak. Never write "leak found", "leak detected" or "confirmed".
- Arabic text: Modern Standard Arabic with Latin digits; spot ids (W7), pipe sizes, units and dates stay as they are.
- Be brief: plain sentences, no field names, no markdown.`;
}

const SPECIALIST_JOB: Record<Specialist, string> = {
  radar: `Your role: RADAR ANALYST. You see the radar evidence only (you know nothing about pipes or land use; do not guess about them).
Call list_wet_spots, then radar_timeseries for EVERY spot (all in one turn, in parallel). For each spot say whether the rise is persistent (up on both later passes, above the thresholds when they are given) and how strong and how large it is compared with the others. signal: for_dispatch = the radar evidence alone is worth a field check; against_dispatch = weak or not persistent; neutral = in between. Then call submit_report once.`,
  network: `Your role: NETWORK ENGINEER. You see the pipe network and the hydraulic twin only.
Call nearest_pipe and simulate_leak for EVERY spot (all in one turn, in parallel). For each spot report the distance from the spot centre to the nearest real pipe, whether it is within ${DISPATCH_RADIUS_M} m, the pipe size and material, and what the twin says (only one spot has a twin scenario; leak size, demand and tank level are ASSUMED). Explain the story point when the twin has it: a small service-line leak barely moves network pressure, a main break moves almost every junction. signal: for_dispatch = within ${DISPATCH_RADIUS_M} m of a real pipe; against_dispatch = far from any pipe. Then call submit_report once.`,
  landuse: `Your role: LAND-USE ANALYST. You see land cover and weather only.
Call rain_check once and land_cover for EVERY spot (all in one turn, in parallel). For each spot say whether irrigation (Crops, Rangeland used for grazing or farming) or a built area could explain the water, and whether rain can. Note when the class changed between years. signal: against_dispatch = farmland that irrigation explains well; for_dispatch = built area or ground where irrigation is an unlikely explanation; neutral = unclear. Then call submit_report once.`,
};

const SKEPTIC_JOB = `Your role: SKEPTIC (RED TEAM). You have no tools: read the specialist reports, the evidence table and the FACTS.
Argue AGAINST sending a crew to each dispatch candidate listed in the message. Use the real weaknesses: a garden or irrigated plot next to a pipe can pass the filter; the position is only about ±50 m, so the nearest pipe may not be the source; NISAR products are labelled provisional; the pipe record is from 2020, so pipes laid or removed since are missing; 0 mm of rain rules out rain but not other water (irrigation, septic, a cistern). Rate each objection strong, moderate or weak and be honest: if the evidence answers an objection, rate it weak. Then call submit_objections once.`;

const DISPATCHER_JOB = `Your role: DISPATCHER. You have no tools: read the specialist reports, the evidence table, the skeptic's objections and the FACTS, then decide for EVERY spot.
Rules:
1. Dispatch a crew only to a spot whose centre is within ${DISPATCH_RADIUS_M} m of a real pipe (within_40m is true).
2. Reject spots far from any pipe on farmland (Crops or Rangeland): most likely irrigation.
3. The position is accurate to about ±50 m; never claim metre precision.
4. Rain was 0 mm between the passes: rain does not explain these spots.
5. A dispatch is an inspection by a crew with an acoustic detector, not a confirmed leak.
For each spot: priority (high | medium | low for dispatch, null for reject), reason, the skeptic's concern for that spot (or "none raised"), and resolved_by: how the concern is answered by the evidence, or what the crew must check on site to settle it. dissent: the skeptic's strongest objection that still stands. Every text in English and Arabic. Then call submit_decisions once.`;

/** Per-spot evidence table from the specialists' tool runs (no coordinates). */
function evidenceTable(runs: ToolRun[]) {
  const table: Record<string, Record<string, unknown>> = {};
  const global: Record<string, unknown> = {};
  for (const r of runs) {
    if (r.is_error) continue;
    const res = { ...(r.result as Record<string, unknown>) };
    delete res.source;
    const id = String((r.input?.spot_id as string) ?? "");
    const spot = id ? findSpot(id)?.properties.spot_id : null;
    if (spot) (table[spot] ??= {})[r.name] = res;
    else global[r.name] = res;
  }
  return { per_spot: table, global };
}

const reportsOf = (reports: Partial<Record<Specialist, Report>>) =>
  Object.fromEntries(Object.entries(reports).map(([k, r]) => [k, { text: r!.text, per_spot: r!.per_spot.map(({ id, signal, finding }) => ({ id, signal, finding })) }]));

// ------------------------------------------------------------------ one agent (manual tool loop)
type Emit = (event: string, data: Record<string, unknown>) => Promise<void>;
type AgentResult<T> = { value: T; usage: Usage; ms: number };

async function runAgent<T>(opts: {
  agent: AgentId;
  client: Anthropic;
  model: string;
  signal: AbortSignal;
  emit: Emit;
  runs: ToolRun[];
  user: string;
  system: string;
  submit: Anthropic.Tool;
  validate: (v: unknown) => Valid<T>;
  texts: (v: T) => Texts;
}): Promise<AgentResult<T>> {
  const { agent, client, model, signal, emit, runs } = opts;
  const t0 = Date.now();
  const usage = emptyUsage();
  const toolNames = AGENT_TOOLS[agent];
  const tools = [...toolNames.map((n) => DATA_TOOLS[n]), opts.submit];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];
  let corrections = 0;
  let nudged = false;

  await emit("agent_start", { source: "live", ...roleInfo(agent) });

  /** Validate + number-check a submission. Returns the value, or an error text for the model. */
  const accept = (input: unknown): { value?: T; error?: string } => {
    const v = opts.validate(input);
    if (!v.ok) return { error: v.error };
    const c = checkTexts(opts.texts(v.value), poolFor(agent, runs));
    if (!c.ok) {
      if (corrections >= MAX_CORRECTIONS)
        throw new LiveStop({
          en: `The ${ROLES[agent].en} wrote numbers that are not in its tool results (${c.unmatched.join("; ")}).`,
          ar: `كتب ${ROLES[agent].ar} أرقامًا غير موجودة في نتائج أدواته (${c.unmatched.join("؛ ")}).`,
        });
      corrections++;
      return {
        error: `These numbers are not in your tool results or the FACTS: ${c.unmatched.join("; ")}. Copy numbers exactly from the data, or write the sentence without them, and call ${opts.submit.name} again.`,
      };
    }
    return { value: v.value };
  };

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    // thinking is left at the model default (adaptive); depth is set with output_config.effort
    const stream = client.messages.stream(
      { model, max_tokens: ROLES[agent].max_tokens, system: opts.system, tools, messages, output_config: { effort: ROLES[agent].effort } },
      { signal },
    );
    const message = await stream.finalMessage();
    addUsage(usage, message.usage);

    // stop_reason first, before reading any content
    if (message.stop_reason === "refusal")
      throw new LiveStop({ en: `The ${ROLES[agent].en} declined (refusal).`, ar: `رفض ${ROLES[agent].ar} الطلب.` });
    if (message.stop_reason === "max_tokens")
      throw new LiveStop({ en: `The ${ROLES[agent].en} hit the token limit.`, ar: `بلغ ${ROLES[agent].ar} حد الرموز.` });
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) {
      const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = parseJsonText(text);
      if (parsed) {
        const a = accept(parsed);
        if (a.value !== undefined) return { value: a.value, usage, ms: Date.now() - t0 };
      }
      if (nudged) throw new LiveStop({ en: `The ${ROLES[agent].en} ended without a report.`, ar: `أنهى ${ROLES[agent].ar} دون تقرير.` });
      nudged = true;
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: `Call ${opts.submit.name} now.` });
      continue;
    }

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    let final: T | undefined;
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      if (u.name === opts.submit.name) {
        const a = accept(input);
        if (a.value !== undefined) {
          final = a.value;
          results.push({ type: "tool_result", tool_use_id: u.id, content: "Received." });
        } else results.push({ type: "tool_result", tool_use_id: u.id, content: a.error!, is_error: true });
        continue;
      }
      const r = toolNames.includes(u.name) ? runTool(u.name, input) : errOut("not_your_tool", `Tool ${u.name} is not available to you.`, `الأداة ${u.name} غير متاحة لك.`);
      runs.push({ agent, name: u.name, input, result: r.result, is_error: r.is_error });
      await emit("tool_call", { source: "live", agent, name: u.name, input, result: r.result, is_error: r.is_error, result_summary: r.summary });
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.result), ...(r.is_error ? { is_error: true } : {}) });
    }
    if (final !== undefined) return { value: final, usage, ms: Date.now() - t0 };
    messages.push({ role: "user", content: results });
  }
  throw new LiveStop({ en: `The ${ROLES[agent].en} gave no report after ${MAX_TURNS} turns.`, ar: `لم يقدّم ${ROLES[agent].ar} تقريرًا بعد ${MAX_TURNS} جولات.` });
}

// ------------------------------------------------------------------ the council (live)
/** Dispatch candidates for the skeptic: any spot a specialist marks for_dispatch, or whose centre is within 40 m of a pipe. */
function candidatesOf(reports: Record<Specialist, Report>) {
  const ids = new Set<string>();
  for (const r of Object.values(reports)) for (const f of r.per_spot) if (f.signal === "for_dispatch") ids.add(f.id);
  for (const f of loadSpots().features) if (f.properties.on_pipe_40m) ids.add(f.properties.spot_id);
  return spotIds().filter((id) => ids.has(id));
}

export async function runCouncilLive(emit: Emit, signal: AbortSignal) {
  const client = makeClaudeClient({ maxRetries: 2 });
  const model = claudeModel();
  const tStart = Date.now();
  const runs: ToolRun[] = [];
  const per_agent: Partial<Record<AgentId, { usage: Usage; ms: number }>> = {};
  // one failing specialist stops the others (they would only spend tokens)
  const inner = new AbortController();
  const onAbort = () => inner.abort();
  signal.addEventListener("abort", onAbort);

  const done = async (agent: AgentId, r: AgentResult<unknown>) => {
    per_agent[agent] = { usage: r.usage, ms: r.ms };
    await emit("agent_done", { source: "live", agent, usage: r.usage, ms: r.ms });
  };
  const base = { client, model, signal: inner.signal, emit, runs };
  const FACTS = JSON.stringify(facts());

  try {
    await emit("run_start", { source: "live", model, agents: AGENTS.map(roleInfo) });

    // ---- phase 1: three specialists in parallel
    const specialist = async (agent: Specialist) => {
      const r = await runAgent<Report>({
        ...base,
        agent,
        system: `${preamble()}\n\n${SPECIALIST_JOB[agent]}`,
        user: `FACTS: ${FACTS}\n\nCheck every spot now.`,
        submit: SUBMIT.report,
        validate: validateReport,
        texts: reportTexts,
      });
      await emit("agent_report", {
        source: "live",
        ...roleInfo(agent),
        ...r.value,
        checks: checkTexts(reportTexts(r.value), poolFor(agent, runs)),
      });
      await done(agent, r);
      return r.value;
    };
    let reports: Record<Specialist, Report>;
    try {
      const [radar, network, landuse] = await Promise.all(SPECIALISTS.map(specialist));
      reports = { radar, network, landuse };
    } catch (e) {
      inner.abort();
      throw e;
    }

    // ---- phase 2: skeptic
    const candidates = candidatesOf(reports);
    const evidence = JSON.stringify(evidenceTable(runs));
    const sk = await runAgent<Objections>({
      ...base,
      agent: "skeptic",
      system: `${preamble()}\n\n${SKEPTIC_JOB}`,
      user: `FACTS: ${FACTS}\n\nSPECIALIST REPORTS: ${JSON.stringify(reportsOf(reports))}\n\nEVIDENCE TABLE (tool results): ${evidence}\n\nDISPATCH CANDIDATES: ${candidates.join(", ")}\n\nObject to every candidate now.`,
      submit: SUBMIT.objections,
      validate: validateObjections(candidates),
      texts: objectionTexts,
    });
    await emit("agent_report", {
      source: "live",
      ...roleInfo("skeptic"),
      text: sk.value.text,
      text_ar: sk.value.text_ar,
      per_spot: sk.value.objections,
      checks: checkTexts(objectionTexts(sk.value), poolFor("skeptic", runs)),
    });
    await done("skeptic", sk);

    // ---- phase 3: dispatcher
    const objections = sk.value.objections.map(({ id, strength, concern }) => ({ id, strength, concern }));
    const dp = await runAgent<Decisions>({
      ...base,
      agent: "dispatcher",
      system: `${preamble()}\n\n${DISPATCHER_JOB}`,
      user: `FACTS: ${FACTS}\n\nSPECIALIST REPORTS: ${JSON.stringify(reportsOf(reports))}\n\nEVIDENCE TABLE (tool results): ${evidence}\n\nSKEPTIC: ${JSON.stringify({ text: sk.value.text, objections })}\n\nDecide every spot now.`,
      submit: SUBMIT.decisions,
      validate: validateDecisions,
      texts: (v) => [...v.decisions.flatMap(decisionTexts), ...summaryTexts(v)],
    });
    const fin = finalPayload(dp.value, runs, candidates);
    await emit("agent_report", {
      source: "live",
      ...roleInfo("dispatcher"),
      text: dp.value.summary,
      text_ar: dp.value.summary_ar,
      per_spot: fin.decisions.map(({ id, verdict, priority, reason, reason_ar }) => ({ id, verdict, priority, reason, reason_ar })),
      checks: checkTexts(dispatcherReportTexts(dp.value.summary, dp.value.summary_ar, dp.value.decisions), poolFor("dispatcher", runs)),
    });
    await done("dispatcher", dp);
    await emit("final", { source: "live", ...fin });
    const total = sumUsage(Object.values(per_agent).map((x) => x!.usage));
    await emit("usage", { source: "live", live: true, model, per_agent, total, wall_ms: Date.now() - tStart });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// ------------------------------------------------------------------ recorded run (replay)
type RecEvent = { t: number; event: string; data: Record<string, unknown> };
type Recorded = { _about?: string; label: string; recorded_at: string; model: string; wall_ms: number; events: RecEvent[] };

function loadRecorded(): Recorded | null {
  if (!existsSync(RECORDED_FILE)) return null;
  try {
    return JSON.parse(readFileSync(RECORDED_FILE, "utf-8")) as Recorded;
  } catch {
    return null;
  }
}

/** Write a live run's events as the recording. tool_call results are dropped: a replay recomputes them from data/. */
function saveRecording(events: RecEvent[], model: string) {
  const usage = events.find((e) => e.event === "usage")?.data;
  const rec: Recorded = {
    _about:
      "A real live run of the Missing Blue AI council (5 Claude agents), recorded so the demo can replay it instantly and offline. On replay every tool call is re-executed against data/, so the tool results shown are computed from the data files; the agents' texts, decisions and token counts are this recording. Number checks are recomputed on replay.",
    label: `Recorded run · Claude council, ${new Date().toISOString().slice(0, 10)}`,
    recorded_at: new Date().toISOString(),
    model,
    wall_ms: Number(usage?.wall_ms ?? 0),
    events: events
      .filter((e) => e.event !== "done")
      .map((e) => {
        if (e.event !== "tool_call") return e;
        const { result: _r, ...rest } = e.data;
        return { ...e, data: rest };
      }),
  };
  writeFileSync(RECORDED_FILE, JSON.stringify(rec, null, 1) + "\n", "utf-8");
}

async function runCouncilRecorded(emit: Emit, sleep: (ms: number) => Promise<unknown>, aborted: () => boolean, why: Bilingual) {
  const rec = loadRecorded();
  if (!rec) {
    await emit("error", {
      source: "recorded",
      message: { en: "The recorded council run is missing: server/recorded/council.json", ar: "ملف تشغيل المجلس المسجّل غير موجود: server/recorded/council.json" },
    });
    return;
  }
  await emit("run_start", {
    source: "recorded",
    model: rec.model,
    agents: AGENTS.map(roleInfo),
    why,
    recorded: { label: rec.label, recorded_at: rec.recorded_at, model: rec.model, wall_ms: rec.wall_ms, file: "server/recorded/council.json" },
  });
  const runs: ToolRun[] = [];
  const last = rec.events[rec.events.length - 1]?.t || 1;
  const scale = Math.min(1, 9000 / last); // the whole replay takes about 9 s
  let prev = 0;
  for (const ev of rec.events) {
    if (aborted()) return;
    const gap = Math.min(900, Math.max(40, (ev.t - prev) * scale));
    prev = ev.t;
    if (ev.event === "run_start") continue;
    await sleep(gap);
    const d = ev.data;
    switch (ev.event) {
      case "tool_call": {
        const r = runTool(String(d.name), (d.input ?? {}) as Record<string, unknown>); // re-executed: the result is real
        runs.push({ agent: d.agent as AgentId, name: String(d.name), input: (d.input ?? {}) as Record<string, unknown>, result: r.result, is_error: r.is_error });
        await emit("tool_call", { ...d, source: "recorded", result: r.result, is_error: r.is_error, result_summary: r.summary });
        break;
      }
      case "agent_report": {
        const agent = d.agent as AgentId;
        const per = (d.per_spot ?? []) as Record<string, string>[];
        let texts: Texts;
        if (agent === "skeptic") texts = objectionTexts({ text: String(d.text), text_ar: String(d.text_ar ?? ""), objections: per as unknown as Objection[] });
        else if (agent === "dispatcher") texts = dispatcherReportTexts(String(d.text), String(d.text_ar ?? ""), per as unknown as Decision[]);
        else texts = reportTexts({ text: String(d.text), text_ar: String(d.text_ar ?? ""), per_spot: per as unknown as Finding[] });
        await emit("agent_report", { ...d, source: "recorded", checks: checkTexts(texts, poolFor(agent, runs)) });
        break;
      }
      case "final": {
        const v = d as unknown as Decisions & { candidates?: string[] };
        const decisions = (v.decisions ?? []).map((x) => {
          const { checks: _c, ...rest } = x as Decision & { checks?: unknown };
          return rest as Decision;
        });
        await emit("final", { source: "recorded", ...finalPayload({ ...v, decisions }, runs, v.candidates ?? []) });
        break;
      }
      case "usage":
        await emit("usage", { ...d, source: "recorded", live: false, recorded_at: rec.recorded_at });
        break;
      case "done":
        break;
      default:
        await emit(ev.event, { ...d, source: "recorded" });
    }
  }
}

// ------------------------------------------------------------------ routes
const council = new Hono();

council.get("/", (c) => {
  const rec = loadRecorded();
  return c.json({
    live: hasClaudeKey(),
    model: claudeModel(),
    agents: AGENTS.map((a) => ({ ...roleInfo(a), effort: ROLES[a].effort, tools: AGENT_TOOLS[a] })),
    rules: { dispatch_radius_m: DISPATCH_RADIUS_M, drop_threshold_m: DROP_THRESHOLD_M },
    recorded: rec ? { label: rec.label, recorded_at: rec.recorded_at, model: rec.model, wall_ms: rec.wall_ms } : null,
  });
});

council.post("/", async (c) => {
  let mode: "live" | "recorded" = hasClaudeKey() ? "live" : "recorded";
  try {
    const body = (await c.req.json()) as { mode?: string };
    if (body?.mode === "recorded") mode = "recorded";
  } catch {
    /* empty body: default */
  }
  return streamSSE(c, async (stream) => {
    const t0 = Date.now();
    const events: RecEvent[] = [];
    const emit: Emit = async (event, data) => {
      events.push({ t: Date.now() - t0, event, data });
      if (!stream.aborted) await stream.writeSSE({ event, data: JSON.stringify(data) });
    };
    const ctrl = new AbortController();
    stream.onAbort(() => ctrl.abort());
    try {
      let why: Bilingual;
      if (mode === "recorded") why = { en: "Replay requested.", ar: "طُلبت إعادة التشغيل المسجّل." };
      else if (!hasClaudeKey()) why = { en: "No ANTHROPIC_API_KEY on this machine.", ar: "لا يوجد مفتاح ANTHROPIC_API_KEY على هذا الجهاز." };
      else {
        const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
        try {
          await runCouncilLive(emit, ctrl.signal);
          clearTimeout(timer);
          await emit("done", { source: "live" });
          if (process.env.COUNCIL_RECORD === "1") {
            saveRecording(events, claudeModel());
            console.log("[council] live run recorded to server/recorded/council.json");
          }
          return;
        } catch (e) {
          clearTimeout(timer);
          if (stream.aborted) return; // the viewer left
          console.error("[council] live run failed, replaying the recorded run:", (e as Error)?.message ?? e);
          why = whyLiveFailed(e);
        }
      }
      await runCouncilRecorded(emit, (ms) => stream.sleep(ms), () => stream.aborted, why);
      await emit("done", { source: "recorded" });
    } catch (e) {
      console.error("[council]", e);
      const m = e instanceof MissingDataError ? e.toJSON().message : { en: "The council failed on the server.", ar: "فشل المجلس على الخادم." };
      await emit("error", { message: m });
    }
  });
});

export default council;
