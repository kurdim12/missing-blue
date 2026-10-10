// Work orders (OWNER: work-order screen agent). Mounted at /api/workorder by server/index.ts.
//
//   POST /api/workorder {spot_id, lang, mode?}
//     mode "live" (default): Claude writes the order in Arabic AND English from a FACTS JSON built from data/,
//                            numbers copied exactly. Missing key, any API error, a stop_reason other than end_turn,
//                            a reply off-schema, or ANY number that is not in the facts -> the recorded order
//                            (source: "recorded"); the reason is logged and returned as fallback_reason.
//     mode "recorded":       the recorded order (instant, offline).
//     mode "latest":         the last live order written in this server session, else the recorded one.
//   -> {spot_id, order_id, priority, ar, en, sections:{ar,en}, labels, facts, source:"live"|"recorded", check, by, written_at}
//   GET  /api/workorder        -> the orders that exist (recorded + live in this session), for the status list
//   GET  /api/workorder/lan    -> this laptop's LAN IPv4 addresses (the QR code needs one: a phone cannot open localhost)
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { FILES, ROOT, findSpot, has, loadSpots, loadTwin, nearestPipe, type Bilingual } from "./data";

const model = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";
const RECORDED_FILE = join(ROOT, "server", "recorded", "workorders.json");

export const SECTION_KEYS = ["where", "pipe", "evidence", "why", "check", "loss"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
type Sections = Record<SectionKey, string>;
type Priority = "high" | "medium" | "low";

const SECTION_LABELS: Record<SectionKey, Bilingual> = {
  where: { en: "Location", ar: "الموقع" },
  pipe: { en: "Pipe", ar: "الأنبوب" },
  evidence: { en: "Evidence", ar: "الدليل" },
  why: { en: "Why a crew", ar: "لماذا فريق ميداني" },
  check: { en: "On site", ar: "في الموقع" },
  loss: { en: "Estimated loss (assumed leak size)", ar: "الفاقد المقدّر (حجم تسرّب مفترض)" },
};

// Place descriptions for the two dispatched spots (CLAUDE.md "Results": W7 west edge of al-Mazar al-Janubi, W3 NE edge of Karak).
const PLACES: Record<string, Bilingual> = {
  W7: { en: "west edge of al-Mazar al-Janubi, Karak", ar: "الطرف الغربي من المزار الجنوبي، محافظة الكرك" },
  W3: { en: "north-east edge of Karak, open rangeland", ar: "الطرف الشمالي الشرقي من الكرك، أرض رعوية مفتوحة" },
};

// "Within 40 m of a pipe" is the spot file's on_pipe_40m rule (CLAUDE.md data dictionary).
const ON_PIPE_RULE_M = 40;
// The twin's 1 L/s service-line leak scenario; its size is ASSUMED (server/index.ts reads the size from the key the same way).
const TWIN_LEAK_SCENARIO = "svc1";
const TWIN_DROP_THRESHOLD_M = 1; // stats.n_drop_gt1m* = junctions whose pressure drops more than 1 m
const SECONDS_PER_DAY = 86_400;

// ------------------------------------------------------------------ facts (everything the model may use)

const orderIdFor = (spotId: string) => `MB-KRK-${spotId.replace(/\D/g, "").padStart(4, "0")}`;

function metresBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const kx = 111320 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.hypot((lon2 - lon1) * kx, (lat2 - lat1) * 110574);
}

type TwinFacts = {
  provenance: string;
  leak_lps_assumed: number;
  pressure_drop_threshold_m: number;
  other_junctions_dropping_more: number;
  junctions_in_twin: number;
  meaning: string;
};

function buildFacts(spotId: string) {
  const f = findSpot(spotId);
  if (!f) return null;
  const p = f.properties;
  const rainText = loadSpots().rain_check ?? "";
  const rainMm = Number((rainText.match(/([\d.]+)\s*mm/) || [])[1]);

  // pipe identity from the pipe file when present (held back from git); the distance always comes from the spot file
  let pf: { pipe_id: string; class: string } | null = null;
  if (has(FILES.pipes)) {
    try {
      pf = nearestPipe(p.lon, p.lat)?.properties ?? null;
    } catch {
      pf = null;
    }
  }

  // hydraulic-twin facts only where the twin's candidate leak sits on this spot (W7); geometry REAL, operation ASSUMED
  let twin: TwinFacts | null = null;
  if (has(FILES.twin)) {
    try {
      const t = loadTwin();
      const near = t?.cand && metresBetween(p.lat, p.lon, t.cand.lat, t.cand.lon) <= p.position_accuracy_m;
      if (near && t.stats)
        twin = {
          provenance: "ASSUMED demand and tank level; REAL pipe geometry and elevation",
          leak_lps_assumed: Number(TWIN_LEAK_SCENARIO.replace(/\D/g, "")),
          pressure_drop_threshold_m: TWIN_DROP_THRESHOLD_M,
          other_junctions_dropping_more: t.stats.n_drop_gt1m_excl_svc,
          junctions_in_twin: t.stats.junctions,
          meaning:
            "with this leak, pressure drops by more than the threshold at only this many OTHER junctions of the twin, so pressure loggers in the network would likely miss it; the radar is what found it and only a site visit can confirm it",
        };
    } catch {
      twin = null;
    }
  }

  const leakLps = Number(TWIN_LEAK_SCENARIO.replace(/\D/g, ""));
  const [baseline, ...later] = p.passes;

  return {
    order_id: orderIdFor(p.spot_id),
    spot_id: p.spot_id,
    status_of_spot: "inspection candidate from radar, not a confirmed leak",
    place: PLACES[p.spot_id] ?? null,
    lat: p.lat,
    lon: p.lon,
    position_accuracy_m: p.position_accuracy_m,
    pipe: {
      description: p.nearest_pipe,
      cad_layer: p.nearest_pipe_layer,
      pipe_id: pf?.pipe_id ?? null,
      pipe_class: pf?.class ?? null,
      spot_centre_to_pipe_m: p.nearest_pipe_m,
      within_rule_distance: p.on_pipe_40m,
      rule_distance_m: ON_PIPE_RULE_M,
    },
    radar: {
      sensor: "NASA-ISRO NISAR L-band radar (provisional data)",
      baseline_pass: baseline,
      later_passes: later,
      hh_rise_db: p.hh_rise_db,
      hv_rise_db: p.hv_rise_db,
      area_m2: p.area_m2,
    },
    rain: { mm_between_passes: Number.isFinite(rainMm) ? rainMm : null, source: "ERA5 via Open-Meteo" },
    land_cover: {
      source: "Sentinel-2 land cover",
      by_year: { "2023": p.landcover_2023, "2024": p.landcover_2024, "2025": p.landcover_2025 },
    },
    twin,
    estimated_loss: {
      provenance: "ASSUMED leak size, not measured",
      leak_lps_assumed: leakLps,
      m3_per_day: Math.round(((leakLps * SECONDS_PER_DAY) / 1000) * 10) / 10,
    },
    on_site_checks: ["wet soil", "sunken asphalt", "green growth along the line", "ground microphone on the line and at the meter box", "meter box night flow"],
  };
}
export type Facts = NonNullable<ReturnType<typeof buildFacts>>;

// ------------------------------------------------------------------ number check (the model may copy numbers, never add them)

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** Numbers written in a text: Arabic-Indic digits normalised, thousands separators removed, signs ignored, m2/m3 units skipped. */
export function numbersIn(text: string): number[] {
  const s = text
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/(^|[^A-Za-z؀-ۿ])(m|م)[23](?!\d)/g, "$1$2");
  return (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
}
function factNumbers(v: unknown, out = new Set<number>()): Set<number> {
  if (typeof v === "number" && Number.isFinite(v)) out.add(Math.abs(v));
  else if (typeof v === "string") numbersIn(v).forEach((n) => out.add(n));
  else if (Array.isArray(v)) v.forEach((x) => factNumbers(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (/^\d+$/.test(k)) out.add(Number(k)); // year keys
      factNumbers(x, out);
    }
  return out;
}
export function checkNumbers(sections: { ar: Sections; en: Sections }, facts: unknown) {
  const allowed = [...factNumbers(facts)];
  let checked = 0;
  const unmatched: string[] = [];
  for (const lang of ["en", "ar"] as const)
    for (const k of SECTION_KEYS)
      for (const n of numbersIn(sections[lang][k] ?? "")) {
        checked++;
        if (!allowed.some((a) => Math.abs(a - n) < 1e-9)) unmatched.push(`${lang}.${k}: ${n}`);
      }
  return { ok: unmatched.length === 0, numbers_checked: checked, unmatched };
}

// ------------------------------------------------------------------ recorded orders (server/recorded/workorders.json)

type RecordedOrder = { order_id: string; spot_id: string; priority: Priority; recorded_at: string; by: string; en: Sections; ar: Sections };
type RecordedFile = { note: string; orders: RecordedOrder[] };

let recordedCache: RecordedFile | null = null;
function recorded(): RecordedFile {
  if (recordedCache) return recordedCache;
  try {
    if (!existsSync(RECORDED_FILE)) return { note: "", orders: [] };
    recordedCache = JSON.parse(readFileSync(RECORDED_FILE, "utf-8")) as RecordedFile;
  } catch (e) {
    console.error("[workorder] cannot read recorded orders:", e);
    return { note: "", orders: [] };
  }
  return recordedCache;
}
const recordedFor = (spotId: string) => recorded().orders.find((o) => o.spot_id.toLowerCase() === spotId.toLowerCase()) ?? null;

const joinSections = (s: Sections, lang: "en" | "ar") => SECTION_KEYS.map((k) => `${SECTION_LABELS[k][lang]}: ${s[k]}`).join("\n");

type OrderResult = {
  spot_id: string;
  order_id: string;
  priority: Priority;
  ar: string;
  en: string;
  sections: { ar: Sections; en: Sections };
  labels: typeof SECTION_LABELS;
  facts: Facts;
  source: "live" | "recorded";
  model?: string;
  by: string;
  written_at: string;
  check: ReturnType<typeof checkNumbers>;
  fallback_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
};

function recordedResult(spotId: string, facts: Facts, fallbackReason?: string): OrderResult | null {
  const r = recordedFor(spotId);
  if (!r) return null;
  const sections = { ar: r.ar, en: r.en };
  return {
    spot_id: r.spot_id,
    order_id: r.order_id,
    priority: r.priority,
    ar: joinSections(r.ar, "ar"),
    en: joinSections(r.en, "en"),
    sections,
    labels: SECTION_LABELS,
    facts,
    source: "recorded",
    by: r.by,
    written_at: r.recorded_at,
    // re-checked against today's facts: in a fresh clone the twin file is held back, so its numbers show as unmatched
    check: checkNumbers(sections, facts),
    ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
  };
}

// ------------------------------------------------------------------ live (Claude)

const SECTION_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(SECTION_KEYS.map((k) => [k, { type: "string" }])),
  required: [...SECTION_KEYS],
  additionalProperties: false,
};
const OUTPUT_SCHEMA = {
  type: "object",
  properties: { priority: { type: "string", enum: ["high", "medium", "low"] }, en: SECTION_SCHEMA, ar: SECTION_SCHEMA },
  required: ["priority", "en", "ar"],
  additionalProperties: false,
};

const SYSTEM = `You write field work orders for the leak-detection crew of the Karak water utility in Jordan.
Use ONLY the facts JSON you are given.
Numbers: copy every number exactly as it is written in the facts (same digits, same decimals). Add no other number: no rounding, no unit conversion, no totals, no ranges, no list numbering, no times, no pipe ids or codes that are not in the facts. Use Latin digits 0-9 in both languages. Write dates as day, month name, year (for example 16 Sep 2026 / 16 أيلول 2026).
Honesty: a wet spot is an inspection candidate, never a confirmed leak. The radar position is only good to about ± the position accuracy in the facts (write it as ±N m): say "spot centre X m from the pipe" and tell the crew to search the whole circle; never imply metre precision. The estimated loss uses an ASSUMED leak size: say so. If the twin facts are null, do not mention a hydraulic model.
Sections, one or two short sentences each: where = place, coordinates and the search circle; pipe = which pipe and the spot-centre distance; evidence = radar rise, passes, rain, land cover; why = why a crew visit is needed (use the twin facts when present); check = what to check on site; loss = the estimated loss if a leak is confirmed.
Write "ar" in clear Modern Standard Arabic for a Jordanian crew and "en" in plain English; both say the same thing. Do not repeat the section names inside the text.
Priority: "high" if the spot centre is within the rule distance of a pipe and the land is built area in every land-cover year; "medium" if within the rule distance otherwise; "low" if not within it.`;

// The SDK reads ANTHROPIC_API_KEY from the environment. A key that is not scoped to a workspace needs the
// anthropic-workspace-id header (the API answers 400 without it); the SDK does not read that from the environment.
let client: Anthropic | null = null;
const getClient = () => {
  if (client) return client;
  const ws = process.env.ANTHROPIC_WORKSPACE_ID;
  client = new Anthropic({ timeout: 60_000, maxRetries: 1, ...(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {}) });
  return client;
};

class Fallback extends Error {}

async function writeLive(facts: Facts): Promise<OrderResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Fallback("no ANTHROPIC_API_KEY on the server");
  let msg: Anthropic.Message;
  try {
    msg = await getClient().messages.create({
      model: model(),
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Facts JSON:\n${JSON.stringify(facts, null, 1)}\n\nWrite work order ${facts.order_id}.` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Fallback("API key rejected");
    if (e instanceof Anthropic.RateLimitError) throw new Fallback("rate limited");
    if (e instanceof Anthropic.APIConnectionError) throw new Fallback("no connection to the Claude API");
    if (e instanceof Anthropic.APIError) {
      console.warn("[workorder] Claude API error:", e.status, e.message);
      throw new Fallback(`Claude API error ${e.status ?? ""}`.trim());
    }
    throw new Fallback(String((e as Error)?.message ?? e));
  }
  if (msg.stop_reason !== "end_turn") throw new Fallback(`stop_reason ${msg.stop_reason}`);
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let out: { priority?: unknown; en?: unknown; ar?: unknown };
  try {
    out = JSON.parse(text);
  } catch {
    throw new Fallback("model reply was not JSON");
  }
  const okSections = (s: unknown): s is Sections =>
    !!s && typeof s === "object" && SECTION_KEYS.every((k) => typeof (s as Record<string, unknown>)[k] === "string" && (s as Sections)[k].trim().length > 0);
  if (!["high", "medium", "low"].includes(out.priority as string) || !okSections(out.en) || !okSections(out.ar))
    throw new Fallback("model reply did not match the order schema");
  const sections = { ar: out.ar, en: out.en };
  const check = checkNumbers(sections, facts);
  if (!check.ok) throw new Fallback(`numbers not in the facts: ${check.unmatched.join("; ")}`);
  return {
    spot_id: facts.spot_id,
    order_id: facts.order_id,
    priority: out.priority as Priority,
    ar: joinSections(out.ar, "ar"),
    en: joinSections(out.en, "en"),
    sections,
    labels: SECTION_LABELS,
    facts,
    source: "live",
    model: msg.model,
    by: `Claude (${msg.model}), live`,
    written_at: new Date().toISOString(),
    check,
    usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens },
  };
}

// ------------------------------------------------------------------ routes

const liveCache = new Map<string, OrderResult>(); // last live order per spot (this server session)

const workorder = new Hono();

workorder.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { spot_id?: string; lang?: string; mode?: string };
  const spotId = String(body.spot_id ?? "").trim();
  const lang = body.lang === "ar" || body.lang === "en" ? body.lang : null;
  const mode = body.mode === "recorded" || body.mode === "latest" ? body.mode : "live";
  let facts: Facts | null;
  try {
    facts = buildFacts(spotId);
  } catch (e) {
    console.error("[workorder] facts:", e);
    return c.json({ error: "server_error", message: { en: "Could not read the wet-spot data.", ar: "تعذّرت قراءة بيانات البقع الرطبة." } }, 500);
  }
  if (!facts) return c.json({ error: "not_found", message: { en: `No wet spot ${spotId}`, ar: `لا توجد بقعة رطبة ${spotId}` } }, 404);
  const key = facts.spot_id;

  if (mode === "latest" && liveCache.has(key)) return c.json({ ...liveCache.get(key)!, lang });

  if (mode === "live") {
    try {
      const live = await writeLive(facts);
      liveCache.set(key, live);
      console.log(`[workorder] ${key}: live order written (${live.check.numbers_checked} numbers checked against the facts)`);
      return c.json({ ...live, lang });
    } catch (e) {
      const reason = e instanceof Fallback ? e.message : String((e as Error)?.message ?? e);
      console.warn(`[workorder] ${key}: live order not used (${reason}); falling back to the recorded order`);
      const rec = recordedResult(key, facts, reason);
      if (rec) return c.json({ ...rec, lang });
      return c.json(
        {
          error: "no_order",
          reason,
          message: {
            en: `No recorded work order for ${key} (the AI triage did not dispatch a crew there), and the live AI could not write one: ${reason}.`,
            ar: `لا يوجد أمر عمل مسجَّل للبقعة ${key} (لم يرسل الفرز الذكي فريقًا إليها)، وتعذّر على الذكاء الاصطناعي المباشر كتابته: ${reason}.`,
          },
        },
        404,
      );
    }
  }

  const rec = recordedResult(key, facts);
  if (rec) return c.json({ ...rec, lang });
  const ids = recorded().orders.map((o) => o.spot_id);
  return c.json(
    {
      error: "no_order",
      message: {
        en: `No work order for ${key} yet. Recorded orders exist for ${ids.join(", ")}, the spots the AI triage dispatched. You can write one live with Claude.`,
        ar: `لا يوجد أمر عمل للبقعة ${key} بعد. توجد أوامر مسجّلة لـ ${ids.join(" و")}، وهي البقع التي أرسل إليها الفرز الذكي فريقًا. يمكنك كتابته مباشرة بواسطة Claude.`,
      },
    },
    404,
  );
});

workorder.get("/", (c) => {
  const rows = new Map<string, { spot_id: string; order_id: string; priority: Priority; source: "live" | "recorded" }>();
  for (const o of recorded().orders) rows.set(o.spot_id, { spot_id: o.spot_id, order_id: o.order_id, priority: o.priority, source: "recorded" });
  for (const o of liveCache.values()) rows.set(o.spot_id, { spot_id: o.spot_id, order_id: o.order_id, priority: o.priority, source: "live" });
  return c.json({ orders: [...rows.values()], claude: Boolean(process.env.ANTHROPIC_API_KEY) });
});

workorder.get("/lan", (c) => {
  const addresses: string[] = [];
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) addresses.push(a.address);
  return c.json({ addresses });
});

workorder.all("*", (c) => c.json({ error: "not_found", message: { en: "Unknown work-order route", ar: "مسار أمر عمل غير معروف" } }, 404));

export default workorder;
