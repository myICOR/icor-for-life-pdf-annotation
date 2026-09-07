/* From the browser selection inside a page's text layer to what a highlight
 * needs: the page, the four numbers of Obsidian's own `selection=` link,
 * the quote, and the rectangles in PDF user space. The numbers come from
 * the viewer's own `getTextSelectionRangeStr` when it is there, else from
 * the same walk over `span.textLayerNode[data-idx]`. The rectangles come
 * from the per-character boxes the text layer carries (`chars[].r`, in PDF
 * user space), merged per line; without them, from the range's client
 * rectangles through the viewport's inverse transform. */
import { collapseWhitespace } from '../model/highlight';
import type { Rect, TextSelection } from '../model/highlight';
import { mergeLineRects, viewRectToPdf, isMatrix } from '../model/rects';
import { closestTextNode, isPageView, targetElement } from '../internals';
import type { PageView, PdfViewerChild, TextContentItem } from '../internals';

export interface SelectionInfo {
  page: number;
  pageView: PageView;
  pageEl: HTMLElement;
  selection: TextSelection;
  quote: string;
  rects: Rect[];
  range: Range;
}

/* The `.page` element and its number around a node. */
export function pageOf(node: Node | null): { el: HTMLElement; page: number } | null {
  const el = targetElement(node)?.closest('.page');
  if (!el) return null;
  const page = Number((el as HTMLElement).dataset.pageNumber);
  if (!Number.isInteger(page) || page < 1) return null;
  return { el: el as HTMLElement, page };
}

/* Characters before `container` inside `node`, plus `offset` in it. */
function charsBefore(node: HTMLElement, container: Node, offset: number): number | null {
  if (!node.contains(container)) return null;
  if (container === node) {
    /* An element offset counts child nodes; sum the text before them. */
    let n = 0;
    for (let i = 0; i < offset && i < node.childNodes.length; i++) n += node.childNodes[i]?.textContent?.length ?? 0;
    return n;
  }
  const it = node.doc.createNodeIterator(node, NodeFilter.SHOW_TEXT);
  let n = offset;
  let current: Node | null;
  while ((current = it.nextNode()) && current !== container) n += current.textContent?.length ?? 0;
  return n;
}

function parseRangeStr(s: string | null | undefined): TextSelection | null {
  if (!s) return null;
  const parts = s.split(',').map((p) => Number(p));
  if (parts.length !== 4 || !parts.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/* The four numbers, the viewer's way or the same walk by hand. */
export function selectionNumbers(child: PdfViewerChild, pageEl: HTMLElement, range: Range): TextSelection | null {
  if (typeof child.getTextSelectionRangeStr === 'function') {
    try {
      const own = parseRangeStr(child.getTextSelectionRangeStr(pageEl));
      if (own) return own;
    } catch {
      /* fall through to the walk */
    }
  }
  const start = closestTextNode(range.startContainer);
  const end = closestTextNode(range.endContainer);
  if (!start || !end || !pageEl.contains(start) || !pageEl.contains(end)) return null;
  const a = Number(start.dataset.idx);
  const c = Number(end.dataset.idx);
  const b = charsBefore(start, range.startContainer, range.startOffset);
  const d = charsBefore(end, range.endContainer, range.endOffset);
  if (!Number.isInteger(a) || !Number.isInteger(c) || b === null || d === null) return null;
  return [a, b, c, d];
}

/* The rectangles of the characters between the two ends, one per line. */
export function rectsFromChars(items: readonly TextContentItem[], sel: TextSelection): Rect[] {
  const [a, b, c, d] = sel;
  const rects: Rect[] = [];
  for (let i = a; i <= c && i < items.length; i++) {
    const chars = items[i]?.chars;
    if (!chars) continue;
    const from = i === a ? Math.min(b, chars.length) : 0;
    const to = i === c ? Math.min(d, chars.length) : chars.length;
    for (let j = from; j < to; j++) {
      const r = chars[j]?.r;
      if (r && r.length === 4 && r.every((n) => Number.isFinite(n))) rects.push([r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 0]);
    }
  }
  return mergeLineRects(rects);
}

/* The text of the characters whose centre lies in the box, in reading
   order, the way the viewer's own `getTextByRect` reads it. */
export function textInRect(items: readonly TextContentItem[], rect: Rect): string {
  let out = '';
  for (const item of items) {
    if (!item.chars) continue;
    for (const ch of item.chars) {
      const r = ch.r;
      if (!r || r.length < 4) continue;
      const cx = ((r[0] ?? 0) + (r[2] ?? 0)) / 2;
      const cy = ((r[1] ?? 0) + (r[3] ?? 0)) / 2;
      if (cx >= rect[0] && cx <= rect[2] && cy >= rect[1] && cy <= rect[3]) out += ch.u;
    }
    if (out.length > 0 && !out.endsWith(' ')) out += ' ';
  }
  return collapseWhitespace(out);
}

/* The rectangles from the range's client boxes, in PDF space. */
export function rectsFromRange(range: Range, pageView: PageView, pageEl: HTMLElement): Rect[] {
  const base = pageEl.getBoundingClientRect();
  const m = pageView.viewport.transform;
  if (!isMatrix(m)) return [];
  /* The page's content box is the viewport; the border sits outside it. */
  const style = pageEl.win.getComputedStyle(pageEl);
  const bl = parseFloat(style.borderLeftWidth) || 0;
  const bt = parseFloat(style.borderTopWidth) || 0;
  const rects: Rect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 0.5 || r.height < 0.5) continue;
    const x0 = r.left - base.left - bl;
    const y0 = r.top - base.top - bt;
    rects.push(viewRectToPdf([x0, y0, x0 + r.width, y0 + r.height], m));
  }
  return mergeLineRects(rects);
}

export function textItemsOf(pageView: PageView): TextContentItem[] | null {
  const items = pageView.textLayer?.textLayer?.textContentItems;
  return Array.isArray(items) && items.length > 0 ? items : null;
}

/* The current selection, when it is a non-empty range inside one page of
   this viewer's text layer. */
export function readSelection(child: PdfViewerChild, win: Window): SelectionInfo | null {
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const start = pageOf(range.startContainer);
  const end = pageOf(range.endContainer);
  if (!start || !end || start.el !== end.el) return null;
  if (!child.containerEl.contains(start.el)) return null;
  if (!closestTextNode(range.startContainer) && !closestTextNode(range.endContainer)) return null;
  const pageView = child.getPage(start.page);
  if (!isPageView(pageView)) return null;
  const selection = selectionNumbers(child, start.el, range);
  if (!selection) return null;
  const quote = collapseWhitespace(sel.toString());
  if (quote.length === 0) return null;
  const items = textItemsOf(pageView);
  let rects = items ? rectsFromChars(items, selection) : [];
  if (rects.length === 0) rects = rectsFromRange(range, pageView, start.el);
  if (rects.length === 0) return null;
  return { page: start.page, pageView, pageEl: start.el, selection, quote, rects, range };
}
