// App shell: hash router over the registry in src/screens.ts. Screens never edit this file.
import { Component, Suspense, useEffect, type ReactNode } from "react";
import { I18nProvider, useI18n, useT } from "./i18n";
import { shellStrings } from "./features/shell/strings";
import { DEFAULT_ROUTE, SCREENS } from "./screens";
import { match, navigate, useHashRoute } from "./router";
import { TopBar } from "./shell/TopBar";
import { EmptyState, Spinner } from "./ui";

function Shell() {
  const route = useHashRoute();
  const { t: tr } = useI18n();
  const t = useT(shellStrings);

  let found: { def: (typeof SCREENS)[number]; params: Record<string, string> } | null = null;
  for (const def of SCREENS) {
    const params = match(def.route, route.path);
    if (params) {
      found = { def, params };
      break;
    }
  }

  useEffect(() => {
    if (route.path === "/" || route.path === "") navigate(DEFAULT_ROUTE);
  }, [route.path]);

  useEffect(() => {
    document.title = found ? `${tr(found.def.short)} · Missing Blue` : "Missing Blue · Karak";
  }, [found?.def.id, tr]);

  const Screen = found?.def.component;
  const body = Screen ? (
    <ErrorBoundary key={route.path}>
      <Suspense fallback={<div className="screen-loading"><Spinner /></div>}>
        <Screen params={found!.params} query={route.query} />
      </Suspense>
    </ErrorBoundary>
  ) : route.path === "/" ? null : (
    <EmptyState title={t("notFound")} body={t("notFoundBody")} />
  );

  if (found?.def.chrome === "phone") return <div className="app app-phone">{body}</div>;

  return (
    <div className="app">
      <TopBar active={found?.def} />
      <main className={`app-main layout-${found?.def.layout ?? "page"}`} id="main">
        {body}
      </main>
    </div>
  );
}

/** A crashing screen must not take the shell (and the demo) down. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="empty empty-error" role="alert">
          <h3 className="empty-title">This screen failed to render · تعذّر عرض هذه الشاشة</h3>
          <p className="empty-body mono" dir="ltr">
            {String(this.state.error.message)}
          </p>
        </div>
      );
    return this.props.children;
  }
}

export default function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}
