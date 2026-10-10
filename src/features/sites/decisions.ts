// Status of each site for the Sites list: the last AI council run saved in this browser (localStorage
// "mb.council.last") if present, else the recorded triage run (server/recorded/triage.json, bundled so it works offline).
import triageRec from "../../../server/recorded/triage.json";

export type SiteDecisionRow = {
  id: string;
  verdict: "dispatch" | "reject";
  priority?: string;
  reason?: string;
  reason_ar?: string;
};
export type DecisionSet = { origin: "council" | "recorded"; live: boolean; rows: SiteDecisionRow[] };

function pickRows(v: unknown): SiteDecisionRow[] | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const cand = (o.decisions ?? (o.data as Record<string, unknown> | undefined)?.decisions ?? (o.result as Record<string, unknown> | undefined)?.decisions) as unknown;
  if (!Array.isArray(cand)) return null;
  const rows = cand.filter(
    (d): d is SiteDecisionRow =>
      !!d && typeof d === "object" && typeof (d as SiteDecisionRow).id === "string" && ((d as SiteDecisionRow).verdict === "dispatch" || (d as SiteDecisionRow).verdict === "reject"),
  );
  return rows.length ? rows : null;
}

export function loadDecisions(): DecisionSet {
  try {
    const raw = localStorage.getItem("mb.council.last");
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const rows = pickRows(parsed);
      if (rows) return { origin: "council", live: parsed.source === "live", rows };
    }
  } catch {
    /* storage blocked or bad JSON: fall back to the recorded run */
  }
  return { origin: "recorded", live: false, rows: pickRows(triageRec) ?? [] };
}
