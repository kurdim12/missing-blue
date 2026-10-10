// Client for server/learning.ts (adaptive learning) and server/audit.ts. Offline-safe through getJson/postJson.
import { getJson, postJson } from "../../api";
import type { Bi } from "../../i18n";

export type Outcome = "leak" | "no_leak";
export type LearningWeight = {
  name: string;
  label: Bi;
  transform: string;
  prior: number;
  prior_std: number;
  posterior: number;
  std: number;
  moved: number;
};
export type LearningSpot = {
  id: string;
  score: number;
  rank: number;
  prior_score: number;
  prior_rank: number;
  change: number;
  score_delta: number;
  band: [number, number];
  label: Outcome | null;
  features: Record<string, number | boolean>;
};
export type LearningLabel = { id: string; spot_id: string; outcome: Outcome; note: string | null; ts: string; source: "demo" };
export type LearningState = {
  model: string;
  score_name: Bi;
  n_labels: number;
  n_outcomes_logged: number;
  labels: LearningLabel[];
  provenance: "DEMO LABEL" | "PLAN";
  model_note: Bi;
  prior_note: Bi;
  weights: LearningWeight[];
  spots: LearningSpot[];
  fit: { iterations: number };
  sources: { spots: string; outcomes: string };
};
export type OutcomeResponse = {
  entry: LearningLabel;
  before: { score: number; rank: number };
  after: { score: number; rank: number };
  state: LearningState;
};

export const learningApi = {
  state: () => getJson<LearningState>("/api/learning/state"),
  outcome: (spot_id: string, outcome: Outcome, note?: string) => postJson<OutcomeResponse>("/api/learning/outcome", { spot_id, outcome, note }),
  reset: () => postJson<{ cleared: number; state: LearningState }>("/api/learning/reset", {}),
};

/** Fire-and-forget from the crew phone: a failure (offline) is returned, never thrown. */
export async function postCrewOutcome(spot_id: string, outcome: Outcome, note?: string): Promise<boolean> {
  try {
    await learningApi.outcome(spot_id, outcome, note || undefined);
    return true;
  } catch {
    return false;
  }
}
