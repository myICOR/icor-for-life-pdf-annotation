/* Rectangle maths. Pure. PDF user space has y growing upward; the page's
 * viewport transform (a pdf.js `PageViewport.transform`, six numbers) maps
 * it to the page element's pixel space with y growing downward, and the
 * inverse maps back. Every rectangle here is [x1, y1, x2, y2] with x1 < x2
 * and y1 < y2 in its own space. */
import type { Rect } from './highlight';
import { normaliseRect } from './highlight';

export type Matrix = [number, number, number, number, number, number];

export function applyTransform(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function applyInverse(m: Matrix, x: number, y: number): [number, number] {
  const d = m[0] * m[3] - m[1] * m[2];
  return [(x * m[3] - y * m[2] + m[2] * m[5] - m[4] * m[3]) / d, (-x * m[1] + y * m[0] + m[4] * m[1] - m[5] * m[0]) / d];
}

export function isMatrix(v: unknown): v is Matrix {
  return Array.isArray(v) && v.length === 6 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/* A PDF rectangle to the page element's pixel rectangle. */
export function pdfRectToView(r: Rect, m: Matrix): Rect {
  const a = applyTransform(m, r[0], r[1]);
  const b = applyTransform(m, r[2], r[3]);
  return normaliseRect([a[0], a[1], b[0], b[1]]);
}

/* A page-element pixel rectangle to PDF user space. */
export function viewRectToPdf(r: Rect, m: Matrix): Rect {
  const a = applyInverse(m, r[0], r[1]);
  const b = applyInverse(m, r[2], r[3]);
  return normaliseRect([a[0], a[1], b[0], b[1]]);
}

export function rectWidth(r: Rect): number {
  return r[2] - r[0];
}

export function rectHeight(r: Rect): number {
  return r[3] - r[1];
}

export function rectArea(r: Rect): number {
  return rectWidth(r) * rectHeight(r);
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let out: Rect = [...(rects[0] as Rect)];
  for (const r of rects) out = [Math.min(out[0], r[0]), Math.min(out[1], r[1]), Math.max(out[2], r[2]), Math.max(out[3], r[3])];
  return out;
}

export function roundRect(r: Rect, digits = 2): Rect {
  const f = 10 ** digits;
  return [Math.round(r[0] * f) / f, Math.round(r[1] * f) / f, Math.round(r[2] * f) / f, Math.round(r[3] * f) / f];
}

function verticalOverlap(a: Rect, b: Rect): number {
  const top = Math.max(a[1], b[1]);
  const bottom = Math.min(a[3], b[3]);
  return Math.max(0, bottom - top);
}

/* The rectangles of one selection, one per text span, merged into one per
   line: two rectangles share a line when their vertical spans overlap by
   at least half of the smaller height, and they merge when their
   horizontal spans touch or come within `gap` (eight units, about one
   character, so the spaces between spans on a line close). Empty rectangles are
   dropped. The result is sorted top to bottom in the space given (so pass
   view-space rectangles, whose y grows downward, or sort afterwards). */
export function mergeLineRects(rects: readonly Rect[], gap = 8): Rect[] {
  const clean = rects.map(normaliseRect).filter((r) => rectWidth(r) > 0.5 && rectHeight(r) > 0.5);
  clean.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const lines: Rect[][] = [];
  for (const r of clean) {
    const line = lines.find((l) => {
      const ref = l[0] as Rect;
      return verticalOverlap(ref, r) >= 0.5 * Math.min(rectHeight(ref), rectHeight(r));
    });
    if (line) line.push(r);
    else lines.push([r]);
  }
  const out: Rect[] = [];
  for (const line of lines) {
    line.sort((a, b) => a[0] - b[0]);
    let current: Rect | null = null;
    for (const r of line) {
      if (current && r[0] <= current[2] + gap) {
        current = [current[0], Math.min(current[1], r[1]), Math.max(current[2], r[2]), Math.max(current[3], r[3])];
      } else {
        if (current) out.push(current);
        current = [...r];
      }
    }
    if (current) out.push(current);
  }
  return out;
}
