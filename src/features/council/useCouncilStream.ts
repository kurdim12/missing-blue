// POST /api/council and read its Server-Sent Events (fetch + ReadableStream: EventSource cannot POST).
// A second run_start (live run failed, the recorded replay begins) resets the trace, so runs never mix.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bi } from "../../i18n";

export type CouncilSource = "live" | "recorded";
export type AgentId = "radar" | "network" | "landuse" | "skeptic" | "dispatcher";
export const AGENT_IDS: AgentId[] = ["radar", "network", "landuse", "skeptic", "dispatcher"];

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; requests?: number };
export type NumberCheck = { ok?: boolean; total: number; matched: number; rounded: string[]; unmatched: string[] };

export type ToolCall = { name: string; input: Record<string, unknown>; is_error: boolean; summary: Bi | null };
export type PerSpot = {
  id: string;
  signal?: "for_dispatch" | "against_dispatch" | "neutral";
  finding?: string;
  finding_ar?: string;
  strength?: "strong" | "moderate" | "weak";
  concern?: string;
  concern_ar?: string;
  verdict?: "dispatch" | "reject";
  priority?: string | null;
  reason?: string;
  reason_ar?: string;
};
export type AgentState = {
  agent: AgentId;
  role: Bi;
  phase: number;
  status: "waiting" | "running" | "done";
  tools: ToolCall[];
  report: { text: string; text_ar: string; per_spot: PerSpot[]; checks?: NumberCheck } | null;
  usage: Usage | null;
  ms: number | null;
};

export type CouncilDecision = {
  id: string;
  verdict: "dispatch" | "reject";
  priority: "high" | "medium" | "low" | null;
  reason: string;
  reason_ar: string;
  skeptic_concern: string;
  skeptic_concern_ar: string;
  resolved_by: string;
  resolved_by_ar: string;
  checks?: { numbers: NumberCheck; rule: string };
};
export type CouncilFinal = {
  decisions: CouncilDecision[];
  summary: string;
  summary_ar: string;
  dissent: string;
  dissent_ar: string;
  candidates: string[];
  missing_ids: string[];
};
export type CouncilUsage = { live: boolean; model?: string; total: Usage; wall_ms: number; recorded_at?: string };
export type RecordedInfo = { label: string; recorded_at: string; model: string; wall_ms: number; file?: string };
export type CouncilInfo = { live: boolean; model: string; recorded: RecordedInfo | null };

export type CouncilState = {
  phase: "idle" | "running" | "done" | "error";
  source: CouncilSource | null;
  model?: string;
  why?: Bi;
  recorded?: RecordedInfo;
  agents: Record<AgentId, AgentState>;
  final: CouncilFinal | null;
  usage: CouncilUsage | null;
  error?: Bi;
  startedAt: number | null;
  endedAt: number | null;
};

const ROLES: Record<AgentId, Bi & { phase: number }> = {
  radar: { en: "Radar analyst", ar: "محلل الرادار", phase: 1 },
  network: { en: "Network engineer", ar: "مهندس الشبكة", phase: 1 },
  landuse: { en: "Land-use analyst", ar: "محلل استخدامات الأراضي", phase: 1 },
  skeptic: { en: "Skeptic (red team)", ar: "المشكّك (الفريق الأحمر)", phase: 2 },
  dispatcher: { en: "Dispatcher", ar: "مسؤول الإيفاد", phase: 3 },
};

const freshAgents = () =>
  Object.fromEntries(
    AGENT_IDS.map((a) => [
      a,
      { agent: a, role: { en: ROLES[a].en, ar: ROLES[a].ar }, phase: ROLES[a].phase, status: "waiting", tools: [], report: null, usage: null, ms: null } as AgentState,
    ]),
  ) as Record<AgentId, AgentState>;

const INITIAL: CouncilState = { phase: "idle", source: null, agents: freshAgents(), final: null, usage: null, startedAt: null, endedAt: null };

const ERR_NETWORK: Bi = { en: "Cannot reach the Missing Blue server.", ar: "تعذّر الوصول إلى خادم الأزرق المفقود." };
const ERR_ENDED: Bi = { en: "The stream ended before the council decided.", ar: "انتهى البث قبل أن يقرّر المجلس." };

function patch(s: CouncilState, a: unknown, f: (x: AgentState) => AgentState): CouncilState {
  const id = a as AgentId;
  if (!s.agents[id]) return s;
  return { ...s, agents: { ...s.agents, [id]: f(s.agents[id]) } };
}

function reduce(s: CouncilState, event: string, d: any): CouncilState {
  switch (event) {
    case "run_start":
      return { ...INITIAL, agents: freshAgents(), phase: "running", source: d.source, model: d.model, why: d.why, recorded: d.recorded, startedAt: Date.now() };
    case "agent_start":
      return patch(s, d.agent, (x) => ({ ...x, status: "running" }));
    case "tool_call":
      return patch(s, d.agent, (x) => ({
        ...x,
        status: x.status === "waiting" ? "running" : x.status,
        tools: [...x.tools, { name: String(d.name), input: d.input ?? {}, is_error: Boolean(d.is_error), summary: d.result_summary ?? null }],
      }));
    case "agent_report":
      return patch(s, d.agent, (x) => ({ ...x, report: { text: d.text ?? "", text_ar: d.text_ar ?? "", per_spot: d.per_spot ?? [], checks: d.checks } }));
    case "agent_done":
      return patch(s, d.agent, (x) => ({ ...x, status: "done", usage: d.usage ?? null, ms: typeof d.ms === "number" ? d.ms : null }));
    case "final":
      return {
        ...s,
        final: {
          decisions: d.decisions ?? [],
          summary: d.summary ?? "",
          summary_ar: d.summary_ar ?? "",
          dissent: d.dissent ?? "",
          dissent_ar: d.dissent_ar ?? "",
          candidates: d.candidates ?? [],
          missing_ids: d.missing_ids ?? [],
        },
      };
    case "usage":
      return { ...s, usage: { live: Boolean(d.live), model: d.model, total: d.total, wall_ms: d.wall_ms, recorded_at: d.recorded_at } };
    case "done":
      return { ...s, phase: "done", endedAt: Date.now() };
    case "error":
      return { ...s, phase: "error", error: d.message ?? ERR_ENDED, endedAt: Date.now() };
    default:
      return s;
  }
}

/** The Sites page reads the council's last decisions from this browser. */
function saveLast(final: CouncilFinal | null, usage: any, source: CouncilSource | null) {
  if (!final) return;
  try {
    localStorage.setItem(
      "mb.council.last",
      JSON.stringify({
        decisions: final.decisions.map(({ id, verdict, priority, reason, reason_ar, skeptic_concern, skeptic_concern_ar, resolved_by, resolved_by_ar }) => ({
          id,
          verdict,
          priority,
          reason,
          reason_ar,
          skeptic_concern,
          skeptic_concern_ar,
          resolved_by,
          resolved_by_ar,
        })),
        usage: usage ? { live: Boolean(usage.live), total: usage.total ?? null, wall_ms: usage.wall_ms ?? null, recorded_at: usage.recorded_at ?? null } : null,
        at: new Date().toISOString(),
        source,
      }),
    );
    window.dispatchEvent(new Event("mb-council-last"));
  } catch {
    /* storage blocked: Sites simply shows no council verdicts */
  }
}

export function useCouncilInfo() {
  const [info, setInfo] = useState<CouncilInfo | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/council")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !off && j && setInfo(j))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  return info;
}

export function useCouncilStream() {
  const [state, setState] = useState<CouncilState>(INITIAL);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const stop = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setState((s) => (s.phase === "running" ? { ...s, phase: s.final ? "done" : "idle" } : s));
  }, []);

  const run = useCallback(async (mode: "live" | "recorded") => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ ...INITIAL, agents: freshAgents(), phase: "running", startedAt: Date.now() });
    let lastFinal: CouncilFinal | null = null;
    let source: CouncilSource | null = null;
    const apply = (chunk: string) => {
      let event = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length) return;
      let parsed: any;
      try {
        parsed = JSON.parse(data.join("\n"));
      } catch {
        return;
      }
      if (event === "run_start") {
        source = parsed.source ?? null;
        lastFinal = null;
      }
      if (event === "final") lastFinal = reduce(INITIAL, "final", parsed).final;
      if (event === "usage") saveLast(lastFinal, parsed, source);
      setState((s) => reduce(s, event, parsed));
    };
    try {
      const res = await fetch("/api/council", {
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
      setState((s) => (s.phase === "running" ? (s.final ? { ...s, phase: "done", endedAt: Date.now() } : { ...s, phase: "error", error: ERR_ENDED }) : s));
    } catch {
      if (c.signal.aborted) return;
      setState((s) => ({ ...s, phase: "error", error: ERR_NETWORK }));
    }
  }, []);

  return { state, run, stop };
}
