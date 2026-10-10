// The demo path, in the exact order and with the time marks of PITCH_7MIN.md (script table).
// Cues are short presenter lines from the script; figures in them are {placeholders} filled from data/ (facts.ts).
import type { Bi } from "../../i18n";
import type { StoryFacts } from "./facts";

export type PitchStep = {
  id: string;
  /** Registry screen id rendered in the stage, or "crew-phone" / "next" (rendered by the demo itself). */
  screen: string;
  params?: (f: StoryFacts) => Record<string, string>;
  /** Hints passed to the embedded screen as its query (screens may ignore them). */
  query?: Record<string, string>;
  /** Script time marks in seconds */
  start: number;
  end: number;
  title: Bi;
  criterion: Bi;
  cue: Bi;
};

const lead = (f: StoryFacts) => ({ id: f.lead?.spot_id ?? "W7" });

export const PITCH_TOTAL = 420; // 7:00, the official limit

export const PITCH: PitchStep[] = [
  {
    id: "problem",
    screen: "problem",
    start: 0,
    end: 40,
    title: { en: "The problem", ar: "المشكلة" },
    criterion: { en: "Impact", ar: "الأثر" },
    cue: {
      en: "{nrw} of the water Jordan pumps is non-revenue (Petra, Aug 2026). Most leaks never surface; crews walk the pipes street by street. The government's AI project works from sensor data: a town without sensors gets nothing. That's who we built for.",
      ar: "{nrw} من المياه التي يضخها الأردن غير مدرّة للدخل (بترا، آب 2026). معظم التسربات لا تظهر، والطواقم تمشي على الأنابيب شارعًا شارعًا. مشروع الحكومة يعمل على بيانات الحساسات: والبلدة التي بلا حساسات لا تستفيد. لهؤلاء بنينا.",
    },
  },
  {
    id: "honesty",
    screen: "problem",
    query: { focus: "honesty" },
    start: 40,
    end: 60,
    title: { en: "One line, and what is real", ar: "سطر واحد، وما الحقيقي" },
    criterion: { en: "Technical honesty", ar: "الأمانة التقنية" },
    cue: {
      en: "One line: free NASA radar finds ground that stays wet in the dry season, we check it against the utility's own pipe map, and AI decides where the crew goes. All real public data, except pressure readings: simulated, and we'll say so.",
      ar: "سطر واحد: رادار ناسا المجاني يرصد أرضًا تبقى رطبة في موسم الجفاف، نطابقها مع خريطة أنابيب شركة المياه، والذكاء الاصطناعي يقرر إلى أين يذهب الطاقم. كلها بيانات عامة حقيقية، إلا قراءات الضغط: محاكاة، وسنقول ذلك.",
    },
  },
  {
    id: "radar",
    screen: "overview",
    query: { view: "radar" },
    start: 60,
    end: 100,
    title: { en: "Overview: radar time-lapse", ar: "نظرة عامة: تتابع صور الرادار" },
    criterion: { en: "Innovation", ar: "الابتكار" },
    cue: {
      en: "NISAR, NASA–ISRO, public since July 2026. Karak, {dates}. Wet, then still wet, with {rain} of rain between passes. {n} spots.",
      ar: "NISAR من ناسا وإسرو، متاح للعموم منذ تموز 2026. الكرك، {dates}. رطبة، ثم ما زالت رطبة، مع {rain} من المطر بين المرورات. {n} بقع.",
    },
  },
  {
    id: "pipes",
    screen: "overview",
    query: { view: "pipes" },
    start: 100,
    end: 120,
    title: { en: "Overview: the real pipes", ar: "نظرة عامة: الأنابيب الحقيقية" },
    criterion: { en: "Impact", ar: "الأثر" },
    cue: {
      en: "This is the real Karak network, {km}. It lands on the built-up areas without any adjustment.",
      ar: "هذه شبكة الكرك الحقيقية، {km}. تنطبق على المناطق المبنية دون أي تعديل.",
    },
  },
  {
    id: "triage",
    screen: "triage",
    start: 120,
    end: 160,
    title: { en: "AI triage", ar: "الفرز بالذكاء الاصطناعي" },
    criterion: { en: "Innovation · Technical", ar: "الابتكار · التنفيذ التقني" },
    cue: {
      en: "The AI checks each spot with tools: nearest pipe, land cover, leak simulation. It keeps {nGo} and rejects {nNo} farmland spots, and explains every decision. {lead} is {leadM} from a {leadPipe} line; the radar position is good to {acc}.",
      ar: "يفحص الذكاء الاصطناعي كل بقعة بأدوات: أقرب أنبوب، الغطاء الأرضي، محاكاة التسرب. يُبقي {nGo} ويرفض {nNo} بقع زراعية، ويشرح كل قرار. {lead} على بعد {leadM} من خط {leadPipe}، بهامش {acc}.",
    },
  },
  {
    id: "twin",
    screen: "twin",
    query: { scenario: "svc1" },
    start: 160,
    end: 190,
    title: { en: "Hydraulic twin", ar: "التوأم الهيدروليكي" },
    criterion: { en: "Technical", ar: "التنفيذ التقني" },
    cue: {
      en: "Why not just pressure loggers? In our twin of the Mazar zone, a {leak} leak at {lead} moves pressure at only {nSvc} other junction. A main break moves {nFar} of {nJ}. Loggers catch big breaks; the satellite catches the hidden ones. Demand is ASSUMED.",
      ar: "لماذا لا نكتفي بأجهزة تسجيل الضغط؟ في توأم منطقة المزار، تسرب {leak} عند {lead} يحرّك الضغط في {nSvc} عقدة أخرى فقط. وكسر في خط رئيسي يحرّك {nFar} من {nJ}. الأجهزة تلتقط الكسور الكبيرة؛ والقمر الصناعي يلتقط المخفية. الطلب مفترض.",
    },
  },
  {
    id: "records",
    screen: "records",
    start: 190,
    end: 260,
    title: { en: "HydroFingerprint: fixing the pipe map", ar: "HydroFingerprint: إصلاح خريطة الأنابيب" },
    criterion: { en: "Innovation · Technical", ar: "الابتكار · التنفيذ التقني" },
    cue: {
      en: "The pipe map has {gaps} gaps. Trained on {sims} simulations of the real network. Invite a judge: 'AI: place next logger'. Gaps A–D go near-certain, Gap E stays 'can't tell'. Versus a plain algorithm: {ai} vs {alg} all five right; {aiS} vs {algS} on a mismatched network. Readings are SIMULATED.",
      ar: "خريطة الأنابيب فيها {gaps} فجوة. دُرّب على {sims} محاكاة للشبكة الحقيقية. ادعُ أحد المحكّمين: «الذكاء الاصطناعي: ضع الجهاز التالي». الفجوات A–D تقترب من اليقين، وE تبقى «لا يمكن الجزم». مقابل خوارزمية عادية: {ai} مقابل {alg} للخمس كلها؛ و{aiS} مقابل {algS} على شبكة غير مطابقة. القراءات محاكاة.",
    },
  },
  {
    id: "crew",
    screen: "crew-phone",
    params: lead,
    start: 260,
    end: 300,
    title: { en: "Work order and crew phone", ar: "أمر العمل وهاتف الطاقم" },
    criterion: { en: "User experience", ar: "تجربة المستخدم" },
    cue: {
      en: "Hold up the phone. The crew gets this in Arabic: pin, {acc} search circle, the pipe to walk, a checklist, and two buttons: leak found, no leak.",
      ar: "ارفع الهاتف. يصل هذا إلى الطاقم بالعربية: دبوس، ودائرة بحث {acc}، والأنبوب الذي يُمشى عليه، وقائمة فحص، وزرّان: وُجد تسرب، لا تسرب.",
    },
  },
  {
    id: "impact",
    screen: "impact",
    start: 300,
    end: 370,
    title: { en: "Impact and business", ar: "الأثر ونموذج العمل" },
    criterion: { en: "Feasibility · business", ar: "الجدوى · نموذج العمل" },
    cue: {
      en: "Data cost: zero, every {days}, all of Jordan. No sensors needed to start. One hidden {leak} leak is {perDay}, {perYear} (leak size ASSUMED). Here the crew checks {nGo} sites instead of {km}. Who pays: the utility, per governorate; a pilot partner first. That's our PLAN, not a signed deal.",
      ar: "تكلفة البيانات: صفر، كل {days}، الأردن كله. لا حاجة إلى حساسات للبدء. تسرب مخفي واحد بحجم {leak} يعني {perDay}، و{perYear} (حجم التسرب مفترض). هنا يفحص الطاقم {nGo} مواقع بدل {km}. من يدفع: شركة المياه، لكل محافظة؛ وأولًا شريك تجريبي. هذه خطتنا، لا اتفاق موقَّع.",
    },
  },
  {
    id: "sources",
    screen: "sources",
    start: 370,
    end: 410,
    title: { en: "Sources and method", ar: "المصادر والمنهجية" },
    criterion: { en: "Technical honesty", ar: "الأمانة التقنية" },
    cue: {
      en: "Every number has a source you can open. What's real, what's simulated, what's assumed, and our limits: these are candidates, not confirmed leaks.",
      ar: "لكل رقم مصدر يمكنكم فتحه. ما الحقيقي، وما المحاكى، وما المفترض، وحدودنا: هذه مرشحات، لا تسربات مؤكدة.",
    },
  },
  {
    id: "next",
    screen: "next",
    start: 410,
    end: 420,
    title: { en: "Next step", ar: "الخطوة التالية" },
    criterion: { en: "Pitch", ar: "العرض" },
    cue: {
      en: "Next: one pilot in Karak. A crew checks {ids}. Those results become the first labels the system learns from. Thank you.",
      ar: "التالي: مشروع تجريبي واحد في الكرك. يفحص طاقم {ids}. تصبح تلك النتائج أولى العلامات التي يتعلم منها النظام. شكرًا لكم.",
    },
  },
];

/** "1:40" */
export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
