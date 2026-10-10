// Shapes of the data served by server/index.ts (all read from files in data/).
import type { Bi } from "./i18n";

export type Provenance = "REAL" | "SIMULATED" | "ASSUMED" | "RECORDED" | "PLAN";
export type LngLat = [number, number];

// ------------------------------------------------------------------ errors (server JSON)
export type ApiErrorBody = { error: string; file?: string; message?: Bi; hint?: string };

// ------------------------------------------------------------------ health
export type Health = { ok: boolean; claude: boolean; pipes: boolean; twin: boolean; hf: boolean; hf_results: boolean };

// ------------------------------------------------------------------ wet spots (data/wet_spots/wet_spots.geojson)
export type SpotProps = {
  spot_id: string;
  lat: number;
  lon: number;
  area_m2: number;
  hh_rise_db: number;
  hv_rise_db: number;
  passes: string[];
  nearest_pipe_m: number;
  nearest_pipe_layer: string;
  nearest_pipe: string;
  on_pipe_40m: boolean;
  ground_hh_db_400m: number;
  landcover_2023: string;
  landcover_2024: string;
  landcover_2025: string;
  position_accuracy_m: number;
};
export type SpotFeature = { type: "Feature"; properties: SpotProps; geometry: { type: "Point"; coordinates: LngLat } };
export type SpotsFC = { type: "FeatureCollection"; name?: string; rain_check?: string; features: SpotFeature[] };

// ------------------------------------------------------------------ pipes (data/pipes/karak_pipes.geojson)
export type PipeClass = "trunk" | "main" | "distribution" | "service" | "unknown";
export type PipeProps = {
  pipe_id: string;
  cad_layer: string;
  diameter_in: number | null;
  diameter_mm: number | null;
  material: string | null;
  class: PipeClass;
  length_m: number;
  source_handle?: string;
};
export type PipeFeature = { type: "Feature"; properties: PipeProps; geometry: { type: "LineString"; coordinates: LngLat[] } };
export type PipesFC = { type: "FeatureCollection"; features: PipeFeature[]; query_bbox: number[] | null; count: number };
export type PipesSummary = { count: number; km_total: number; km_by_class: Partial<Record<PipeClass, number>>; source: string };

// ------------------------------------------------------------------ GET /api/spots/:id
export type SpotDetail = {
  id: string;
  spot: SpotProps;
  geometry: SpotFeature["geometry"];
  radar: { hh_rise_db: number; hv_rise_db: number; passes: string[]; area_m2: number; ground_hh_db_400m: number };
  nearest_pipe: {
    distance_m: number; // from the spot file; show as "spot centre X m from pipe", position ±50 m
    layer: string;
    label: string;
    on_pipe_40m: boolean;
    position_accuracy_m: number;
    feature: (PipeProps & { coordinates: LngLat[]; matches_spot_file: boolean }) | null; // null when pipes are absent
    feature_missing: ApiErrorBody | null;
  };
  land_cover: { year: number; class: string }[];
  rain_check: string | null;
  sources: { spot: string; pipe: string };
};

// ------------------------------------------------------------------ twin (data/twin/mazar_zone_results.json)
export type TwinScenario = "base" | "svc1" | "m5" | "m15" | "far15";
export type TwinPoint = { lat: number; lon: number; [k: string]: number };
export type TwinNode = { lat: number; lon: number; z: number; p: number; value: number };
export type TwinEdge = { c: LngLat[]; in: number; mat: string; q: number };
export type TwinResponse = {
  scenario: TwinScenario;
  metric: "pressure_m" | "drop_m";
  leak_lps: number | null; // ASSUMED leak size
  leak_at: (TwinPoint & { key: string }) | null;
  nodes: TwinNode[];
  edges: TwinEdge[];
  key: { cand: TwinPoint; tank: TwinPoint; tank2: TwinPoint; far: TwinPoint; main: TwinPoint; logger: TwinPoint };
  summary: { n_nodes: number; n_drop_gt1m: number | null; max_value: number; min_value: number };
  stats: {
    junctions: number;
    pipes: number;
    km: number;
    demand_lps: number;
    p_min: number;
    p_med: number;
    p_max: number;
    max_drop: Record<string, number>;
    n_drop_gt1m: Record<string, number>;
    n_drop_gt1m_excl_svc: number;
  };
  assumptions: { demand_lps_per_km: number; tank_above_highest_junction_m: number; hazen_williams_C: Record<string, number>; radius_m: number };
  source: string;
};

// ------------------------------------------------------------------ HydroFingerprint
/** data/hydrofingerprint/hf_live_model.json: feature 0 = inflow (L/s), 1..140 = pressure (m) at `nodes`; 32 classes = 5 gap bits. */
export type HfLiveModel = {
  gaps: string[];
  nodes: { lat: number; lon: number }[];
  base: number[]; // the 3 spread logger sites, as FEATURE indices (1..140) -> site = nodes[i - 1]
  ig: number[]; // AI-chosen order (7), FEATURE indices like `base`
  mu: number[][]; // 32 x 141 class means (feature 0 = inflow)
  cov: number[][]; // 141 x 141 shared covariance
  cases: { x: number[]; truth: number[] }[]; // 24 held-out test networks; truth = 5 gap bits (1 = connected)
  note: string;
  [k: string]: unknown;
};
export type HfGap = { id: string; gap_m: number; pipe_in: number; a: { lat: number; lon: number }; b: { lat: number; lon: number } };
export type HfResults = {
  gaps: HfGap[];
  gap_order: string[];
  n_scenarios: number;
  n_train: number;
  n_val: number;
  n_test: number;
  noise: { pressure_m: number; inflow_pct: number };
  sensors_base: { lat: number; lon: number; node: number }[];
  sensors_ig: { lat: number; lon: number; node: number }[];
  curve_ig: { n_sensors: number; val_logloss: number; info_bits: number }[];
  curve_random: { n_sensors: number; val_logloss: number; info_bits: number }[];
  eval: Record<"3" | "4" | "10", { bayes_gap_acc: number[]; bayes_state_acc: number; mlp_gap_acc: number[]; mlp_state_acc: number; n_test: number }>;
  demo: { test_row: number; truth: number[]; p_connected_3: number[]; p_connected_4: number[]; p_connected_10: number[] };
  network: { nodes: number; pipes: number; gaps_found: number };
  [k: string]: unknown;
};
export type HfTestBlock = {
  bayes: number[];
  bayes_all5: number;
  mlp: number[];
  mlp_all5: number;
  algorithm: number[];
  algorithm_all5: number;
  brier: number;
  ece: number;
  confident_share_pct: number;
  accuracy_when_confident_pct: number;
  n: number;
};
export type HfRobustness = {
  nominal_test: HfTestBlock; // accuracies in %, brier/ece as fractions
  shifted_test: HfTestBlock;
  shift: { roughness_factor: number[]; demand_multiplier: number[]; node_lognormal_sigma: number; tank_m: number; pressure_noise_m: number; inflow_noise_pct: number };
};
export type HfScale9 = {
  gaps: string[];
  n_states: number;
  n_scenarios: number;
  n_train: number;
  n_val: number;
  n_test: number;
  info_bits_curve: [number, number][];
  eval_3: { bayes_gap: number[]; bayes_all: number; mlp_gap: number[]; mlp_all: number };
  eval_15: { bayes_gap: number[]; bayes_all: number; mlp_gap: number[]; mlp_all: number };
  algorithm_15: { gap: number[]; all: number; reference_sims: number };
  /** logger junction ids only (coordinates are not published) */
  sensors: { node: number }[];
};
export type HfResultsResponse = {
  results: HfResults | null; // null in a fresh clone (held back)
  results_missing: ApiErrorBody | null;
  robustness: HfRobustness;
  scale9: HfScale9;
};
