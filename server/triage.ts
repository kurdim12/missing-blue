// POST /api/triage: Claude triages the radar wet spots with four tools over data/ and streams its progress as
// Server-Sent Events. GET /api/triage: what the model is told (rules, model, whether a live call is possible).
//
// SSE events (every one carries `source: "live" | "recorded"`):
//   start       {source, model?, why?, recorded?}       a run begins (a fallback sends a second start: the client resets)
//   status      {phase, turn}                            live only: Claude is working on turn N
//   tool_call   {i, name, input}
//   tool_result {i, name, input, result, is_error}       result is computed from data/ (also when replaying)
//   final       {decisions[], summary, summary_ar, missing_ids}   each decision has checks {numbers, rule}
//   usage       {input_tokens, output_tokens, cache_*, requests} (live)  |  {live: false} (recorded: no live tokens)
//   done        {}
//   error       {message:{en,ar}}                        only if even the recorded run cannot be played
//
// No API key, or ANY error in the live run (network, auth, refusal, max_tokens, bad output), streams the recorded run
// from server/recorded/triage.json instead. Its tool calls are re-executed against data/, so every tool result is real;
// its decisions are the recording. Token counts are never invented for a recorded run.
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FILES, MissingDataError, ROOT, findSpot, has, loadSpots, loadTwin, nearestPipe, type Bilingual } from "./data";

// read lazily: server/index.ts loads .env after the imports are evaluated
const model = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_TOKENS = 16000;
const MAX_TURNS = 14;
const LIVE_TIMEOUT_MS = 150_000;
/** Dispatch rule from the spec (CLAUDE.md: "Reject rule: > 40 m from any pipe on farmland"); mirrors on_pipe_40m in the spot file. */
const DISPATCH_RADIUS_M = 40;
/** Junction pressure-drop threshold used by the twin summary ("junctions dropping > 1 m"). */
const DROP_THRESHOLD_M = 1;
const RECORDED_FILE = join(ROOT, "server", "recorded", "triage.json");

type Decision = {
  id: string;
  verdict: "dispatch" | "reject";
  priority: "high" | "medium" | "low" | null;
  reason: string;
  reason_ar?: string;
  corrected?: Bilingual;
  original_reason?: string;
};
type TriageResult = { decisions: Decision[]; summary: string; summary_ar?: string };
type ToolRun = { name: string; input: Record<string, unknown>; result: unknown; is_error: boolean };

// ------------------------------------------------------------------ tools (all read data/)
const accuracyM = () => Math.max(...loadSpots().features.map((f) => f.properties.position_accuracy_m));
const spotIds = () => loadSpots().features.map((f) => f.properties.spot_id);

/** Planar distance in metres (local equirectangular; fine at this scale). */
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
  const f = id ? findSpot(id) : null;
  return { id, f };
}
const unknownSpot = (id: string) =>
  toolError("unknown_spot", `No wet spot "${id}". Known spots: ${spotIds().join(", ")}.`, `لا توجد بقعة رطبة "${id}". البقع المعروفة: ${spotIds().join(", ")}.`, {
    spot_id: id,
  });

const TWIN_LEAK_SCENARIOS = ["svc1", "m5", "m15", "far15"] as const;
const leakLps = (scenario: string) => Number(scenario.replace(/\D/g, "")); // the key encodes the ASSUMED leak size (svc1 = 1 L/s)

function runTool(name: string, input: Record<string, unknown>): { result: unknown; is_error: boolean } {
  try {
    switch (name) {
      case "list_wet_spots": {
        const fc = loadSpots();
        return {
          is_error: false,
          result: {
            count: fc.features.length,
            spots: fc.features.map(({ properties: p }) => ({
              spot_id: p.spot_id,
              lat: p.lat,
              lon: p.lon,
              area_m2: p.area_m2,
              hh_rise_db: p.hh_rise_db,
              hv_rise_db: p.hv_rise_db,
              passes: p.passes,
              position_accuracy_m: p.position_accuracy_m,
            })),
            rain_check: fc.rain_check ?? null,
            source: `data/${FILES.spots}`,
          },
        };
      }
      case "nearest_pipe": {
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        let record: Record<string, unknown> | null = null;
        let recordMissing: unknown = null;
        if (has(FILES.pipes)) {
          const n = nearestPipe(p.lon, p.lat);
          if (n)
            record = {
              pipe_id: n.properties.pipe_id,
              cad_layer: n.properties.cad_layer,
              diameter_in: n.properties.diameter_in,
              material: n.properties.material,
              class: n.properties.class,
              matches_spot_file: n.properties.cad_layer === p.nearest_pipe_layer,
            };
        } else recordMissing = new MissingDataError(FILES.pipes).toJSON();
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            // whole metres: the spot position is only good to about ±position_accuracy_m
            spot_centre_to_pipe_m: Math.round(p.nearest_pipe_m),
            within_40m: p.on_pipe_40m,
            pipe_layer: p.nearest_pipe_layer,
            pipe: p.nearest_pipe,
            position_accuracy_m: p.position_accuracy_m,
            note: `Distance is measured from the radar spot centre; the spot position is accurate to about ±${p.position_accuracy_m} m.`,
            pipe_record: record,
            ...(recordMissing ? { pipe_record_missing: recordMissing } : {}),
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
      case "simulate_leak": {
        const t = loadTwin(); // throws MissingDataError in a fresh clone (held back: pipe coordinates)
        const nodes = t.nodes as Record<string, number>[];
        const count = (k: string) => nodes.filter((n) => n[k] > DROP_THRESHOLD_M).length;
        const scenario = input?.scenario ? String(input.scenario) : null;
        if (scenario) {
          if (!(TWIN_LEAK_SCENARIOS as readonly string[]).includes(scenario))
            return toolError("bad_scenario", `scenario must be one of ${TWIN_LEAK_SCENARIOS.join(", ")}`, `السيناريو يجب أن يكون أحد: ${TWIN_LEAK_SCENARIOS.join(", ")}`);
          return {
            is_error: false,
            result: {
              scenario,
              leak_lps_assumed: leakLps(scenario),
              junctions_dropping_over_1m: count(scenario),
              zone_junctions: nodes.length,
              threshold_m: DROP_THRESHOLD_M,
              provenance: "network geometry REAL; demand, tank level and leak size ASSUMED; pressures simulated (EPANET)",
              source: `data/${FILES.twin}`,
            },
          };
        }
        const { id, f } = spotArg(input);
        if (!f) return unknownSpot(id);
        const p = f.properties;
        // The twin has one leak-at-a-spot scenario (svc1), at junction t.cand. A spot qualifies when that junction lies
        // within the spot's position accuracy.
        const d = metres(p.lon, p.lat, t.cand.lon, t.cand.lat);
        if (d > p.position_accuracy_m) {
          const covered = loadSpots().features.find(
            (s) => metres(s.properties.lon, s.properties.lat, t.cand.lon, t.cand.lat) <= s.properties.position_accuracy_m,
          );
          const who = covered?.properties.spot_id ?? "?";
          return toolError(
            "outside_twin",
            `The hydraulic twin has no leak scenario at ${p.spot_id}; its only leak-at-a-spot scenario is at ${who}.`,
            `لا يحتوي التوأم الهيدروليكي على سيناريو تسرب عند ${p.spot_id}؛ سيناريو التسرب الوحيد عند بقعة هو عند ${who}.`,
            { spot_id: p.spot_id },
          );
        }
        return {
          is_error: false,
          result: {
            spot_id: p.spot_id,
            twin_zone: { junctions: t.stats.junctions, pipes: t.stats.pipes, km: t.stats.km },
            leak_at_spot: {
              leak_lps_assumed: leakLps("svc1"),
              other_junctions_dropping_over_1m: t.stats.n_drop_gt1m_excl_svc,
              junctions_dropping_over_1m_counting_the_leak_junction_itself: count("svc1"),
              max_drop_m: t.stats.max_drop?.svc1 ?? null,
            },
            main_break_comparison: {
              leak_lps_assumed: leakLps("far15"),
              junctions_dropping_over_1m: count("far15"),
              zone_junctions: nodes.length,
              max_drop_m: t.stats.max_drop?.far15 ?? null,
            },
            threshold_m: DROP_THRESHOLD_M,
            provenance: "network geometry REAL (Karak pipe record); demand, tank level and leak sizes ASSUMED; pressures simulated (EPANET)",
            source: `data/${FILES.twin}`,
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
  properties: { spot_id: { type: "string", description: "Wet spot id from list_wet_spots, e.g. W3" } },
  required: ["spot_id"],
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_wet_spots",
    description:
      "Every persistent wet spot the NISAR L-band radar found over Karak, Mu'tah and Mazar: id, lat, lon, area in m², HH and HV backscatter rise in dB versus the first pass, the pass dates, the position accuracy in m, and the rain check between passes.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "nearest_pipe",
    description:
      "Distance in metres from a wet spot's centre to the nearest pipe in the real Karak water network record (2020), whether that is within 40 m, the pipe's size and material, and its record id when the pipe file is present.",
    input_schema: SPOT_PARAM,
  },
  {
    name: "land_cover",
    description:
      "Land-cover class at the spot for 2023, 2024 and 2025 from the Sentinel-2 10 m Land Use/Land Cover maps (Impact Observatory, Microsoft, Esri).",
    input_schema: SPOT_PARAM,
  },
  {
    name: "simulate_leak",
    description:
      "Runs the hydraulic digital twin of the Mazar zone (EPANET results). For a spot inside the twin it returns how many junctions lose more than 1 m of pressure for a leak at the spot, and for comparison a 15 L/s main break. Returns an error for spots without a twin scenario. Leak sizes, demand and tank level are assumptions.",
    input_schema: SPOT_PARAM,
  },
  {
    name: "submit_decisions",
    description:
      "Submit the final triage once every spot is checked: one decision per spot and a one-sentence summary, in English and Arabic.",
    input_schema: {
      type: "object",
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              verdict: { type: "string", enum: ["dispatch", "reject"] },
              priority: {
                type: ["string", "null"],
                enum: ["high", "medium", "low", null],
                description: "high | medium | low for dispatch, null for reject",
              },
              reason: { type: "string", description: "One English sentence with the numbers copied exactly from the tool results." },
              reason_ar: { type: "string", description: "The same sentence in Arabic, Latin digits, spot ids and pipe sizes unchanged." },
            },
            required: ["id", "verdict", "priority", "reason", "reason_ar"],
          },
        },
        summary: { type: "string" },
        summary_ar: { type: "string" },
      },
      required: ["decisions", "summary", "summary_ar"],
    },
  },
];

function rules() {
  const fc = loadSpots();
  return {
    dispatch_radius_m: DISPATCH_RADIUS_M,
    position_accuracy_m: accuracyM(),
    rain_check: fc.rain_check ?? null,
    passes: fc.features[0]?.properties.passes ?? [],
    spots: fc.features.length,
  };
}

function systemPrompt() {
  const r = rules();
  return `You are the triage agent for Missing Blue, a leak-finding tool for the water utility in Karak, Jordan. NASA-ISRO NISAR L-band radar flagged persistent wet spots: ground whose radar echo rose on the second pass and stayed up on the third (passes ${r.passes.join(", ")}).

Use the tools to check every spot (list_wet_spots, then nearest_pipe and land_cover for each spot, and simulate_leak for spots you consider dispatching). Then call submit_decisions once, with one decision per spot.

Rules:
1. Dispatch a crew only to a spot whose centre is within ${r.dispatch_radius_m} m of a real pipe (nearest_pipe.within_40m is true).
2. Reject spots far from any pipe on farmland (Crops or Rangeland): they are most likely irrigation.
3. The radar position is accurate to about ±${r.position_accuracy_m} m. Never claim metre precision: write "spot centre X m from the pipe", with distances in whole metres (or km with one decimal), never with decimals of a metre.
4. Rain check: ${r.rain_check ?? "not available"}. Rain does not explain these spots.
5. A wet spot is an inspection candidate, never a confirmed leak. Never write "leak found" or "confirmed".
6. Copy every number exactly as the tools return it. Do not convert units, estimate costs or invent figures. If a tool returns an error, say so instead of guessing.
7. Priority is high, medium or low for dispatch and null for reject. Each reason is one plain sentence with the numbers (no field names); reason_ar is the same sentence in Arabic.`;
}

// ------------------------------------------------------------------ checks on the final result
// A number in a sentence: digits not glued to a letter (W7, KRK-02550 keeps its own digits via the pool).
const NUM_RE = /(?<![A-Za-z\d.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g;
const numberOf = (m: RegExpMatchArray) => Number(m[1].replace(/,/g, "") + (m[2] ?? ""));

function collectNumbers(v: unknown, into: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) into.push(Math.abs(v));
  else if (typeof v === "string") for (const m of v.matchAll(NUM_RE)) into.push(numberOf(m));
  else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectNumbers(x, into));
  return into;
}

/** The rule constants (dispatch radius, pressure-drop threshold) count only when written as a distance ("40 m",
 *  "more than 1 m"); a bare "1" (e.g. "1 other junction") must come from a tool result, not from a rule. */
const RULE_CONSTANTS = [DISPATCH_RADIUS_M, DROP_THRESHOLD_M];
const RULE_UNIT_AFTER = /^\s?(m|م)(?![A-Za-zء-ي²³])/;

/** Every number in a reason should match a tool result for that spot: exactly, rounded, or metres written as km. */
function checkNumbers(reason: string, pool: number[]) {
  const found: { text: string; match: "exact" | "rounded" | "none" }[] = [];
  for (const m of reason.matchAll(NUM_RE)) {
    const text = m[0];
    const n = numberOf(m);
    const after = reason.slice((m.index ?? 0) + text.length);
    if (RULE_CONSTANTS.some((c) => Math.abs(c - n) < 1e-9) && RULE_UNIT_AFTER.test(after)) {
      found.push({ text, match: "exact" });
      continue;
    }
    const decimals = m[2] ? m[2].length - 1 : 0;
    const tol = 0.5 * 10 ** -decimals + 1e-9;
    let match: "exact" | "rounded" | "none" = "none";
    for (const v of pool) {
      if (Math.abs(n - v) < 1e-9) {
        match = "exact";
        break;
      }
      if (Math.abs(n - v) <= tol || Math.abs(n * 1000 - v) <= tol * 1000) match = "rounded";
    }
    found.push({ text, match });
  }
  return {
    total: found.length,
    matched: found.filter((f) => f.match !== "none").length,
    rounded: found.filter((f) => f.match === "rounded").map((f) => f.text),
    unmatched: found.filter((f) => f.match === "none").map((f) => f.text),
  };
}

function finalize(result: TriageResult, runs: ToolRun[]) {
  const listRun = runs.find((r) => r.name === "list_wet_spots" && !r.is_error);
  const listed = ((listRun?.result as { spots?: Record<string, unknown>[] })?.spots ?? []) as Record<string, unknown>[];
  const rain = (listRun?.result as { rain_check?: string })?.rain_check ?? "";
  // rule constants are not in the pool: checkNumbers accepts them only next to their own unit (see RULE_CONSTANTS)
  const global = collectNumbers([rain]);
  const decisions = result.decisions.map((d) => {
    const id = d.id.toLowerCase();
    const spotRuns = runs.filter((r) => String(r.input?.spot_id ?? "").toLowerCase() === id);
    const forSpot = spotRuns.map((r) => r.result);
    // a tool whose data file is missing (held back in a fresh clone): its numbers cannot be verified
    const toolsMissing = [
      ...new Set(spotRuns.filter((r) => r.is_error && (r.result as { error?: string })?.error === "missing_data").map((r) => r.name)),
    ];
    const row = listed.find((s) => String(s.spot_id).toLowerCase() === id);
    const pool = [...global, ...collectNumbers(forSpot), ...collectNumbers(row ?? {})];
    const spot = findSpot(d.id)?.properties;
    const rule = !spot ? "unknown_spot" : d.verdict === "dispatch" && !spot.on_pipe_40m ? "dispatch_beyond_40m" : "ok";
    return {
      ...d,
      checks: {
        numbers: checkNumbers(d.reason, pool),
        // the Arabic reason is checked on its own: the screen shows the check for the language it shows
        ...(d.reason_ar ? { numbers_ar: checkNumbers(d.reason_ar, pool) } : {}),
        tools_missing: toolsMissing,
        rule,
      },
    };
  });
  const ids = new Set(result.decisions.map((d) => d.id.toLowerCase()));
  return {
    decisions,
    summary: result.summary,
    summary_ar: result.summary_ar ?? null,
    missing_ids: spotIds().filter((id) => !ids.has(id.toLowerCase())),
  };
}

function validate(input: unknown): { ok: true; value: TriageResult } | { ok: false; error: string } {
  const v = input as TriageResult;
  if (!v || !Array.isArray(v.decisions) || typeof v.summary !== "string")
    return { ok: false, error: "Expected {decisions: [...], summary, summary_ar}." };
  for (const d of v.decisions) {
    if (!d || typeof d.id !== "string" || !findSpot(d.id))
      return { ok: false, error: `Unknown spot id ${JSON.stringify(d?.id)}. Use the ids from list_wet_spots.` };
    if (d.verdict !== "dispatch" && d.verdict !== "reject") return { ok: false, error: `verdict for ${d.id} must be "dispatch" or "reject".` };
    if (d.verdict === "reject") d.priority = null;
    else if (!["high", "medium", "low"].includes(String(d.priority))) return { ok: false, error: `priority for ${d.id} must be high, medium or low.` };
    if (typeof d.reason !== "string" || !d.reason.trim()) return { ok: false, error: `reason for ${d.id} is empty.` };
  }
  return { ok: true, value: { decisions: v.decisions, summary: v.summary, summary_ar: v.summary_ar } };
}

function parseJsonText(text: string): unknown {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ live run (Claude, manual tool loop)
class LiveStop extends Error {
  why: Bilingual;
  constructor(why: Bilingual) {
    super(why.en);
    this.why = why;
  }
}

type Send = (event: string, data: Record<string, unknown>) => Promise<void>;

async function runLive(send: Send, signal: AbortSignal) {
  // The SDK reads ANTHROPIC_API_KEY from the environment. A key that is not scoped to a workspace needs the
  // anthropic-workspace-id header (the API answers 400 without it); the SDK does not read that from the environment.
  const ws = process.env.ANTHROPIC_WORKSPACE_ID;
  const client = new Anthropic(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {});
  const MODEL = model();
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: "Triage every persistent wet spot now." }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, requests: 0 };
  const runs: ToolRun[] = [];
  let i = 0;
  let nudged = false;

  const finish = async (result: TriageResult) => {
    await send("final", { source: "live", ...finalize(result, runs) });
    await send("usage", { source: "live", live: true, model: MODEL, ...usage });
  };

  await send("start", { source: "live", model: MODEL });
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    await send("status", { source: "live", phase: "thinking", turn });
    // thinking is left at the model default (adaptive); depth is set with output_config.effort
    const stream = client.messages.stream(
      { model: MODEL, max_tokens: MAX_TOKENS, system, tools: TOOLS, messages, output_config: { effort: "medium" } },
      { signal },
    );
    const message = await stream.finalMessage();
    usage.requests++;
    usage.input_tokens += message.usage.input_tokens ?? 0;
    usage.output_tokens += message.usage.output_tokens ?? 0;
    usage.cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    usage.cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;

    // stop_reason first, before reading any content
    if (message.stop_reason === "refusal") throw new LiveStop({ en: "Claude declined this request (refusal).", ar: "رفض Claude هذا الطلب." });
    if (message.stop_reason === "max_tokens")
      throw new LiveStop({
        en: `The answer hit the ${MAX_TOKENS}-token limit before it was complete.`,
        ar: `بلغ الرد حد ${MAX_TOKENS} رمزًا قبل اكتماله.`,
      });
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    const uses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (uses.length === 0) {
      // end_turn without submit_decisions: accept a JSON answer in the text, else ask once for the tool call
      const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const v = validate(parseJsonText(text));
      if (v.ok) return finish(v.value);
      if (nudged) throw new LiveStop({ en: "Claude ended without submitting decisions.", ar: "أنهى Claude دون إرسال القرارات." });
      nudged = true;
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: "Call submit_decisions with one decision per spot." });
      continue;
    }

    messages.push({ role: "assistant", content: message.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let final: TriageResult | null = null;
    for (const u of uses) {
      const input = (u.input ?? {}) as Record<string, unknown>;
      if (u.name === "submit_decisions") {
        const v = validate(input);
        if (v.ok) {
          final = v.value;
          toolResults.push({ type: "tool_result", tool_use_id: u.id, content: "Decisions received." });
        } else toolResults.push({ type: "tool_result", tool_use_id: u.id, content: v.error, is_error: true });
        continue;
      }
      const n = i++;
      await send("tool_call", { source: "live", i: n, name: u.name, input });
      const r = runTool(u.name, input);
      runs.push({ name: u.name, input, ...r });
      await send("tool_result", { source: "live", i: n, name: u.name, input, result: r.result, is_error: r.is_error });
      toolResults.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.result), ...(r.is_error ? { is_error: true } : {}) });
    }
    if (final) return finish(final);
    messages.push({ role: "user", content: toolResults });
  }
  throw new LiveStop({ en: `No decisions after ${MAX_TURNS} turns.`, ar: `لا قرارات بعد ${MAX_TURNS} جولة.` });
}

function whyLiveFailed(e: unknown): Bilingual {
  if (e instanceof LiveStop) return e.why;
  if (e instanceof Anthropic.AuthenticationError) return { en: "The API key was rejected.", ar: "رُفض مفتاح الواجهة البرمجية." };
  if (e instanceof Anthropic.RateLimitError) return { en: "The Claude API is rate-limited right now.", ar: "واجهة Claude مقيّدة بحد الطلبات الآن." };
  if (e instanceof Anthropic.APIUserAbortError) return { en: "The live run timed out.", ar: "انتهت مهلة التشغيل المباشر." };
  if (e instanceof Anthropic.APIConnectionError) return { en: "Cannot reach the Claude API (offline?).", ar: "تعذّر الوصول إلى واجهة Claude (لا اتصال؟)." };
  if (e instanceof Anthropic.APIError)
    return { en: `The Claude API returned an error (${e.status ?? "?"}).`, ar: `أعادت واجهة Claude خطأ (${e.status ?? "?"}).` };
  return { en: "The live run failed.", ar: "فشل التشغيل المباشر." };
}

// ------------------------------------------------------------------ recorded run (replay)
type Recorded = {
  label: string;
  origin: string;
  recorded_on: string;
  calls: { name: string; input: Record<string, unknown> }[];
  result: TriageResult;
};
function loadRecorded(): Recorded | null {
  if (!existsSync(RECORDED_FILE)) return null;
  return JSON.parse(readFileSync(RECORDED_FILE, "utf-8")) as Recorded;
}

async function runRecorded(send: Send, stream: SSEStreamingApi, why: Bilingual) {
  const rec = loadRecorded();
  if (!rec) {
    await send("error", {
      source: "recorded",
      message: { en: "The recorded run file is missing: server/recorded/triage.json", ar: "ملف التشغيل المسجّل غير موجود: server/recorded/triage.json" },
    });
    return;
  }
  await send("start", {
    source: "recorded",
    why,
    recorded: { label: rec.label, origin: rec.origin, recorded_on: rec.recorded_on, file: "server/recorded/triage.json" },
  });
  const runs: ToolRun[] = [];
  for (const [i, call] of rec.calls.entries()) {
    if (stream.aborted) return;
    await send("tool_call", { source: "recorded", i, name: call.name, input: call.input });
    await stream.sleep(170);
    const r = runTool(call.name, call.input); // re-executed against data/: the result shown is real
    runs.push({ name: call.name, input: call.input, ...r });
    await send("tool_result", { source: "recorded", i, name: call.name, input: call.input, result: r.result, is_error: r.is_error });
    await stream.sleep(110);
  }
  await stream.sleep(250);
  await send("final", { source: "recorded", ...finalize(rec.result, runs) });
  await send("usage", { source: "recorded", live: false });
}

// ------------------------------------------------------------------ routes
const triage = new Hono();

triage.get("/", (c) => {
  try {
    return c.json({
      live: Boolean(process.env.ANTHROPIC_API_KEY),
      model: model(),
      effort: "medium",
      tools: TOOLS.filter((t) => t.name !== "submit_decisions").map((t) => t.name),
      rules: rules(),
      recorded: existsSync(RECORDED_FILE),
    });
  } catch (e) {
    if (e instanceof MissingDataError) return c.json(e.toJSON(), 404);
    throw e;
  }
});

triage.post("/", async (c) => {
  let mode: "auto" | "recorded" = "auto";
  try {
    const body = (await c.req.json()) as { mode?: string };
    if (body?.mode === "recorded") mode = "recorded";
  } catch {
    /* empty body: auto */
  }
  return streamSSE(c, async (stream) => {
    const send: Send = async (event, data) => {
      if (!stream.aborted) await stream.writeSSE({ event, data: JSON.stringify(data) });
    };
    const ctrl = new AbortController();
    stream.onAbort(() => ctrl.abort());
    try {
      let why: Bilingual;
      if (mode === "recorded") why = { en: "Replay requested.", ar: "طُلبت إعادة التشغيل المسجّل." };
      else if (!process.env.ANTHROPIC_API_KEY)
        why = { en: "No ANTHROPIC_API_KEY on this machine.", ar: "لا يوجد مفتاح ANTHROPIC_API_KEY على هذا الجهاز." };
      else {
        const timer = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
        try {
          await runLive(send, ctrl.signal);
          clearTimeout(timer);
          await send("done", { source: "live" });
          return;
        } catch (e) {
          clearTimeout(timer);
          if (stream.aborted) return; // the viewer left
          console.error("[triage] live run failed, replaying the recorded run:", (e as Error)?.message ?? e);
          why = whyLiveFailed(e);
        }
      }
      await runRecorded(send, stream, why);
      await send("done", { source: "recorded" });
    } catch (e) {
      console.error("[triage]", e);
      const m = e instanceof MissingDataError ? e.toJSON().message : { en: "Triage failed on the server.", ar: "فشل الفرز على الخادم." };
      await send("error", { message: m });
    }
  });
});

export default triage;
