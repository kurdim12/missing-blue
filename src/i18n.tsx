// Language context (AR/EN with full RTL) + number/date helpers.
// Strings live next to each feature: src/features/<name>/strings.ts -> defineStrings({ en: {...}, ar: {...} }).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";
export type Dir = "ltr" | "rtl";
export type Bi = { en: string; ar: string };

const KEY = "mb.lang";

function initialLang(): Lang {
  // #/crew/W7?lang=ar overrides the stored choice (used by the QR code)
  const q = new URLSearchParams(window.location.hash.split("?")[1] || "").get("lang");
  if (q === "ar" || q === "en") return q;
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ar" || v === "en") return v;
  } catch {
    /* storage blocked */
  }
  return "en";
}

type Ctx = {
  lang: Lang;
  dir: Dir;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  /** Inline bilingual text: t({ en: "Map", ar: "الخريطة" }) */
  t: (s: Bi) => string;
};

const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir: Dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* storage blocked */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, dir, setLang, toggleLang: () => setLang(lang === "ar" ? "en" : "ar"), t: (s) => s[lang] }),
    [lang, dir, setLang],
  );
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18n);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}

/** Declare a feature's strings; `ar` must have exactly the keys of `en`. */
export function defineStrings<const T extends Record<string, string>>(s: { en: T; ar: { [K in keyof T]: string } }) {
  return s;
}

/**
 * const t = useT(strings);  t("title");  t("km", { n: fmt(1286.6, 0) })
 * Placeholders are written {name} in both languages.
 */
export function useT<T extends Record<string, string>>(s: { en: T; ar: { [K in keyof T]: string } }) {
  const { lang } = useI18n();
  return useCallback(
    (key: keyof T & string, vars?: Record<string, string | number>) => {
      let out: string = (s[lang] as Record<string, string>)[key] ?? (s.en as Record<string, string>)[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
      return out;
    },
    [lang, s],
  );
}

// ------------------------------------------------------------------ numbers, units, dates
// Latin digits everywhere (both languages), en-GB grouping: 1,286.6

const nfCache = new Map<string, Intl.NumberFormat>();
/** fmt(1286.6) -> "1,286.6"; fmt(2.444, 2) -> "2.44"; fmt(0.5, 1, 1) -> "0.5" */
export function fmt(n: number | null | undefined, maxDigits = 1, minDigits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const k = `${maxDigits}:${minDigits}`;
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat("en-GB", { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits });
    nfCache.set(k, f);
  }
  return f.format(n);
}

/** Signed: fmtSigned(2.44, 2) -> "+2.44" */
export const fmtSigned = (n: number, maxDigits = 1, minDigits = 0) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), maxDigits, minDigits);

/** Unit labels per language. Add units here, not inline. */
export const UNITS: Record<string, Bi> = {
  m: { en: "m", ar: "م" },
  km: { en: "km", ar: "كم" },
  mm: { en: "mm", ar: "مم" },
  m2: { en: "m²", ar: "م²" },
  m3: { en: "m³", ar: "م³" },
  "m3/day": { en: "m³/day", ar: "م³/يوم" },
  "m3/year": { en: "m³/year", ar: "م³/سنة" },
  "L/s": { en: "L/s", ar: "لتر/ث" },
  dB: { en: "dB", ar: "dB" },
  in: { en: '"', ar: " إنش" },
  bits: { en: "bits", ar: "بت" },
  days: { en: "days", ar: "يومًا" },
  "%": { en: "%", ar: "٪" },
};
export const unit = (u: string, lang: Lang) => UNITS[u]?.[lang] ?? u;

/** withUnit(6, "m", "ar") -> "6 م"; percent and inches attach without a space */
export function withUnit(n: number | null | undefined, u: string, lang: Lang, maxDigits = 1, minDigits = 0) {
  const s = fmt(n, maxDigits, minDigits);
  const ul = unit(u, lang);
  return u === "%" || (u === "in" && lang === "en") ? `${s}${ul}` : `${s} ${ul}`;
}

/** Position uncertainty: pm(50, "m", lang) -> "±50 m" / "±50 م" */
export const pm = (n: number, u: string, lang: Lang, maxDigits = 0) => `±${withUnit(n, u, lang, maxDigits)}`;

/** en-GB dates in English ("16 Sep 2026"); Levantine month names with Latin digits in Arabic ("16 أيلول 2026"). */
export function fmtDate(iso: string, lang: Lang, month: "short" | "long" = lang === "ar" ? "long" : "short") {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const loc = lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  const s = new Intl.DateTimeFormat(loc, { day: "numeric", month, year: "numeric", timeZone: "UTC" }).format(d);
  // newer ICU writes en-GB September as "Sept"; keep the three-letter form used everywhere else ("16 Sep 2026")
  return lang === "en" && month === "short" ? s.replace(/\bSept\b/, "Sep") : s;
}
