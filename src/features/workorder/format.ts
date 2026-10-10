// Labels for values that arrive in English from data/ (land-cover classes, pipe classes).
import type { Bi, Lang } from "../../i18n";
import { pipeClass } from "../../map/style";

const LAND: Record<string, Bi> = {
  "Built area": { en: "Built area", ar: "منطقة عمرانية" },
  Rangeland: { en: "Rangeland", ar: "أرض رعوية" },
  Crops: { en: "Crops", ar: "محاصيل" },
  "Bare ground": { en: "Bare ground", ar: "أرض جرداء" },
  Trees: { en: "Trees", ar: "أشجار" },
  Water: { en: "Water", ar: "مياه" },
};
export const landLabel = (c: string, lang: Lang) => LAND[c]?.[lang] ?? c;

/** "Built area" when all years agree, else "2023 Crops · 2024 Rangeland …" */
export function landSummary(byYear: Record<string, string>, lang: Lang) {
  const years = Object.keys(byYear).sort();
  const classes = years.map((y) => byYear[y]);
  const range = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0] ?? "";
  const same = classes.every((c) => c === classes[0]);
  return { range, text: same ? landLabel(classes[0] ?? "", lang) : years.map((y) => `${y} ${landLabel(byYear[y], lang)}`).join(" · ") };
}

export const pipeClassLabel = (k: string | null, lang: Lang) => (k ? pipeClass(k).label[lang] : "");
