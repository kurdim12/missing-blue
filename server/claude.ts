// Shared Claude plumbing for the AI routes. server/triage.ts keeps its own copy of the same pattern (unchanged);
// new routes (server/council.ts) use this file.
//
//   makeClaudeClient()      Anthropic client; sends the "anthropic-workspace-id" header when ANTHROPIC_WORKSPACE_ID is
//                           set (a key that is not scoped to a workspace gets a 400 without it; the SDK does not read it
//                           from the environment). The key itself is read by the SDK from ANTHROPIC_API_KEY.
//   claudeModel()           CLAUDE_MODEL or "claude-opus-5-5". Read lazily: server/index.ts loads .env after imports.
//   hasClaudeKey()          whether a live call can be attempted at all
//   LiveStop / whyLiveFailed(e)   a bilingual reason for a fallback to the recorded run
//   Usage helpers           token counts summed over requests (never invented: only from API responses)
//   Number checks           every number in model text must exist in the tool results / facts it was given
//
// Thinking is never sent: on claude-opus-5-5 it is always adaptive (sending "disabled" is a 400). Depth is set per call
// with output_config.effort.
import Anthropic from "@anthropic-ai/sdk";
import type { Bilingual } from "./data";

export const claudeModel = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";
export const hasClaudeKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

export function makeClaudeClient(opts: { maxRetries?: number; timeoutMs?: number } = {}) {
  const ws = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({
    ...(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {}),
    ...(opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : {}),
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  });
}

/** A live run that must stop and fall back to the recorded run, with the reason in both languages. */
export class LiveStop extends Error {
  why: Bilingual;
  constructor(why: Bilingual) {
    super(why.en);
    this.why = why;
  }
}

export function whyLiveFailed(e: unknown): Bilingual {
  if (e instanceof LiveStop) return e.why;
  if (e instanceof Anthropic.AuthenticationError) return { en: "The API key was rejected.", ar: "رُفض مفتاح الواجهة البرمجية." };
  if (e instanceof Anthropic.RateLimitError) return { en: "The Claude API is rate-limited right now.", ar: "واجهة Claude مقيّدة بحد الطلبات الآن." };
  if (e instanceof Anthropic.APIUserAbortError) return { en: "The live run timed out.", ar: "انتهت مهلة التشغيل المباشر." };
  if (e instanceof Anthropic.APIConnectionError) return { en: "Cannot reach the Claude API (offline?).", ar: "تعذّر الوصول إلى واجهة Claude (لا اتصال؟)." };
  if (e instanceof Anthropic.APIError)
    return { en: `The Claude API returned an error (${e.status ?? "?"}).`, ar: `أعادت واجهة Claude خطأ (${e.status ?? "?"}).` };
  return { en: "The live run failed.", ar: "فشل التشغيل المباشر." };
}

// ------------------------------------------------------------------ usage
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  requests: number;
};
export const emptyUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, requests: 0 });
export function addUsage(u: Usage, m: Anthropic.Message["usage"]) {
  u.requests++;
  u.input_tokens += m.input_tokens ?? 0;
  u.output_tokens += m.output_tokens ?? 0;
  u.cache_creation_input_tokens += m.cache_creation_input_tokens ?? 0;
  u.cache_read_input_tokens += m.cache_read_input_tokens ?? 0;
  return u;
}
export function sumUsage(list: Usage[]): Usage {
  const t = emptyUsage();
  for (const u of list) {
    t.requests += u.requests;
    t.input_tokens += u.input_tokens;
    t.output_tokens += u.output_tokens;
    t.cache_creation_input_tokens += u.cache_creation_input_tokens;
    t.cache_read_input_tokens += u.cache_read_input_tokens;
  }
  return t;
}

// ------------------------------------------------------------------ number checks
// A number in a sentence: digits not glued to a Latin letter or a digit/dot before them (so "W7" keeps its 7 out).
export const NUM_RE = /(?<![A-Za-z\d.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g;
const numberOf = (m: RegExpMatchArray) => Number(m[1].replace(/,/g, "") + (m[2] ?? ""));

/** Every number found in a value: numbers, and numbers written inside strings (dates give 2026, 9, 16). */
export function collectNumbers(v: unknown, into: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) into.push(Math.abs(v));
  else if (typeof v === "string") for (const m of v.matchAll(NUM_RE)) into.push(numberOf(m));
  else if (Array.isArray(v)) v.forEach((x) => collectNumbers(x, into));
  else if (v && typeof v === "object") {
    // object KEYS can carry numbers too (the time series is keyed by pass date)
    for (const [k, x] of Object.entries(v)) {
      collectNumbers(k, into);
      collectNumbers(x, into);
    }
  }
  return into;
}

export type NumberCheck = { total: number; matched: number; rounded: string[]; unmatched: string[] };

/** Every number in `text` should match a pool value: exactly, rounded to the digits written, or metres written as km. */
export function checkNumbers(text: string, pool: number[]): NumberCheck {
  const found: { text: string; match: "exact" | "rounded" | "none" }[] = [];
  for (const m of String(text ?? "").matchAll(NUM_RE)) {
    const n = numberOf(m);
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
    found.push({ text: m[0], match });
  }
  return {
    total: found.length,
    matched: found.filter((f) => f.match !== "none").length,
    rounded: found.filter((f) => f.match === "rounded").map((f) => f.text),
    unmatched: found.filter((f) => f.match === "none").map((f) => f.text),
  };
}

/** The first {...} JSON object in a text reply, or null. */
export function parseJsonText(text: string): unknown {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
