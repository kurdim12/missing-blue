// v2 console shell: dark navy sidebar on the inline-start side + main area (light or dark panels).
// Phone (<= 760 px): the sidebar becomes a top bar with a menu drawer.
//
//   <AppShell counts={{ sites: 7, datasets: 12, audit: 30, reports: 2 }} dataUntil="2026-09-28" ai="live" layout="page">
//     <Screen ... />
//   </AppShell>
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n, useT } from "../i18n";
import { shellV2Strings, type ShellV2Key } from "../features/shell/strings-v2";
import { href, useHashRoute } from "../router";
import { Icon } from "./icons";
import { BrandMark } from "./BrandMark";
import { activeNavId, type NavCounts, type NavId } from "./nav";
import { Sidebar, type AiStatus } from "./Sidebar";
import "./shell-v2.css";

export type AppShellProps = {
  children: ReactNode;
  /** Count badges (wet spots, open reports, datasets, audit entries), each from an API response. */
  counts?: NavCounts;
  /** ISO date of the latest radar pass: latestRadarPass(await radar.bounds()). */
  dataUntil?: string | null;
  /** "live" when api.health().claude is true, "recorded" when false, "checking" while loading. */
  ai?: AiStatus;
  /** Open the assistant drawer; without it "Ask Missing Blue" links to #/assistant. */
  onAsk?: () => void;
  /** Override the highlighted nav item (default: computed from the hash route). */
  activeId?: NavId | null;
  /** "light" = light content panels (reference look), "dark" = the existing dark console tokens. */
  surface?: "light" | "dark";
  /** "page" = scrolling page, "full" = edge-to-edge (maps). Same classes as the v1 shell. */
  layout?: "page" | "full";
  /** Where the brand links to. */
  homeTo?: string;
};

export function AppShell({
  children,
  counts,
  dataUntil,
  ai = "checking",
  onAsk,
  activeId,
  surface = "light",
  layout = "page",
  homeTo = "/sites",
}: AppShellProps) {
  const route = useHashRoute();
  const t = useT(shellV2Strings);
  const { lang } = useI18n();
  const active = activeId !== undefined ? activeId : activeNavId(route.path, route.query);
  const routeKey = `${route.path}?${route.query.toString()}`;

  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // close the drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [routeKey]);

  // drawer: focus in, Esc closes, Tab trapped, page behind inert, focus returns to the menu button
  useEffect(() => {
    if (!open) return;
    const panel = drawer.current;
    const behind = body.current;
    behind?.setAttribute("inert", "");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.querySelector<HTMLElement>(".v2-drawer-close")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const f = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const btn = menuBtn.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      behind?.removeAttribute("inert");
      document.body.style.overflow = prevOverflow;
      btn?.focus({ preventScroll: true });
    };
  }, [open]);

  // the drawer is phone-only: close it if the window grows past the breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 761px)");
    const on = () => mq.matches && setOpen(false);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const sideProps = { activeId: active, counts, dataUntil, ai, onAsk, homeTo };
  const activeLabel = active ? t(`nav.${active}` as ShellV2Key) : null;

  return (
    <div className="v2-app" data-lang={lang}>
      <div className="v2-body" ref={body}>
        <a className="v2-skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById("main")?.focus())}>
          {lang === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}
        </a>

        <aside className="v2-rail" aria-label={t("navLabel")}>
          <Sidebar {...sideProps} variant="rail" />
        </aside>

        <header className="v2-phonebar">
          <a className="v2-phonebar-brand" href={href(homeTo)} aria-label={t("homeLabel")}>
            <BrandMark className="brand-mark v2-brand-mark" />
            <span className="v2-phonebar-name">{lang === "ar" ? t("brandAr") : t("brandEn")}</span>
          </a>
          {activeLabel ? <span className="v2-phonebar-page">{activeLabel}</span> : null}
          <button
            ref={menuBtn}
            type="button"
            className="v2-menu-btn"
            aria-expanded={open}
            aria-controls="v2-drawer"
            aria-label={t("openMenu")}
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
            <span className="v2-menu-btn-text">{t("menu")}</span>
          </button>
        </header>

        <main className={`v2-main app-main layout-${layout}`} data-surface={surface} id="main" tabIndex={-1}>
          {children}
        </main>
      </div>

      {open ? (
        <div className="v2-drawer-wrap">
          <div className="v2-drawer-backdrop" onClick={close} aria-hidden="true" />
          <div className="v2-drawer" id="v2-drawer" ref={drawer} role="dialog" aria-modal="true" aria-label={t("menu")}>
            <button type="button" className="v2-drawer-close" onClick={close} aria-label={t("closeMenu")}>
              <Icon name="close" />
            </button>
            <Sidebar {...sideProps} variant="drawer" onNavigate={close} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
