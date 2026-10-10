// Desktop top bar: brand, screen nav (from the registry), provenance legend, online indicator, AR/EN toggle.
import { useI18n, useT } from "../i18n";
import { shellStrings } from "../features/shell/strings";
import { SCREENS, type ScreenDef } from "../screens";
import { href } from "../router";
import { BrandMark } from "./BrandMark";
import { Badge } from "../ui";
import { useOnline } from "./useOnline";

export function TopBar({ active }: { active?: ScreenDef }) {
  const { t: tr, toggleLang } = useI18n();
  const t = useT(shellStrings);
  const online = useOnline();
  return (
    <header className="topbar">
      <a className="brand" href={href("/problem")} aria-label="Missing Blue · الأزرق المفقود">
        <BrandMark className="brand-mark" />
        <span className="brand-names">
          <span className="brand-en" lang="en" dir="ltr">
            Missing <b>Blue</b>
          </span>
          <span className="brand-sep" aria-hidden="true">
            ·
          </span>
          <span className="brand-ar" lang="ar" dir="rtl">
            الأزرق المفقود
          </span>
        </span>
      </a>

      <nav className="topnav" aria-label={t("nav")}>
        {SCREENS.filter((s) => s.nav).map((s) => (
          <a key={s.id} href={href(s.route)} className={`topnav-link${active?.id === s.id ? " is-active" : ""}`} aria-current={active?.id === s.id ? "page" : undefined}>
            {tr(s.short)}
          </a>
        ))}
      </nav>

      <div className="topbar-tools">
        <div className="legend" aria-label={t("legend")}>
          <Badge kind="REAL" size="sm" />
          <Badge kind="SIMULATED" size="sm" />
          <Badge kind="ASSUMED" size="sm" />
        </div>
        <span className={`netstat ${online ? "is-online" : "is-offline"}`} title={online ? t("onlineTip") : t("offlineTip")} role="status">
          <span className="netstat-dot" aria-hidden="true" />
          {online ? t("online") : t("offline")}
        </span>
        <button type="button" className="lang-toggle" onClick={toggleLang} aria-label={t("langSwitchLabel")}>
          {t("langSwitch")}
        </button>
      </div>
    </header>
  );
}
