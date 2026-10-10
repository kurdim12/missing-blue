// Screen "demo" (#/demo?step=N): the 7-minute pitch path of PITCH_7MIN.md. Each step renders the REAL screen from the
// registry (embedded) above a presenter bar with Prev/Next, the cue and the 7:00 clock. Keys: → PageDown Space next,
// ← PageUp Shift+Space previous, Home/End, C cue. One click (or key) per step. Works offline (all local).
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ScreenProps } from "../screens";
import { screenById } from "../screens";
import { useI18n, useT } from "../i18n";
import { href, navigate } from "../router";
import { Badge, Button, EmptyState, Spinner } from "../ui";
import { useDemoClock } from "../features/story/clock";
import { DemoBar } from "../features/story/DemoBar";
import { fill, storyVars, useStoryFacts, type StoryFacts } from "../features/story/facts";
import { NextStep } from "../features/story/NextStep";
import { PITCH, type PitchStep } from "../features/story/pitch";
import { demoStrings } from "../features/story/strings";
import "../features/story/story.css";
import { resetDemoReports } from "../features/workorder/store";

const CUE_KEY = "mb.demo.cue";
const readCue = () => {
  try {
    return localStorage.getItem(CUE_KEY) !== "0";
  } catch {
    return true;
  }
};

function isTextEntry(el: EventTarget | null) {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return false;
  if (e.isContentEditable) return true;
  const tag = e.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !["range", "checkbox", "radio", "button", "submit", "reset"].includes((e as HTMLInputElement).type);
  return false;
}

/** The real route of a step, for "open this screen". */
function realRoute(step: PitchStep, facts: StoryFacts): string {
  const params = step.params?.(facts) ?? {};
  if (step.screen === "crew-phone") return `/crew/${params.id}?lang=ar`;
  if (step.screen === "next") return "/impact";
  const def = screenById(step.screen);
  if (!def) return "/problem";
  return def.route.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));
}

class StepBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

function EmbeddedScreen({ step, facts }: { step: PitchStep; facts: StoryFacts }) {
  const t = useT(demoStrings);
  const def = screenById(step.screen);
  const params = useMemo(() => step.params?.(facts) ?? {}, [step, facts]);
  const query = useMemo(() => new URLSearchParams({ demo: "1", ...(step.query ?? {}) }), [step]);
  if (!def) return null;
  const Screen = def.component;
  return (
    <StepBoundary key={step.screen} fallback={<EmptyState title={t("stepFailed")} />}>
      <Suspense
        fallback={
          <div className="screen-loading">
            <Spinner />
          </div>
        }
      >
        <Screen params={params} query={query} embedded />
      </Suspense>
    </StepBoundary>
  );
}

function CrewPhone({ facts, onFrame }: { facts: StoryFacts; onFrame: (w: Window | null) => void }) {
  const { t: tr } = useI18n();
  const t = useT(demoStrings);
  const id = facts.lead?.spot_id ?? "W7";
  const src = `${window.location.pathname}${window.location.search}#/crew/${encodeURIComponent(id)}?lang=ar`;
  return (
    <div className="story-crew">
      <div className="story-phone">
        <iframe
          className="story-phone-frame"
          src={src}
          title={t("crewPhone")}
          onLoad={(e) => onFrame((e.currentTarget as HTMLIFrameElement).contentWindow)}
        />
      </div>
      <div className="story-crew-side">
        <h2 className="story-crew-h">{t("crewPhone")}</h2>
        <p className="muted">{t("crewNote")}</p>
        <div className="badge-row">
          <Badge kind="REAL" size="sm" label={tr({ en: "spot and pipe", ar: "البقعة والأنبوب" })} />
        </div>
        <div>
          <Button href={href(`/workorder/${encodeURIComponent(id)}`)}>{t("workorder")} · {id}</Button>
        </div>
      </div>
    </div>
  );
}

function Closing({ facts }: { facts: StoryFacts }) {
  return (
    <div className="story-closing">
      <div className="story-closing-brand" aria-hidden="true">
        <span lang="en" dir="ltr">
          Missing <b>Blue</b>
        </span>
        <span lang="ar" dir="rtl">
          الأزرق المفقود
        </span>
      </div>
      <NextStep facts={facts} big thanks />
    </div>
  );
}

export default function DemoMode({ query }: ScreenProps) {
  const { lang } = useI18n();
  const facts = useStoryFacts();
  const clock = useDemoClock();
  const n = PITCH.length;
  const raw = Number(query.get("step") ?? "1");
  const idx = Math.min(n - 1, Math.max(0, Number.isFinite(raw) ? Math.round(raw) - 1 : 0));
  const step = PITCH[idx];
  const [cueOn, setCueOn] = useState(readCue);

  // A rehearsal tap on "Leak found" in the embedded crew phone must not show up in the live demo:
  // demo reports (order status, crew reports) are cleared when Demo mode opens and when it returns to step 1.
  useEffect(() => {
    if (idx === 0) resetDemoReports();
  }, [idx]);
  useEffect(() => {
    resetDemoReports();
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameWin = useRef<Window | null>(null);

  const go = useCallback(
    (i: number) => {
      const j = Math.min(n - 1, Math.max(0, i));
      if (j === idx) return;
      // forgot to start the clock: start it at the scheduled mark of the step we enter
      if (!clock.started) clock.startAt(PITCH[j].start);
      navigate(`/demo?step=${j + 1}`);
    },
    [idx, n, clock],
  );

  const toggleCue = useCallback(() => {
    setCueOn((c) => {
      try {
        localStorage.setItem(CUE_KEY, c ? "0" : "1");
      } catch {
        /* storage blocked */
      }
      return !c;
    });
  }, []);

  // Keyboard: one stable listener (window + the crew iframe) that calls the latest handler.
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  handler.current = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTextEntry(e.target)) return;
    let act: (() => void) | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        act = () => go(idx + 1);
        break;
      case "ArrowLeft":
      case "PageUp":
        act = () => go(idx - 1);
        break;
      case " ":
      case "Spacebar":
        act = () => go(e.shiftKey ? idx - 1 : idx + 1);
        break;
      case "Home":
        act = () => go(0);
        break;
      case "End":
        act = () => go(n - 1);
        break;
      case "c":
      case "C":
        act = toggleCue;
        break;
    }
    if (!act) return;
    e.preventDefault(); // also stops Space from "clicking" a focused button in the screen
    e.stopPropagation(); // and stops a focused map from panning
    if (!e.repeat) act();
  };

  const keyListeners = useMemo(
    () => ({
      down: (e: KeyboardEvent) => handler.current(e),
      up: (e: KeyboardEvent) => {
        if ((e.key === " " || e.key === "Spacebar") && !e.ctrlKey && !e.metaKey && !e.altKey && !isTextEntry(e.target)) e.preventDefault();
      },
    }),
    [],
  );

  useEffect(() => {
    const { down, up } = keyListeners;
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      try {
        frameWin.current?.removeEventListener("keydown", down, true);
        frameWin.current?.removeEventListener("keyup", up, true);
      } catch {
        /* frame gone */
      }
    };
  }, [keyListeners]);

  // The crew phone is an iframe (its own Arabic document): forward its keys to the same handler.
  const onFrame = useCallback(
    (w: Window | null) => {
      const { down, up } = keyListeners;
      try {
        frameWin.current?.removeEventListener("keydown", down, true);
        frameWin.current?.removeEventListener("keyup", up, true);
        w?.addEventListener("keydown", down, true);
        w?.addEventListener("keyup", up, true);
      } catch {
        /* not reachable: keys work again once focus is back on the page */
      }
      frameWin.current = w;
    },
    [keyListeners],
  );

  // New screen: start at the top of the stage (same screen, e.g. overview radar -> pipes: keep the view).
  const prevScreen = useRef(step.screen);
  useEffect(() => {
    if (prevScreen.current !== step.screen) stageRef.current?.scrollTo({ top: 0 });
    prevScreen.current = step.screen;
  }, [step.screen]);

  const vars = storyVars(facts, lang);
  const def = screenById(step.screen);
  const kind = step.screen === "crew-phone" || step.screen === "next" ? "custom" : def?.layout === "full" ? "full" : "page";

  return (
    <div className="story-demo">
      <div ref={stageRef} className={`story-demo-stage is-${kind}`}>
        {step.screen === "crew-phone" ? (
          <CrewPhone facts={facts} onFrame={onFrame} />
        ) : step.screen === "next" ? (
          <Closing facts={facts} />
        ) : (
          <EmbeddedScreen step={step} facts={facts} />
        )}
      </div>
      <DemoBar
        idx={idx}
        cue={fill(step.cue[lang], vars)}
        cueOn={cueOn}
        clock={clock}
        onGo={go}
        onToggleCue={toggleCue}
        exitHref={href(realRoute(step, facts))}
      />
    </div>
  );
}
