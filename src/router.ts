// Tiny hash router: "#/spot/W7?lang=ar" -> { path: "/spot/W7", params: { id: "W7" }, query }.
import { useEffect, useState } from "react";

export type Route = { path: string; query: URLSearchParams };

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { path: path.startsWith("/") ? path : `/${path}`, query: new URLSearchParams(qs || "") };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/** navigate("/spot/W7")  — same as setting location.hash = "#/spot/W7". */
export function navigate(to: string) {
  const h = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
  if (window.location.hash !== h) window.location.hash = h;
}

/** href("/spot/W7") -> "#/spot/W7" for <a href>. */
export const href = (to: string) => (to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`);

/** match("/spot/:id", "/spot/W7") -> { id: "W7" } | null */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) out[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return out;
}
