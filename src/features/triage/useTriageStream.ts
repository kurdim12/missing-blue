// POST /api/triage and read its Server-Sent Events (fetch + ReadableStream: EventSource cannot POST).
// A second `start` event (live run failed, recorded replay begins) resets the log, so the screen never mixes runs.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bi } from "../../i18n";

export type TriageSource = "live" | "recorded";

export type ToolEntry = {
  i: number;
  name: string;
  input: Record<string, unknown>;
  result?: any;
  is_error?: boolean;
  done: boolean;
};

export type NumberCheck = { total: number; matched: number; rounded: string[]; unmatched: string[] };

export type TriageDecision = {
  id: string;
  verdict: "dispatch" | "reject";
  priority: "high" | "medium" | "low" | null;
  reason: string;
  reason_ar?: string;
  corrected?: Bi;
  original_reason?: string;
  checks: {
    numbers: NumberCheck;
    /** the same check on the Arabic reason */
    numbers_ar?: NumberCheck;
    /** tools whose data file was missing for this spot (numbers from them cannot be verified) */
    tools_missing?: string[];
    rule: "ok" | "dispatch_beyond_40m" | "unknown_spot";
  };
};

export type TriageFinal = { decisions: TriageDecision[]; summary: string; summary_ar: string | null; missing_ids: string[] };

export type TriageUsage =
  | {
      live: true;
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      requests: number;
    }
  | { live: false };

export type RecordedInfo = { label: string; origin: string; recorded_on: string; file: string };

export type TriageInfo = {
  live: boolean;
  model: string;
  effort: string;
  tools: string[];
  rules: { dispatch_radius_m: number; position_accuracy_m: number; rain_check: string | null; passes: string[]; spots: number };
  recorded: boolean;
};

export type TriageState = {
  phase: "idle" | "running" | "done" | "error";
  source: TriageSource | null;
  model?: string;
  why?: Bi;
  recorded?: RecordedInfo;
  turn?: number;
  calls: ToolEntry[];
  final: TriageFinal | null;
  usage: TriageUsage | null;
  error?: Bi;
};

const INITIAL: TriageState = { phase: "idle", source: null, calls: [], final: null, usage: null };

const ERR_NETWORK: Bi = { en: "Cannot reach the Missing Blue server.", ar: "تعذّر الوصول إلى خادم الأزرق المفقود." };
const ERR_ENDED: Bi = { en: "The stream ended before any decision arrived.", ar: "انتهى البث قبل وصول أي قرار." };

function reduce(s: TriageState, event: string, d: any): TriageState {
  switch (event) {
    case "start":
      return { ...INITIAL, phase: "running", source: d.source, model: d.model, why: d.why, recorded: d.recorded };
    case "status":
      return { ...s, turn: d.turn };
    case "tool_call":
      return { ...s, calls: [...s.calls.filter((c) => c.i !== d.i), { i: d.i, name: d.name, input: d.input ?? {}, done: false }] };
    case "tool_result":
      return {
        ...s,
        calls: s.calls.some((c) => c.i === d.i)
          ? s.calls.map((c) => (c.i === d.i ? { ...c, result: d.result, is_error: d.is_error, done: true } : c))
          : [...s.calls, { i: d.i, name: d.name, input: d.input ?? {}, result: d.result, is_error: d.is_error, done: true }],
      };
    case "final":
      return { ...s, final: { decisions: d.decisions ?? [], summary: d.summary ?? "", summary_ar: d.summary_ar ?? null, missing_ids: d.missing_ids ?? [] } };
    case "usage":
      return { ...s, usage: d.live ? (d as TriageUsage) : { live: false } };
    case "done":
      return { ...s, phase: "done" };
    case "error":
      return { ...s, phase: "error", error: d.message ?? ERR_ENDED };
    default:
      return s;
  }
}

/** The Impact screen reads the last run's token count from this browser (src/features/story/usage.ts). */
function saveUsage(d: any) {
  try {
    const v = d?.live
      ? { input_tokens: d.input_tokens, output_tokens: d.output_tokens, source: "live", model: d.model ?? null, at: new Date().toISOString() }
      : { source: "recorded", at: new Date().toISOString() };
    localStorage.setItem("mb.triage.usage", JSON.stringify(v));
    window.dispatchEvent(new Event("mb-triage-usage"));
  } catch {
    /* storage blocked: Impact keeps its "run triage" hint */
  }
}

export function useTriageStream() {
  const [state, setState] = useState<TriageState>(INITIAL);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const stop = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setState((s) => (s.phase === "running" ? { ...s, phase: s.final ? "done" : "idle" } : s));
  }, []);

  const run = useCallback(async (mode: "auto" | "recorded") => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ ...INITIAL, phase: "running" });
    const apply = (chunk: string) => {
      let event = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.join("\n"));
      } catch {
        return;
      }
      if (event === "usage") saveUsage(parsed);
      setState((s) => reduce(s, event, parsed));
    };
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ mode }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
        let k: number;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          apply(buf.slice(0, k));
          buf = buf.slice(k + 2);
        }
      }
      if (buf.trim()) apply(buf);
      if (c.signal.aborted) return;
      setState((s) => (s.phase === "running" ? (s.final ? { ...s, phase: "done" } : { ...s, phase: "error", error: ERR_ENDED }) : s));
    } catch {
      if (c.signal.aborted) return;
      setState((s) => ({ ...s, phase: "error", error: ERR_NETWORK }));
    }
  }, []);

  return { state, run, stop };
}
