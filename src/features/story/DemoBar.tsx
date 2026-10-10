// Bottom bar of demo mode: step title, presenter cue, the 7:00 clock with the script's time marks, Prev/Next.
// Buttons never take focus (mousedown is prevented), so Space/arrows keep driving the demo after a click.
import type { MouseEvent } from "react";
import { useI18n, useT } from "../../i18n";
import { Tag } from "../../ui";
import type { DemoClock } from "./clock";
import { mmss, PITCH, PITCH_TOTAL } from "./pitch";
import { demoStrings } from "./strings";

const noFocus = (e: MouseEvent) => e.preventDefault();

export function DemoBar({
  idx,
  cue,
  cueOn,
  clock,
  onGo,
  onToggleCue,
  exitHref,
}: {
  idx: number;
  cue: string;
  cueOn: boolean;
  clock: DemoClock;
  onGo: (i: number) => void;
  onToggleCue: () => void;
  exitHref: string;
}) {
  const { t: tr } = useI18n();
  const t = useT(demoStrings);
  const step = PITCH[idx];
  const n = PITCH.length;
  const e = clock.elapsed;

  const status = !clock.started
    ? ["idle", t("notStarted")]
    : e > PITCH_TOTAL
      ? ["over", t("over")]
      : e > step.end + 3
        ? ["behind", t("behind")]
        : e < step.start - 3
          ? ["ahead", t("ahead")]
          : ["ok", t("onTime")];

  return (
    <nav className="story-bar no-print" aria-label={tr({ en: "Demo controls", ar: "أدوات العرض" })}>
      <div className="story-track" aria-hidden="true">
        {PITCH.map((s, i) => (
          <button
            key={s.id}
            type="button"
            tabIndex={-1}
            className={`story-track-seg${i === idx ? " is-current" : i < idx ? " is-done" : ""}`}
            style={{ flexGrow: s.end - s.start }}
            title={`${i + 1}. ${tr(s.title)} · ${mmss(s.start)}–${mmss(s.end)}`}
            onMouseDown={noFocus}
            onClick={() => onGo(i)}
          />
        ))}
        {clock.started ? <span className="story-track-head" style={{ insetInlineStart: `${Math.min(100, (e / PITCH_TOTAL) * 100)}%` }} /> : null}
      </div>

      <div className="story-bar-row">
        <button type="button" className="btn btn-secondary story-bar-prev" onMouseDown={noFocus} onClick={() => onGo(idx - 1)} disabled={idx === 0} aria-label={t("prev")}>
          <span aria-hidden="true">‹</span>
          <span className="story-bar-btn-label">{t("prev")}</span>
        </button>

        <div className="story-bar-info">
          <div className="story-bar-step">
            <span className="story-bar-count">{t("step", { i: String(idx + 1), n: String(n) })}</span>
            <b className="story-bar-title">{tr(step.title)}</b>
            <Tag tone="blue">{tr(step.criterion)}</Tag>
          </div>
          {cueOn ? (
            <p className="story-bar-cue" aria-live="polite">
              {cue}
            </p>
          ) : null}
        </div>

        <div className={`story-clock is-${status[0]}`}>
          <button
            type="button"
            className="story-clock-main"
            dir="ltr"
            onMouseDown={noFocus}
            onClick={() => (clock.started ? clock.toggle() : clock.startAt(step.start))}
            title={clock.running ? t("pause") : clock.started ? t("resume") : t("start")}
            aria-label={clock.running ? t("pause") : clock.started ? t("resume") : t("start")}
          >
            <span className="story-clock-icon" aria-hidden="true">
              {clock.running ? "❚❚" : "▶"}
            </span>
            <span className="story-clock-time num">
              {mmss(e)}
            </span>
            <span className="story-clock-of">
              / {mmss(PITCH_TOTAL)}
            </span>
          </button>
          <div className="story-clock-meta">
            <span className="story-clock-status">{status[1]}</span>
            <span className="faint">
              {t("window", { a: mmss(step.start), b: mmss(step.end) })}
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm story-clock-reset" onMouseDown={noFocus} onClick={clock.reset} title={t("reset")} aria-label={t("reset")}>
            ↺
          </button>
        </div>

        <div className="story-bar-tools">
          <button
            type="button"
            className={`btn btn-ghost btn-sm${cueOn ? " is-on" : ""}`}
            onMouseDown={noFocus}
            onClick={onToggleCue}
            aria-pressed={cueOn}
            title={cueOn ? t("cueHide") : t("cueShow")}
          >
            {t("cue")}
          </button>
          <a className="btn btn-ghost btn-sm" href={exitHref} title={t("exit")}>
            ↗<span className="sr-only">{t("exit")}</span>
          </a>
        </div>

        <button type="button" className="btn btn-primary story-bar-next" onMouseDown={noFocus} onClick={() => onGo(idx + 1)} disabled={idx === n - 1} aria-label={t("next")}>
          <span className="story-bar-btn-label">{t("next")}</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="story-bar-keys faint">{t("keys")}</p>
    </nav>
  );
}
