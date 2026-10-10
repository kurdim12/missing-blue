// Typed client for the GET routes in server/index.ts. Offline-safe: every failure becomes an ApiError
// with a bilingual message (never an unhandled rejection in a screen).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bi, Lang } from "./i18n";
import type {
  ApiErrorBody,
  HfLiveModel,
  HfResultsResponse,
  Health,
  PipesFC,
  PipesSummary,
  SpotDetail,
  SpotsFC,
  TwinResponse,
  TwinScenario,
} from "./types";

export type ApiErrorKind = "network" | "missing_data" | "not_found" | "http" | "parse";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number;
  body: ApiErrorBody | null;
  constructor(kind: ApiErrorKind, status: number, body: ApiErrorBody | null, msg: string) {
    super(msg);
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
  /** Bilingual text for the UI (EmptyState uses it). */
  text(lang: Lang): string {
    if (this.body?.message) return this.body.message[lang];
    return (NETWORK_MSG[this.kind] ?? NETWORK_MSG.http)[lang];
  }
  get hint(): string | undefined {
    return this.body?.hint;
  }
}

const NETWORK_MSG: Record<string, Bi> = {
  network: {
    en: "Cannot reach the Missing Blue server. Start it with: npx tsx server/index.ts",
    ar: "تعذّر الوصول إلى خادم الأزرق المفقود. شغّله بالأمر: npx tsx server/index.ts",
  },
  parse: { en: "The server sent an unreadable answer.", ar: "أرسل الخادم ردًا غير مقروء." },
  http: { en: "The server returned an error.", ar: "أعاد الخادم خطأ." },
};

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    throw new ApiError("network", 0, null, String(e));
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new ApiError("http", res.status, null, `HTTP ${res.status}`);
    throw new ApiError("parse", res.status, null, "bad JSON");
  }
  if (!res.ok) {
    const b = body as ApiErrorBody;
    const kind: ApiErrorKind = b?.error === "missing_data" ? "missing_data" : res.status === 404 ? "not_found" : "http";
    throw new ApiError(kind, res.status, b, b?.message?.en ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export async function postJson<T>(path: string, data: unknown): Promise<T> {
  return getJson<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
}

// Same-URL GETs are shared (one request for many components); failures are not cached.
const memo = new Map<string, Promise<unknown>>();
function cached<T>(path: string): Promise<T> {
  const hit = memo.get(path);
  if (hit) return hit as Promise<T>;
  const p = getJson<T>(path).catch((e) => {
    memo.delete(path);
    throw e;
  });
  memo.set(path, p);
  return p;
}

export type Bbox = [number, number, number, number];

export const api = {
  health: () => getJson<Health>("/api/health"),
  spots: () => cached<SpotsFC>("/api/spots"),
  spot: (id: string) => cached<SpotDetail>(`/api/spots/${encodeURIComponent(id)}`),
  /** All pipes without bbox (~3.4 MB, cached); with bbox only those intersecting it. */
  pipes: (bbox?: Bbox) => cached<PipesFC>(bbox ? `/api/pipes?bbox=${bbox.map((v) => v.toFixed(5)).join(",")}` : "/api/pipes"),
  pipesSummary: () => cached<PipesSummary>("/api/pipes/summary"),
  hfModel: () => cached<HfLiveModel>("/api/hf/model"),
  hfResults: () => cached<HfResultsResponse>("/api/hf/results"),
  twin: (scenario: TwinScenario = "base") => cached<TwinResponse>(`/api/twin/mazar?scenario=${scenario}`),
};

/** Radar PNG overlays (public/radar). Bounds come from public/radar/bounds.json. */
export type RadarBounds = { bounds: { west: number; south: number; east: number; north: number }; size: [number, number]; files: string[]; source: string };
export const radar = {
  bounds: () => cached<RadarBounds>("/radar/bounds.json"),
  url: (file: string) => `/radar/${file}`,
};

/**
 * const { data, error, loading, reload } = useApi(() => api.spot(id), [id]);
 * `error` is an ApiError (render it with <EmptyState error={error} />).
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive.current && setState({ data, error: null, loading: false }),
      (e) => alive.current && setState({ data: null, error: e instanceof ApiError ? e : new ApiError("http", 0, null, String(e)), loading: false }),
    );
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
