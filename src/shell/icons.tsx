// Line icons for the v2 shell (inline SVG, 20 px, currentColor, 1.6 stroke). Decorative: aria-hidden.
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.2 9 4l6 2.2 5.5-2.2v13.8L15 20l-6-2.2-5.5 2.2Z" />
      <path d="M9 4v13.8M15 6.2V20" />
    </>
  ),
  council: (
    <>
      <circle cx="12" cy="7.5" r="3" />
      <circle cx="5.5" cy="10" r="2.2" />
      <circle cx="18.5" cy="10" r="2.2" />
      <path d="M6.5 20c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5M2.5 18.5c0-2.2 1.3-3.8 3-4.3M21.5 18.5c0-2.2-1.3-3.8-3-4.3" />
    </>
  ),
  report: (
    <>
      <path d="M6 3.5h8l4.5 4.5v12.5H6Z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
    </>
  ),
  edit: (
    <>
      <path d="m14.5 5.5 4 4L9 19H5v-4Z" />
      <path d="m12.5 7.5 4 4M13 20h7" />
    </>
  ),
  twin: (
    <>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="18.5" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7.5 6h9M6.6 7.7l4.3 8.6M17.4 7.7l-4.3 8.6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.6c-.6 1 .1 1.9 1.2 1.9h11.6c1.1 0 1.8-.9 1.2-1.9l-5.5-9.9V3.5" />
      <path d="M7.5 14.5h9" />
    </>
  ),
  learning: (
    <>
      <path d="M4 18.5 9 13l3.5 3.5L20 8.5" />
      <path d="M15 8.5h5v5" />
      <path d="M4 4v16h16" />
    </>
  ),
  audit: (
    <>
      <path d="M7 3.5h10.5v17H7a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 7 3.5Z" />
      <path d="m8.5 9 1.5 1.5L13 7.5M8.5 15h6.5M15.5 10h-1" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5C6.5 4 9.5 4 12 5.5v14c-2.5-1.5-5.5-1.5-8 0Z" />
      <path d="M20 5.5c-2.5-1.5-5.5-1.5-8 0v14c2.5-1.5 5.5-1.5 8 0Z" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.2" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7" width="17" height="12.5" rx="2" />
      <path d="M9 7V5.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V7M3.5 12.5h17M10 12.5v2h4v-2" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4Z" />
    </>
  ),
  play: (
    <>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="m10 8.5 4.5 2.5-4.5 2.5ZM8 20.5h8" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3.5c.6 3.8 2.2 5.4 6 6-3.8.6-5.4 2.2-6 6-.6-3.8-2.2-5.4-6-6 3.8-.6 5.4-2.2 6-6Z" />
      <path d="M18 14.5c.3 1.8 1 2.6 2.8 2.9-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1.1 2.8-2.9Z" />
    </>
  ),
  chart: (
    <>
      <path d="M7 17V11M12 17V7M17 17v-4" />
    </>
  ),
  check: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v2.5H9ZM9 13l2 2 4-4.5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.5 4.2a4.5 4.5 0 0 0-5.3 6L4 15.4a2.1 2.1 0 0 0 3 3l5.2-5.2a4.5 4.5 0 0 0 6-5.3l-2.7 2.7-2.6-.6-.6-2.6Z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5Z" />
    </>
  ),
};

export type IconName =
  | "dashboard"
  | "map"
  | "council"
  | "report"
  | "edit"
  | "twin"
  | "database"
  | "flask"
  | "learning"
  | "audit"
  | "book"
  | "phone"
  | "briefcase"
  | "home"
  | "play"
  | "sparkle"
  | "chart"
  | "check"
  | "menu"
  | "close"
  | "wrench"
  | "globe";

/** <Icon name="map" />  (20 px by default; inherits colour) */
export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`mb-icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}
