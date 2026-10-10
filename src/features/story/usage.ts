// Token count of the last AI triage run, as stored by the triage screen in this browser.
// Contract (for the triage screen): after a run, write
//   localStorage["mb.triage.usage"] = JSON.stringify({ input_tokens, output_tokens, source: "live" | "recorded", model?, at? })
// The reader also accepts the whole triage response under "mb.triage.last" (with a `usage` field), and sessionStorage.
import { useEffect, useState } from "react";

export type TriageUsage = {
  input_tokens: number;
  output_tokens: number;
  total: number;
  source: "live" | "recorded" | null;
  model: string | null;
  at: string | null;
  /** recorded replay: no live tokens were used */
  noTokens?: boolean;
};

const KEYS = ["mb.triage.usage", "mb.triage.last", "mb.triage"];

function parse(raw: string | null): TriageUsage | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    const u = v?.usage && typeof v.usage === "object" ? v.usage : v;
    const inp = Number(u?.input_tokens ?? u?.inputTokens);
    const out = Number(u?.output_tokens ?? u?.outputTokens);
    const src = v?.source ?? u?.source;
    // a recorded replay calls no model: no tokens to show, but the run happened
    if (src === "recorded" && (!Number.isFinite(inp) || !Number.isFinite(out)))
      return { input_tokens: 0, output_tokens: 0, total: 0, source: "recorded", model: null, at: typeof v?.at === "string" ? v.at : null, noTokens: true };
    if (!Number.isFinite(inp) || !Number.isFinite(out)) return null;
    return {
      input_tokens: inp,
      output_tokens: out,
      total: inp + out,
      source: src === "recorded" ? "recorded" : src === "live" ? "live" : null,
      model: typeof (v?.model ?? u?.model) === "string" ? (v?.model ?? u?.model) : null,
      at: typeof (v?.at ?? u?.at) === "string" ? (v?.at ?? u?.at) : null,
    };
  } catch {
    return null;
  }
}

export function readTriageUsage(): TriageUsage | null {
  for (const store of ["localStorage", "sessionStorage"] as const) {
    for (const k of KEYS) {
      try {
        const hit = parse(window[store].getItem(k));
        if (hit) return hit;
      } catch {
        /* storage blocked */
      }
    }
  }
  return null;
}

/** Re-reads when another tab writes it and when this tab regains focus. */
export function useTriageUsage(): TriageUsage | null {
  const [u, setU] = useState<TriageUsage | null>(readTriageUsage);
  useEffect(() => {
    const on = () => setU(readTriageUsage());
    window.addEventListener("storage", on);
    window.addEventListener("focus", on);
    window.addEventListener("mb-triage-usage", on);
    return () => {
      window.removeEventListener("storage", on);
      window.removeEventListener("focus", on);
      window.removeEventListener("mb-triage-usage", on);
    };
  }, []);
  return u;
}
