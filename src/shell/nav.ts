// Sidebar navigation model for the v2 console shell. Routes are hash routes (see src/router.ts).
// Labels come from src/features/shell/strings-v2.ts ("nav.<id>"); counts are passed in by the app (never typed here).
import { match } from "../router";
import type { IconName } from "./icons";

/** Count badges the app can pass to the shell. Every value must come from an API response / data file. */
export type NavCountKey = "sites" | "reports" | "datasets" | "audit";
export type NavCounts = Partial<Record<NavCountKey, number | null | undefined>>;

export type NavItem = {
  id: NavId;
  /** Hash route this item opens (may carry a query, e.g. "/sites?tab=reports"). */
  to: string;
  icon: IconName;
  countKey?: NavCountKey;
  /** Extra route patterns that also light this item (sub-pages), e.g. "/spot/:id". */
  also?: string[];
};

export type NavId =
  | "sites"
  | "council"
  | "reports"
  | "edits"
  | "twin"
  | "workorder"
  | "learning"
  | "assistant"
  | "impact"
  | "sources"
  | "crew"
  | "problem"
  | "demo";

export type NavSection = { id: "ops" | "data" | "links"; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    id: "ops",
    items: [
      { id: "sites", to: "/sites", icon: "map", countKey: "sites", also: ["/overview", "/spot/:id"] },
      { id: "council", to: "/council", icon: "council", also: ["/triage"] },
      { id: "reports", to: "/sites?tab=reports", icon: "report", countKey: "reports" },
      { id: "edits", to: "/records", icon: "edit" },
      { id: "twin", to: "/twin", icon: "twin" },
      { id: "workorder", to: "/workorder/W7", icon: "wrench", also: ["/workorder/:id"] },
    ],
  },
  {
    id: "data",
    items: [
      { id: "learning", to: "/learning", icon: "learning" },
      { id: "assistant", to: "/assistant", icon: "sparkle" },
      { id: "impact", to: "/impact", icon: "briefcase" },
      { id: "sources", to: "/sources", icon: "book" },
    ],
  },
  {
    id: "links",
    items: [
      { id: "crew", to: "/crew/W7", icon: "phone", also: ["/crew/:id"] },
      { id: "problem", to: "/problem", icon: "home" },
      { id: "demo", to: "/demo", icon: "play" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);

/** Route of the "Ask Missing Blue" assistant (used when AppShell gets no onAsk handler). */
export const ASSISTANT_ROUTE = "/assistant";

/**
 * Which nav item is active for a hash route.
 * "/sites?tab=reports" lights Field reports; any other "/sites" lights Map & sites.
 */
export function activeNavId(path: string, query?: URLSearchParams): NavId | null {
  if (path === "/sites" || path.startsWith("/sites/")) return query?.get("tab") === "reports" ? "reports" : "sites";
  for (const item of NAV_ITEMS) {
    const base = item.to.split("?")[0];
    if (match(base, path)) return item.id;
    if (item.also?.some((p) => match(p, path))) return item.id;
  }
  return null;
}

/**
 * Latest radar pass date from public/radar/bounds.json (files like "hh_2026-09-28.png").
 * Pass the parsed JSON; returns an ISO date ("2026-09-28") or null. Feed it to <AppShell dataUntil=...>.
 */
export function latestRadarPass(bounds: { files?: string[] } | null | undefined): string | null {
  const dates = (bounds?.files ?? [])
    .map((f) => /(\d{4}-\d{2}-\d{2})/.exec(f)?.[1])
    .filter((d): d is string => !!d)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}
