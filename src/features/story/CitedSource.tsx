// "Source: who, date · visible link" line for cited context figures (not files in data/).
import { fmtDate, useI18n } from "../../i18n";

export function CitedSource({ who, date, url }: { who: string; date?: string; url: string }) {
  const { lang, t } = useI18n();
  return (
    <p className="story-cite">
      <span className="story-cite-k">{t({ en: "Source", ar: "المصدر" })}:</span> {who}
      {date ? <>{lang === "ar" ? "، " : ", "}{fmtDate(date, lang)}</> : null}
      {" · "}
      <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" className="story-cite-link">
        {url.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    </p>
  );
}
