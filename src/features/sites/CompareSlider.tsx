// Before / after radar compare slider. Two canvases cropped from the public HH PNGs (public/radar, same grid as the
// TIFs) around one spot. The "before" image sits on the inline-start side (right in Arabic); the images themselves are
// maps (north up, west left) and are never mirrored. Pointer drag anywhere on the image, or keyboard on the divider.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { fmtDate, useI18n, useT } from "../../i18n";
import type { SpotSeries } from "./series";
import { sitesStrings } from "./strings";

type Img = { url: string; date: string };

export type CompareSliderProps = {
  before: Img;
  after: Img;
  crop: SpotSeries["crop"];
  /** Radar position uncertainty in metres (spot.position_accuracy_m): drawn as a circle. */
  accuracyM: number;
  /** aria-label of the whole figure */
  label: string;
  caption?: ReactNode;
  /** Start position of the divider, 0..1 from the inline-start edge (default 0.3: the spot starts on the "after" side). */
  initial?: number;
};

const NODATA: [number, number, number] = [26, 39, 58];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(url));
    im.src = url;
  });
}

/** Draw the crop into a w x h canvas; returns its pixels (alpha 0 = no radar data or outside the grid). */
function cropPixels(img: HTMLImageElement, c: SpotSeries["crop"]): ImageData {
  const { x, y, w, h } = c.png_px;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  // clamp the source rect to the image so a crop that runs past the grid edge (W4) stays aligned
  const sx = Math.max(0, x), sy = Math.max(0, y);
  const ex = Math.min(img.naturalWidth, x + w), ey = Math.min(img.naturalHeight, y + h);
  if (ex > sx && ey > sy) g.drawImage(img, sx, sy, ex - sx, ey - sy, sx - x, sy - y, ex - sx, ey - sy);
  return g.getImageData(0, 0, w, h);
}

/** One contrast stretch (2nd..98th percentile of both crops) applied to both dates, so they stay comparable. */
function stretch(a: ImageData, b: ImageData) {
  const vals: number[] = [];
  for (const d of [a, b]) for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 0) vals.push(d.data[i]);
  if (vals.length < 4) return;
  vals.sort((p, q) => p - q);
  const lo = vals[Math.floor(vals.length * 0.02)];
  const hi = Math.max(vals[Math.floor(vals.length * 0.98)], lo + 1);
  for (const d of [a, b])
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i + 3] === 0) {
        d.data[i] = NODATA[0];
        d.data[i + 1] = NODATA[1];
        d.data[i + 2] = NODATA[2];
        d.data[i + 3] = 255;
        continue;
      }
      const v = Math.max(0, Math.min(255, Math.round(((d.data[i] - lo) / (hi - lo)) * 255)));
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    }
}

/** Outline of a set of grid cells as one SVG path (cell edges whose neighbour is not in the set). */
function outlinePath(cells: [number, number][]): string {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  let d = "";
  for (const [x, y] of cells) {
    if (!has(x, y - 1)) d += `M${x} ${y}h1`;
    if (!has(x, y + 1)) d += `M${x} ${y + 1}h1`;
    if (!has(x - 1, y)) d += `M${x} ${y}v1`;
    if (!has(x + 1, y)) d += `M${x + 1} ${y}v1`;
  }
  return d;
}

export function CompareSlider({ before, after, crop, accuracyM, label, caption, initial = 0.3 }: CompareSliderProps) {
  const { lang, dir } = useI18n();
  const t = useT(sitesStrings);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pos, setPos] = useState(initial);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const { w, h } = crop.png_px;

  useEffect(() => {
    let alive = true;
    setState("loading");
    Promise.all([loadImage(before.url), loadImage(after.url)]).then(
      ([b, a]) => {
        if (!alive) return;
        const pb = cropPixels(b, crop);
        const pa = cropPixels(a, crop);
        stretch(pb, pa);
        beforeRef.current?.getContext("2d")?.putImageData(pb, 0, 0);
        afterRef.current?.getContext("2d")?.putImageData(pa, 0, 0);
        setState("ok");
      },
      () => alive && setState("error"),
    );
    return () => {
      alive = false;
    };
  }, [before.url, after.url, crop]);

  const fromClientX = (clientX: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const f = dir === "rtl" ? (r.right - clientX) / r.width : (clientX - r.left) / r.width;
    setPos(Math.max(0, Math.min(1, f)));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fromClientX(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) fromClientX(e.clientX);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    // arrows move the divider the way they point on screen, in both directions
    const visual = dir === "rtl" ? -1 : 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = pos + step * visual;
    else if (e.key === "ArrowLeft") next = pos - step * visual;
    else if (e.key === "ArrowUp" || e.key === "PageUp") next = pos + (e.key === "PageUp" ? 0.25 : step);
    else if (e.key === "ArrowDown" || e.key === "PageDown") next = pos - (e.key === "PageDown" ? 0.25 : step);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    if (next === null) return;
    e.preventDefault();
    setPos(Math.max(0, Math.min(1, next)));
  };

  const hidden = `${((1 - pos) * 100).toFixed(2)}%`;
  const clip = dir === "rtl" ? `inset(0 0 0 ${hidden})` : `inset(0 ${hidden} 0 0)`;
  const r = accuracyM / crop.m_per_px.x;
  const sx = crop.spot_in_crop_px.x, sy = crop.spot_in_crop_px.y;
  const pct = Math.round(pos * 100);
  const d0 = fmtDate(before.date, lang), d1 = fmtDate(after.date, lang);

  return (
    <figure className="sitecard-compare" aria-label={label}>
      <div
        ref={boxRef}
        className={`sitecard-compare-box sitecard-compare-${state}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* after = base layer (with the wet outline), before = top layer clipped to the inline-start part */}
        <div className="sitecard-compare-layer">
          <canvas ref={afterRef} width={w} height={h} className="sitecard-compare-canvas" role="img" aria-label={`${t("after")} · ${d1}`} />
          <svg className="sitecard-compare-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={outlinePath(crop.wet_cells)} className="sitecard-wet-outline" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="sitecard-compare-layer" style={{ clipPath: clip, WebkitClipPath: clip }}>
          <canvas ref={beforeRef} width={w} height={h} className="sitecard-compare-canvas" role="img" aria-label={`${t("before")} · ${d0}`} />
        </div>
        <svg className="sitecard-compare-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <circle cx={sx} cy={sy} r={r} className="sitecard-acc-circle" vectorEffect="non-scaling-stroke" />
          <circle cx={sx} cy={sy} r={0.35} className="sitecard-acc-dot" />
        </svg>

        <span className="sitecard-date sitecard-date-before">
          <span className="sitecard-date-k">{t("before")}</span> {d0}
        </span>
        <span className="sitecard-date sitecard-date-after">
          <span className="sitecard-date-k">{t("after")}</span> {d1}
        </span>

        <div className="sitecard-divider" style={{ insetInlineStart: `${pos * 100}%` }}>
          <div
            className="sitecard-divider-knob"
            role="slider"
            tabIndex={0}
            aria-label={t("divider")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={t("dividerValue", { n: `${pct}%`, d0 })}
            aria-orientation="horizontal"
            onKeyDown={onKey}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M7 5 2 10l5 5M13 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {state !== "ok" ? <div className="sitecard-compare-msg">{state === "error" ? t("imgError") : "…"}</div> : null}
      </div>
      {caption ? <figcaption className="sitecard-compare-cap">{caption}</figcaption> : null}
    </figure>
  );
}
