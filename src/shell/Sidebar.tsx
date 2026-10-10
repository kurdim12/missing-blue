// v2 console sidebar: brand, workspace card, grouped nav (icons + count badges), Ask button, footer
// (latest radar pass, online + AI status, EN/AR toggle). Sits on the inline-start side (right in Arabic).
import { useEffect, useRef } from "react";
import { fmt, fmtDate, useI18n, useT } from "../i18n";
import { shellV2Strings, type ShellV2Key } from "../features/shell/strings-v2";
import { href } from "../router";
import { Icon } from "./icons";
import { BrandMark } from "./BrandMark";
import { NAV, type NavCounts, type NavId } from "./nav";
import { useOnline } from "./useOnline";
import "./shell-v2.css";

export type AiStatus = "live" | "recorded" | "checking";

export type SidebarProps = {
  /** Highlighted nav item (AppShell computes it from the hash route). */
  activeId: NavId | null;
  /** Count badges, each from an API response / data file. Missing or null = no badge. */
  counts?: NavCounts;
  /** ISO date of the latest radar pass (use latestRadarPass(bounds) from ./nav). */
  dataUntil?: string | null;
  /** Live Claude available? From api.health().claude (true = "live", false = "recorded"). */
  ai?: AiStatus;
  /** Opens the assistant (drawer). Without it the button links to #/assistant. */
  onAsk?: () => void;
  /** Called after any nav link is followed (the phone drawer closes itself with it). */
  onNavigate?: () => void;
  /** Where the brand links to. */
  homeTo?: string;
  /** "rail" = desktop sidebar, "drawer" = inside the phone menu drawer. */
  variant?: "rail" | "drawer";
};

export function Sidebar({ activeId, counts, dataUntil, ai = "checking", onAsk, onNavigate, homeTo = "/sites", variant = "rail" }: SidebarProps) {
  const t = useT(shellV2Strings);
  const { lang, toggleLang } = useI18n();
  const online = useOnline();
  const aiState: AiStatus = !online ? "recorded" : ai;
  const navRef = useRef<HTMLElement>(null);

  // keep the active item visible when the nav list scrolls (short screens)
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>(".v2-nav-link.is-active")?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <div className={`v2-side v2-side-${variant}`}>
      <a className="v2-brand" href={href(homeTo)} aria-label={t("homeLabel")} onClick={onNavigate}>
        <BrandMark className="brand-mark v2-brand-mark" />
        <span className="v2-brand-names">
          <span className="v2-brand-ar" lang="ar" dir="rtl">
            {t("brandAr")}
          </span>
          <span className="v2-brand-en" lang="en" dir="ltr">
            Missing <b>Blue</b>
          </span>
        </span>
      </a>

      <div className="v2-workspace">
        <span className="v2-workspace-icon" aria-hidden="true">
          <Icon name="chart" size={18} />
        </span>
        <span className="v2-workspace-text">
          <span className="v2-workspace-name">{t("workspace")}</span>
          <span className="v2-workspace-sub">{t("workspaceSub")}</span>
        </span>
      </div>

      <nav className="v2-nav" aria-label={t("navLabel")} ref={navRef}>
        {NAV.map((sec) => (
          <div className="v2-nav-sec" key={sec.id}>
            <h2 className="v2-nav-title" id={`v2-sec-${variant}-${sec.id}`}>
              {t(`sec.${sec.id}` as ShellV2Key)}
            </h2>
            <ul className="v2-nav-list" aria-labelledby={`v2-sec-${variant}-${sec.id}`}>
              {sec.items.map((item) => {
                const active = item.id === activeId;
                const n = item.countKey ? counts?.[item.countKey] : undefined;
                const hasCount = typeof n === "number" && Number.isFinite(n);
                return (
                  <li key={item.id}>
                    <a
                      className={`v2-nav-link${active ? " is-active" : ""}`}
                      href={href(item.to)}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                    >
                      <Icon name={item.icon} />
                      <span className="v2-nav-label">{t(`nav.${item.id}` as ShellV2Key)}</span>
                      {hasCount ? (
                        <span className="v2-count num" dir="ltr">
                          {fmt(n as number, 0)}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="v2-side-foot">
        {onAsk ? (
          <button type="button" className="v2-ask" onClick={() => (onNavigate?.(), onAsk())} title={t("askHint")}>
            <Icon name="sparkle" />
            <span>{t("ask")}</span>
          </button>
        ) : null}

        <p className="v2-data-until" title={t("dataUntilTip")}>
          <Icon name="check" size={18} />
          <span>{dataUntil ? t("dataUntil", { date: fmtDate(dataUntil, lang) }) : t("dataUntilUnknown")}</span>
        </p>

        <div className="v2-foot-row">
          <div className="v2-status-col">
            <span className={`v2-status ${online ? "is-ok" : "is-warn"}`} role="status" title={online ? t("onlineTip") : t("offlineTip")}>
              <span className="v2-dot" aria-hidden="true" />
              {online ? t("online") : t("offline")}
            </span>
            <span
              className={`v2-status ${aiState === "live" ? "is-ok" : aiState === "recorded" ? "is-rec" : "is-idle"}`}
              title={aiState === "live" ? t("aiLiveTip") : t("aiRecordedTip")}
            >
              <span className="v2-dot" aria-hidden="true" />
              {aiState === "live" ? t("aiLive") : aiState === "recorded" ? t("aiRecorded") : t("aiChecking")}
            </span>
          </div>
          <button type="button" className="v2-lang" onClick={toggleLang} aria-label={t("langSwitchLabel")} lang={lang === "ar" ? "en" : "ar"}>
            <Icon name="globe" size={16} />
            <span>{t("langSwitch")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
