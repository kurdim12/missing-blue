// Accessible tabs (WAI-ARIA tabs pattern): roving tabindex, arrow keys follow the reading direction (RTL aware),
// Home/End, automatic activation, optional count badges, underline active style.
//
//   const [tab, setTab] = useState("sites");
//   <Tabs idPrefix="sites" label={t("tabsLabel")} value={tab} onChange={setTab}
//         items={[{ id: "sites", label: t("sites"), count: spots.length }, { id: "reports", label: t("reports") }]} />
//   <TabPanel idPrefix="sites" id="sites" value={tab}>…</TabPanel>
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { fmt } from "../i18n";
import "../shell/shell-v2.css";

export type TabItem<Id extends string = string> = {
  id: Id;
  label: ReactNode;
  /** Count badge (from data). null/undefined = no badge. */
  count?: number | null;
  disabled?: boolean;
};

export type TabsProps<Id extends string = string> = {
  items: TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  /** Unique per page: builds the tab/panel ids (`${idPrefix}-tab-${id}`, `${idPrefix}-panel-${id}`). */
  idPrefix: string;
  /** Accessible name of the tab list. */
  label: string;
  size?: "md" | "sm";
  /** Stretch tabs to fill the width. */
  fill?: boolean;
  className?: string;
};

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function Tabs<Id extends string = string>({ items, value, onChange, idPrefix, label, size = "md", fill, className }: TabsProps<Id>) {
  const list = useRef<HTMLDivElement>(null);

  const focusTab = (id: Id) => {
    list.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(idPrefix, id))}`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    if (!enabled.length) return;
    const cur = Math.max(
      0,
      enabled.findIndex((i) => i.id === value),
    );
    const rtl = list.current ? getComputedStyle(list.current).direction === "rtl" : document.documentElement.dir === "rtl";
    let next = -1;
    switch (e.key) {
      case "ArrowRight":
        next = rtl ? cur - 1 : cur + 1;
        break;
      case "ArrowLeft":
        next = rtl ? cur + 1 : cur - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = enabled.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    next = (next + enabled.length) % enabled.length;
    const id = enabled[next].id;
    onChange(id);
    focusTab(id);
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={`mb-tabs mb-tabs-${size}${fill ? " mb-tabs-fill" : ""}${className ? ` ${className}` : ""}`}
      onKeyDown={onKeyDown}
    >
      {items.map((it) => {
        const selected = it.id === value;
        const hasCount = typeof it.count === "number" && Number.isFinite(it.count);
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, it.id)}
            aria-selected={selected}
            aria-controls={panelId(idPrefix, it.id)}
            tabIndex={selected ? 0 : -1}
            disabled={it.disabled}
            className={`mb-tab${selected ? " is-active" : ""}`}
            onClick={() => onChange(it.id)}
          >
            <span className="mb-tab-label">{it.label}</span>
            {hasCount ? (
              <span className="mb-tab-count num" dir="ltr">
                {fmt(it.count as number, 0)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The panel for one tab. Only the selected panel renders its children (others stay hidden and empty). */
export function TabPanel({ idPrefix, id, value, children, className }: { idPrefix: string; id: string; value: string; children: ReactNode; className?: string }) {
  const selected = id === value;
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      hidden={!selected}
      tabIndex={0}
      className={`mb-tabpanel${className ? ` ${className}` : ""}`}
    >
      {selected ? children : null}
    </div>
  );
}
