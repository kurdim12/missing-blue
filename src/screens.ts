// Central screen registry. One entry per screen; each screen is ONE file in src/screens/<Name>.tsx
// (default export, props: ScreenProps). Screen agents edit only their own file; the shell reads this list.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Bi } from "./i18n";

export type ScreenProps = {
  /** Route params, e.g. { id: "W7" } for #/spot/W7 */
  params: Record<string, string>;
  /** Query string of the hash, e.g. ?lang=ar */
  query: URLSearchParams;
  /** True when rendered inside Demo mode (hide your own nav / big headers if useful). */
  embedded?: boolean;
};

export type Criterion = "impact" | "innovation" | "feasibility" | "technical" | "ux" | "pitch";

export type ScreenDef = {
  id: string;
  /** Hash route pattern, e.g. "/spot/:id" */
  route: string;
  /** Link used in the top nav (only for screens without params). */
  nav: boolean;
  title: Bi;
  /** Short label for the top nav. */
  short: Bi;
  /** Journey step from USER_JOURNEY.md */
  journey: Bi;
  criteria: Criterion[];
  /** "desktop" = top bar + content; "phone" = no top bar, phone layout (crew view). */
  chrome: "desktop" | "phone";
  /** "page" = padded scrolling page; "full" = edge-to-edge (maps). The screen controls its own inner layout. */
  layout: "page" | "full";
  component: LazyExoticComponent<ComponentType<ScreenProps>>;
};

export const SCREENS: ScreenDef[] = [
  {
    id: "problem",
    route: "/problem",
    nav: true,
    title: { en: "The problem", ar: "المشكلة" },
    short: { en: "Problem", ar: "المشكلة" },
    journey: { en: "Judges · 0:00 problem and who is left out", ar: "لجنة التحكيم · 0:00 المشكلة ومن يُستثنى" },
    criteria: ["impact", "pitch"],
    chrome: "desktop",
    layout: "page",
    component: lazy(() => import("./screens/Problem")),
  },
  {
    id: "overview",
    route: "/overview",
    nav: true,
    title: { en: "Overview: radar wet spots and the Karak pipe network", ar: "نظرة عامة: البقع الرطبة من الرادار وشبكة أنابيب الكرك" },
    short: { en: "Overview", ar: "نظرة عامة" },
    journey: { en: "Journey 1 · steps 2–3 (NRW engineer)", ar: "الرحلة 1 · الخطوتان 2–3 (مهندسة الفاقد)" },
    criteria: ["impact", "innovation"],
    chrome: "desktop",
    layout: "full",
    component: lazy(() => import("./screens/Overview")),
  },
  {
    id: "triage",
    route: "/triage",
    nav: true,
    title: { en: "AI triage", ar: "الفرز بالذكاء الاصطناعي" },
    short: { en: "AI triage", ar: "الفرز الذكي" },
    journey: { en: "Journey 1 · step 4 (NRW engineer)", ar: "الرحلة 1 · الخطوة 4 (مهندسة الفاقد)" },
    criteria: ["innovation", "technical"],
    chrome: "desktop",
    layout: "page",
    component: lazy(() => import("./screens/Triage")),
  },
  {
    id: "spot",
    route: "/spot/:id",
    nav: false,
    title: { en: "Wet spot detail", ar: "تفاصيل البقعة الرطبة" },
    short: { en: "Spot", ar: "البقعة" },
    journey: { en: "Journey 1 · step 5 (NRW engineer)", ar: "الرحلة 1 · الخطوة 5 (مهندسة الفاقد)" },
    criteria: ["technical"],
    chrome: "desktop",
    layout: "page",
    component: lazy(() => import("./screens/SpotDetail")),
  },
  {
    id: "twin",
    route: "/twin",
    nav: true,
    title: { en: "Hydraulic twin: Mazar zone", ar: "التوأم الهيدروليكي: منطقة المزار" },
    short: { en: "Twin", ar: "التوأم" },
    journey: { en: "Journey 1 · step 6 (NRW engineer)", ar: "الرحلة 1 · الخطوة 6 (مهندسة الفاقد)" },
    criteria: ["technical"],
    chrome: "desktop",
    layout: "full",
    component: lazy(() => import("./screens/Twin")),
  },
  {
    id: "records",
    route: "/records",
    nav: true,
    title: { en: "Network records: HydroFingerprint", ar: "سجلات الشبكة: HydroFingerprint" },
    short: { en: "Records", ar: "السجلات" },
    journey: { en: "Journey 3 (GIS records officer)", ar: "الرحلة 3 (مسؤول سجلات الشبكة)" },
    criteria: ["innovation", "technical"],
    chrome: "desktop",
    layout: "full",
    component: lazy(() => import("./screens/Records")),
  },
  {
    id: "workorder",
    route: "/workorder/:id",
    nav: false,
    title: { en: "Work order", ar: "أمر العمل" },
    short: { en: "Work order", ar: "أمر العمل" },
    journey: { en: "Journey 1 · step 7 (NRW engineer)", ar: "الرحلة 1 · الخطوة 7 (مهندسة الفاقد)" },
    criteria: ["ux", "innovation"],
    chrome: "desktop",
    layout: "page",
    component: lazy(() => import("./screens/WorkOrder")),
  },
  {
    id: "crew",
    route: "/crew/:id",
    nav: false,
    title: { en: "Crew view", ar: "شاشة الطاقم" },
    short: { en: "Crew", ar: "الطاقم" },
    journey: { en: "Journey 2 (field crew, phone)", ar: "الرحلة 2 (الطاقم الميداني، الهاتف)" },
    criteria: ["ux"],
    chrome: "phone",
    layout: "page",
    component: lazy(() => import("./screens/Crew")),
  },
  {
    id: "impact",
    route: "/impact",
    nav: true,
    title: { en: "Impact and business", ar: "الأثر ونموذج العمل" },
    short: { en: "Impact", ar: "الأثر" },
    journey: { en: "Judges · 5:00 feasibility and who pays", ar: "لجنة التحكيم · 5:00 الجدوى ومن يدفع" },
    criteria: ["feasibility", "impact"],
    chrome: "desktop",
    layout: "page",
    component: lazy(() => import("./screens/Impact")),
  },
  {
    id: "sources",
    route: "/sources",
    nav: true,
    title: { en: "Sources and method", ar: "المصادر والمنهجية" },
    short: { en: "Sources", ar: "المصادر" },
    journey: { en: "Judges · 6:10 sources, assumptions, limits", ar: "لجنة التحكيم · 6:10 المصادر والافتراضات والحدود" },
    criteria: ["technical"],
    chrome: "desktop",
    layout: "page",
    component: lazy(() => import("./screens/Sources")),
  },
  {
    id: "demo",
    route: "/demo",
    nav: true,
    title: { en: "Demo mode", ar: "وضع العرض" },
    short: { en: "Demo", ar: "العرض" },
    journey: { en: "Judges · the 7-minute pitch path", ar: "لجنة التحكيم · مسار العرض في 7 دقائق" },
    criteria: ["pitch"],
    chrome: "desktop",
    layout: "full",
    component: lazy(() => import("./screens/DemoMode")),
  },
];

export const DEFAULT_ROUTE = "/problem"; // the pitch starts here

export const screenById = (id: string) => SCREENS.find((s) => s.id === id);
