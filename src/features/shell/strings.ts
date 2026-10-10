// Shell strings (top bar, provenance legend, shared UI components). Feature strings live in their own folders.
import { defineStrings } from "../../i18n";

export const shellStrings = defineStrings({
  en: {
    brand: "Missing Blue",
    brandAr: "الأزرق المفقود",
    place: "Karak · Mu'tah · Mazar",
    nav: "Screens",
    langSwitch: "عربي",
    langSwitchLabel: "Switch to Arabic",
    online: "Online",
    offline: "Offline",
    onlineTip: "Connected: live AI and map tiles available",
    offlineTip: "No connection: every screen still works; AI screens show recorded runs",
    legend: "Data labels",
    loading: "Loading…",
    retry: "Try again",
    source: "Source",
    stubTitle: "Screen in progress",
    stubBody: "This screen is being built. Use the menu to open another screen.",
    notFound: "No such screen",
    notFoundBody: "Open a screen from the top bar.",
    mapOffline: "No satellite or map background (offline or tiles not loading); data layers still shown",
    mapOfflineShort: "No map background; data still shown",
    basemapGroup: "Map background",
    basemapSatellite: "Satellite",
    basemapSatelliteTip: "Satellite photo (Esri World Imagery): real, but its capture date varies and is not the radar date. It shows the ground, not leaks.",
    basemapMap: "Map",
    basemapMapTip: "Street map (OpenStreetMap), dimmed so the data layers stand out",
    basemapUnavailable: "unavailable now",
    terrain3d: "3D",
    terrain3dTip: "Tilt the map over real ground relief (AWS Terrain Tiles); heights are exaggerated",
    terrain3dOff: "3D relief unavailable (offline or terrain tiles not loading)",
  },
  ar: {
    brand: "Missing Blue",
    brandAr: "الأزرق المفقود",
    place: "الكرك · مؤتة · المزار",
    nav: "الشاشات",
    langSwitch: "English",
    langSwitchLabel: "التبديل إلى الإنجليزية",
    online: "متصل",
    offline: "غير متصل",
    onlineTip: "متصل: الذكاء الاصطناعي المباشر وخلفية الخريطة متاحة",
    offlineTip: "لا يوجد اتصال: كل الشاشات تعمل، وشاشات الذكاء الاصطناعي تعرض تشغيلًا مسجلًا",
    legend: "تصنيف البيانات",
    loading: "جارٍ التحميل…",
    retry: "أعد المحاولة",
    source: "المصدر",
    stubTitle: "الشاشة قيد البناء",
    stubBody: "يجري بناء هذه الشاشة. افتح شاشة أخرى من القائمة.",
    notFound: "لا توجد شاشة بهذا العنوان",
    notFoundBody: "افتح شاشة من الشريط العلوي.",
    mapOffline: "لا خلفية قمر صناعي ولا خريطة (دون اتصال أو تعذّر التحميل)؛ طبقات البيانات ما زالت ظاهرة",
    mapOfflineShort: "لا خلفية للخريطة؛ البيانات ما زالت ظاهرة",
    basemapGroup: "خلفية الخريطة",
    basemapSatellite: "قمر صناعي",
    basemapSatelliteTip: "صورة قمر صناعي (Esri World Imagery): حقيقية، لكن تاريخ التقاطها يختلف وليس تاريخ مرور الرادار. تُظهر الأرض، لا التسربات.",
    basemapMap: "خريطة",
    basemapMapTip: "خريطة الشوارع (OpenStreetMap)، معتمة لتبرز طبقات البيانات",
    basemapUnavailable: "غير متاحة الآن",
    terrain3d: "ثلاثي الأبعاد",
    terrain3dTip: "إمالة الخريطة فوق تضاريس الأرض الحقيقية (AWS Terrain Tiles)؛ الارتفاعات مضخّمة",
    terrain3dOff: "التضاريس ثلاثية الأبعاد غير متاحة (دون اتصال أو تعذّر تحميلها)",
  },
});

/** Provenance labels and tooltip text (Badge). */
export const provenanceStrings = {
  REAL: {
    label: { en: "REAL", ar: "حقيقي" },
    tip: {
      en: "Real public data: NISAR radar, Karak pipe network, Copernicus elevation, ERA5 rain, Sentinel-2 land cover",
      ar: "بيانات عامة حقيقية: رادار NISAR، شبكة أنابيب الكرك، ارتفاعات Copernicus، أمطار ERA5، الغطاء الأرضي Sentinel-2",
    },
  },
  SIMULATED: {
    label: { en: "SIMULATED", ar: "محاكاة" },
    tip: {
      en: "Simulated from our hydraulic model: pressure readings (no public logger data exists for Karak)",
      ar: "ناتج عن محاكاة نموذجنا الهيدروليكي: قراءات الضغط (لا توجد بيانات عامة لأجهزة تسجيل الضغط في الكرك)",
    },
  },
  ASSUMED: {
    label: { en: "ASSUMED", ar: "افتراض" },
    tip: {
      en: "Assumed value, not measured: twin demand, tank level, leak size",
      ar: "قيمة مفترضة غير مقاسة: الطلب في التوأم، منسوب الخزان، حجم التسرب",
    },
  },
  RECORDED: {
    label: { en: "RECORDED RUN", ar: "تشغيل مسجل" },
    tip: {
      en: "A recorded AI run, shown because the live AI call is unavailable (offline or no API key)",
      ar: "تشغيل مسجل للذكاء الاصطناعي، يظهر لأن الاتصال المباشر غير متاح (دون اتصال أو دون مفتاح)",
    },
  },
  PLAN: {
    label: { en: "PLAN", ar: "خطة" },
    tip: { en: "Our business plan, not a measured fact", ar: "خطة عملنا، وليست حقيقة مقاسة" },
  },
} as const;
