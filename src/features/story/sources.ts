// Source registry for the story screens (Problem, Impact, Sources, Demo).
// Context figures that are NOT in data/ (they are cited from public sources, see SOURCES.md) live here, each with its
// link, so a screen never shows such a figure without its source. Everything else is loaded from data/ via the API.
import type { Bi } from "../../i18n";
import type { Provenance } from "../../types";

export type SourceLink = { label: string; url: string };

/** Cited context figures (SOURCES.md, verified 10 Oct 2026). Not data/: show them with their source link. */
export const CITED = {
  nrw: {
    value: 41,
    unit: "%",
    date: "2026-08-24",
    who: { en: "Minister of Water and Irrigation, Petra news agency", ar: "وزير المياه والري، وكالة الأنباء الأردنية (بترا)" },
    url: "https://www.petra.gov.jo/en/news/water-loss-cut-to-41-exceeding-target",
  },
  nrwTarget: {
    value: 25,
    unit: "%",
    year: 2040,
    who: { en: "National Water Strategy 2023–2040", ar: "الاستراتيجية الوطنية للمياه 2023–2040" },
    url: "https://www.petra.gov.jo/en/news/water-loss-cut-to-41-exceeding-target",
  },
  repeatDays: {
    value: 12,
    who: { en: "NASA JPL, NISAR mission overview", ar: "مختبر الدفع النفاث في ناسا، نظرة عامة على مهمة NISAR" },
    url: "https://www.jpl.nasa.gov/press-kits/nisar/mission-overview",
  },
  nisarPublic: {
    date: "2026-07-20",
    who: { en: "ASF DAAC notice: NISAR L-band data now publicly available", ar: "إشعار ASF DAAC: بيانات NISAR متاحة للعموم" },
    url: "https://asf.alaska.edu/notices/nisar-l-band-data-now-publicly-available/",
  },
  govAi: {
    who: { en: "MENA Startup Digest (context)", ar: "MENA Startup Digest (سياق)" },
    url: "https://menastartupdigest.com/?p=47589",
  },
} as const;

/**
 * ASSUMED leak size used only when the twin file is held back (fresh clone). When data/twin is present the size is
 * read from the twin's leak scenario (`/api/twin/mazar?scenario=svc1` → leak_lps). Always shown with an ASSUMED badge.
 */
export const ASSUMED_LEAK_LPS_FALLBACK = 1;

/** Unit conversions (not data): 1 L/s for one day, litres per cubic metre, days per year. */
export const SECONDS_PER_DAY = 86_400;
export const LITRES_PER_M3 = 1_000;
export const DAYS_PER_YEAR = 365;

/** The twin's leak scenarios; leak sizes are encoded in the scenario keys (svc1 = 1 L/s, far15 = 15 L/s), as the server does. */
export const TWIN_SCENARIO_KEYS = ["svc1", "m5", "m15", "far15"] as const;
export const leakOfScenario = (k: string) => Number(k.replace(/\D/g, ""));

/** Wet-pixel rule, as written in the band description of data/radar/persistent_wet_mask.tif (pipeline/nisar_export.py). */
export const RADAR_RULE = "HH ≥ +2 dB & HV ≥ +1.5 dB";

export type DatasetRow = {
  id: string;
  name: Bi;
  /** What we use it for */
  use: Bi;
  links: SourceLink[];
  licence: Bi;
  kind: Provenance | "CONTEXT";
  /** data/ file that holds it (if any) */
  file?: string;
};

/** Every dataset and cited claim, from SOURCES.md. */
export const DATASETS: DatasetRow[] = [
  {
    id: "nisar",
    name: { en: "NISAR L2 GCOV radar, track 151, frame 73", ar: "رادار NISAR من المستوى L2 GCOV، المسار 151، الإطار 73" },
    use: { en: "Wet-spot detection: change versus the first pass, HH and HV channels", ar: "رصد البقع الرطبة: التغيّر مقارنة بالمرور الأول، في القناتين HH وHV" },
    links: [
      { label: "asf.alaska.edu", url: "https://asf.alaska.edu/notices/nisar-l-band-data-now-publicly-available/" },
      { label: "search.asf.alaska.edu", url: "https://search.asf.alaska.edu" },
    ],
    licence: { en: "NASA open data, marked PROVISIONAL", ar: "بيانات ناسا المفتوحة، موسومة بأنها أولية (PROVISIONAL)" },
    kind: "REAL",
    file: "data/wet_spots/wet_spots.geojson",
  },
  {
    id: "pipes",
    name: { en: "Karak water network (ArcGIS layer 6)", ar: "شبكة مياه الكرك (طبقة ArcGIS رقم 6)" },
    use: {
      en: "The pipe each wet spot is checked against; geometry of the hydraulic twin. Fetched from the owner's public service, not redistributed. The customers layer is never loaded.",
      ar: "الأنبوب الذي تُطابَق معه كل بقعة رطبة، وهندسة التوأم الهيدروليكي. نجلبها من خدمة المالك العامة ولا نعيد توزيعها. لا نحمّل طبقة المشتركين أبدًا.",
    },
    links: [{ label: "arcgis.com item 7f8adf3a…", url: "https://www.arcgis.com/home/item.html?id=7f8adf3ae966453f8cec976d9c35ef48" }],
    licence: {
      en: "Public, no licence stated; publisher \"AJI Group\" unconfirmed",
      ar: "عامة، دون ترخيص معلن؛ والناشر \"AJI Group\" غير مؤكد",
    },
    kind: "REAL",
    file: "data/pipes/karak_pipes.geojson",
  },
  {
    id: "dem",
    name: { en: "Copernicus DEM GLO-30", ar: "نموذج الارتفاعات Copernicus DEM GLO-30" },
    use: { en: "Junction elevations in the hydraulic twin", ar: "ارتفاعات العُقد في التوأم الهيدروليكي" },
    links: [{ label: "registry.opendata.aws", url: "https://registry.opendata.aws/copernicus-dem/" }],
    licence: {
      en: "Copernicus DEM licence; © DLR/Airbus provided under COPERNICUS",
      ar: "ترخيص Copernicus DEM؛ © DLR/Airbus مقدَّم ضمن برنامج COPERNICUS",
    },
    kind: "REAL",
    file: "data/elevation/copernicus_dem30_karak.tif",
  },
  {
    id: "rain",
    name: { en: "Rain between the radar passes (ERA5 via Open-Meteo)", ar: "الأمطار بين مرورات الرادار (ERA5 عبر Open-Meteo)" },
    use: { en: "Rules out rain as the cause of the wet ground", ar: "يستبعد المطر سببًا لرطوبة الأرض" },
    links: [{ label: "open-meteo.com", url: "https://open-meteo.com/en/docs/historical-weather-api" }],
    licence: { en: "CC BY 4.0", ar: "CC BY 4.0" },
    kind: "REAL",
    file: "data/wet_spots/wet_spots.geojson",
  },
  {
    id: "landcover",
    name: { en: "Land cover at the spots, 2023–2025 (Sentinel-2 10 m)", ar: "الغطاء الأرضي عند البقع، 2023–2025 (Sentinel-2 بدقة 10 م)" },
    use: { en: "Built area versus cropland or rangeland around each spot", ar: "منطقة مبنية أم أرض زراعية أم مراعٍ حول كل بقعة" },
    links: [{ label: "Living Atlas ImageServer", url: "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer" }],
    licence: { en: "Impact Observatory / Microsoft / Esri, Living Atlas terms", ar: "Impact Observatory / Microsoft / Esri، بشروط Living Atlas" },
    kind: "REAL",
    file: "data/wet_spots/wet_spots.geojson",
  },
  {
    id: "nrw41",
    name: { en: "Non-revenue water 41% (Aug 2026), target 25% by 2040", ar: "المياه غير المدرّة للدخل 41٪ (آب 2026)، والهدف 25٪ بحلول 2040" },
    use: { en: "The problem statement", ar: "تعريف المشكلة" },
    links: [{ label: "petra.gov.jo", url: "https://www.petra.gov.jo/en/news/water-loss-cut-to-41-exceeding-target" }],
    licence: { en: "Verified news source", ar: "مصدر إخباري موثَّق" },
    kind: "CONTEXT",
  },
  {
    id: "nws",
    name: { en: "Non-revenue water about 50% (2020): National Water Strategy 2023–2040", ar: "المياه غير المدرّة للدخل نحو 50٪ (2020): الاستراتيجية الوطنية للمياه 2023–2040" },
    use: { en: "Trend context", ar: "سياق الاتجاه" },
    links: [
      {
        label: "agwkp.unescwa.org (PDF)",
        url: "https://agwkp.unescwa.org/sites/default/files/2023-10/National_Water_Strategy_2023-2040_Summary-English_-ver2-%20Jordan.pdf",
      },
    ],
    licence: { en: "Verified", ar: "موثَّق" },
    kind: "CONTEXT",
  },
  {
    id: "lband",
    name: { en: "NISAR L-band, 24 cm wavelength", ar: "النطاق L في NISAR، طول موجي 24 سم" },
    use: {
      en: "Why L-band: it responds to soil moisture and penetrates vegetation deeper than C/X-band (it does not see through pavement)",
      ar: "لماذا النطاق L: يستجيب لرطوبة التربة ويخترق الغطاء النباتي أعمق من النطاقين C وX (ولا يرى عبر الأسفلت)",
    },
    links: [{ label: "science.nasa.gov", url: "https://science.nasa.gov/mission/nisar/" }],
    licence: { en: "Verified", ar: "موثَّق" },
    kind: "CONTEXT",
  },
  {
    id: "repeat",
    name: { en: "NISAR 12-day repeat orbit", ar: "مدار NISAR المتكرر كل 12 يومًا" },
    use: { en: "How often a new pass arrives", ar: "كم مرة يصل مرور جديد" },
    links: [{ label: "jpl.nasa.gov", url: "https://www.jpl.nasa.gov/press-kits/nisar/mission-overview" }],
    licence: { en: "Verified", ar: "موثَّق" },
    kind: "CONTEXT",
  },
  {
    id: "gcov",
    name: { en: "GCOV posting 10 or 20 m by mode (ours: 20 m)", ar: "دقة منتج GCOV ‏10 أو 20 م حسب النمط (لدينا 20 م)" },
    // {acc} is filled from the spot file's position_accuracy_m
    use: { en: "Why the position is only about {acc}", ar: "لماذا دقة الموقع نحو {acc} فقط" },
    links: [{ label: "nisar-docs.asf.alaska.edu", url: "https://nisar-docs.asf.alaska.edu/gcov/" }],
    licence: { en: "Verified", ar: "موثَّق" },
    kind: "CONTEXT",
  },
  {
    id: "epanet",
    name: { en: "EPANET 2.2 and WNTR (EPA / Sandia)", ar: "EPANET 2.2 وWNTR (وكالة حماية البيئة / مختبرات سانديا)" },
    use: { en: "Hydraulic twin and the HydroFingerprint simulations", ar: "التوأم الهيدروليكي ومحاكاة HydroFingerprint" },
    links: [
      { label: "epa.gov/epanet", url: "https://www.epa.gov/water-research/epanet" },
      { label: "github.com/USEPA/WNTR", url: "https://github.com/USEPA/WNTR" },
    ],
    licence: { en: "EPANET public domain; WNTR open source", ar: "EPANET ملكية عامة؛ WNTR مفتوح المصدر" },
    kind: "CONTEXT",
  },
  {
    id: "govai",
    name: { en: "Government AI leak project (Smart Transformation)", ar: "مشروع الحكومة للكشف عن التسربات بالذكاء الاصطناعي (التحول الذكي)" },
    use: { en: "Who is left out: it works from SCADA / sensor data", ar: "من يُستثنى: يعمل على بيانات SCADA والحساسات" },
    links: [{ label: "menastartupdigest.com", url: "https://menastartupdigest.com/?p=47589" }],
    licence: { en: "Context", ar: "سياق" },
    kind: "CONTEXT",
  },
  {
    id: "asterra",
    name: { en: "ASTERRA: commercial L-band leak detection", ar: "ASTERRA: كشف تجاري للتسربات بالنطاق L" },
    use: { en: "Competition: we use free public radar and add pipe-map repair, in Arabic", ar: "المنافسة: نستخدم رادارًا عامًا مجانيًا ونضيف إصلاح خريطة الأنابيب، بالعربية" },
    links: [{ label: "asterra.io", url: "https://asterra.io/" }],
    licence: { en: "Context", ar: "سياق" },
    kind: "CONTEXT",
  },
];
