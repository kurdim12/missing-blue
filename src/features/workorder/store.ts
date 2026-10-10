// Demo-only persistence in localStorage (every access wrapped: storage can be blocked).
// Order status (Sent / In progress / Confirmed / Not found) and the crew report written on the phone.
import { useCallback, useEffect, useState } from "react";

export const STATUSES = ["sent", "in_progress", "confirmed", "not_found"] as const;
export type Status = (typeof STATUSES)[number];

export const CHECKS = ["wet_soil", "sunken_asphalt", "green_growth", "night_flow"] as const;
export type CheckKey = (typeof CHECKS)[number];

export type CrewReport = {
  checks: Partial<Record<CheckKey, boolean>>;
  note: string;
  result: "leak" | "no_leak" | null;
  saved_at: string | null;
};

const STATUS_KEY = "mb.wo.status";
const crewKey = (spotId: string) => `mb.crew.${spotId.toUpperCase()}`;
const EVENT = "mb-wo-store";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? ({ ...fallback, ...JSON.parse(v) } as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the demo still works for this page view */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Re-render when another component (or another tab) changes the store. */
function useStoreTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
}

export function useStatuses() {
  useStoreTick();
  const all = read<Record<string, Status>>(STATUS_KEY, {});
  const get = (spotId: string): Status => all[spotId.toUpperCase()] ?? "sent";
  const set = useCallback((spotId: string, s: Status) => {
    write(STATUS_KEY, { ...read<Record<string, Status>>(STATUS_KEY, {}), [spotId.toUpperCase()]: s });
  }, []);
  return { get, set };
}

const EMPTY_REPORT: CrewReport = { checks: {}, note: "", result: null, saved_at: null };

export function useCrewReport(spotId: string) {
  useStoreTick();
  const report = read<CrewReport>(crewKey(spotId), EMPTY_REPORT);
  const update = useCallback(
    (patch: Partial<CrewReport>) => {
      const next = { ...read<CrewReport>(crewKey(spotId), EMPTY_REPORT), ...patch };
      write(crewKey(spotId), next);
      // a saved crew result moves the order status (same device only in this demo)
      if (patch.result !== undefined)
        write(STATUS_KEY, {
          ...read<Record<string, Status>>(STATUS_KEY, {}),
          [spotId.toUpperCase()]: patch.result === "leak" ? "confirmed" : patch.result === "no_leak" ? "not_found" : "in_progress",
        });
    },
    [spotId],
  );
  return { report, update };
}

export const readCrewReport = (spotId: string) => read<CrewReport>(crewKey(spotId), EMPTY_REPORT);
