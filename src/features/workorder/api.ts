// Client for server/workorder.ts (POST /api/workorder, GET /api/workorder, GET /api/workorder/lan).
import { getJson, postJson } from "../../api";
import type { Bi, Lang } from "../../i18n";

export const SECTION_KEYS = ["where", "pipe", "evidence", "why", "check", "loss"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Sections = Record<SectionKey, string>;
export type Priority = "high" | "medium" | "low";

export type WorkOrderFacts = {
  order_id: string;
  spot_id: string;
  status_of_spot: string;
  place: Bi | null;
  lat: number;
  lon: number;
  position_accuracy_m: number;
  pipe: {
    description: string;
    cad_layer: string;
    pipe_id: string | null;
    pipe_class: string | null;
    spot_centre_to_pipe_m: number;
    within_rule_distance: boolean;
    rule_distance_m: number;
  };
  radar: { sensor: string; baseline_pass: string; later_passes: string[]; hh_rise_db: number; hv_rise_db: number; area_m2: number };
  rain: { mm_between_passes: number | null; source: string };
  land_cover: { source: string; by_year: Record<string, string> };
  twin: null | {
    provenance: string;
    leak_lps_assumed: number;
    pressure_drop_threshold_m: number;
    other_junctions_dropping_more: number;
    junctions_in_twin: number;
    meaning: string;
  };
  estimated_loss: { provenance: string; leak_lps_assumed: number; m3_per_day: number };
  on_site_checks: string[];
};

export type WorkOrder = {
  spot_id: string;
  order_id: string;
  priority: Priority;
  ar: string;
  en: string;
  sections: { ar: Sections; en: Sections };
  labels: Record<SectionKey, Bi>;
  facts: WorkOrderFacts;
  source: "live" | "recorded";
  model?: string;
  by: string;
  written_at: string;
  check: { ok: boolean; numbers_checked: number; unmatched: string[] };
  fallback_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
};

export type OrderMode = "live" | "recorded" | "latest";
export type OrderRow = { spot_id: string; order_id: string; priority: Priority; source: "live" | "recorded" };

export const woApi = {
  order: (spot_id: string, lang: Lang, mode: OrderMode) => postJson<WorkOrder>("/api/workorder", { spot_id, lang, mode }),
  list: () => getJson<{ orders: OrderRow[]; claude: boolean }>("/api/workorder"),
  lan: () => getJson<{ addresses: string[] }>("/api/workorder/lan"),
};

export const PRIORITY_TONE: Record<Priority, "danger" | "warn" | "neutral"> = { high: "danger", medium: "warn", low: "neutral" };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLocalHost = (h: string) => LOCAL_HOSTS.has(h) || h.endsWith(".localhost");

/** Prefer a home/office Wi-Fi style address (192.168.x, 10.x) over virtual adapters (VirtualBox 192.168.56.x, WSL 172.x). */
export function rankLan(addresses: string[]) {
  const score = (a: string) => (a.startsWith("192.168.56.") ? 3 : a.startsWith("192.168.") ? 0 : a.startsWith("10.") ? 1 : 2);
  return [...addresses].sort((a, b) => score(a) - score(b));
}
