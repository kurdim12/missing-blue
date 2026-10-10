// Presenter clock for demo mode. Survives reloads in this tab (sessionStorage), never required to render.
import { useCallback, useEffect, useState } from "react";

type ClockState = { acc: number; since: number | null }; // acc = ms banked while paused; since = start of the running stretch
const KEY = "mb.demo.clock";

function load(): ClockState {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (v && typeof v.acc === "number" && (v.since === null || typeof v.since === "number")) return v;
  } catch {
    /* storage blocked */
  }
  return { acc: 0, since: null };
}

export function useDemoClock() {
  const [st, setSt] = useState<ClockState>(load);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* storage blocked */
    }
  }, [st]);

  useEffect(() => {
    if (st.since === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [st.since]);

  const elapsedMs = st.acc + (st.since !== null ? Math.max(0, now - st.since) : 0);
  const running = st.since !== null;
  const started = running || st.acc > 0;

  /** Start from a script mark (seconds). */
  const startAt = useCallback((sec: number) => setSt({ acc: Math.max(0, sec) * 1000, since: Date.now() }), []);
  const toggle = useCallback(
    () =>
      setSt((s) => (s.since !== null ? { acc: s.acc + (Date.now() - s.since), since: null } : { acc: s.acc, since: Date.now() })),
    [],
  );
  const reset = useCallback(() => setSt({ acc: 0, since: null }), []);

  return { elapsed: elapsedMs / 1000, running, started, startAt, toggle, reset };
}
export type DemoClock = ReturnType<typeof useDemoClock>;
