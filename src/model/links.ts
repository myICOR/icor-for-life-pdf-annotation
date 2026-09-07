/* The deep link: a wikilink to the PDF with a subpath that names the page
 * and the highlight, in the form Obsidian's own "Copy link to selection"
 * writes plus the `color` and `rect` parameters PDF++ writes, so a link
 * copied here opens in the built-in viewer, in PDF++, and here. Pure. */
import { isHighlightColor } from './highlight';
import type { Highlight, HighlightColor, Rect, TextSelection } from './highlight';
import { IMAGE_BLOCK_ID, QUOTE_BLOCK_ID, collapseWhitespace, normaliseRect, targetOf } from './highlight';

export interface DeepLinkParams {
  page: number;
  selection?: TextSelection;
  rect?: Rect;
  color?: HighlightColor;
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/* `page=3&selection=1,2,3,4&color=yellow` or `page=3&rect=x0,y0,x1,y1&color=yellow`. */
export function buildSubpath(h: Pick<Highlight, 'page' | 'anchor' | 'selection' | 'rects' | 'color'>): string {
  const parts = [`page=${h.page}`];
  if (h.anchor === 'selection' && h.selection) parts.push(`selection=${h.selection.join(',')}`);
  else if (h.rects[0]) parts.push(`rect=${h.rects[0].map(num).join(',')}`);
  parts.push(`color=${h.color}`);
  return parts.join('&');
}

/* What the viewer reads natively: the page, and the selection when the
   highlight has one. Used to open a highlight from inside the plugin. */
export function nativeSubpath(h: Pick<Highlight, 'page' | 'anchor' | 'selection'>): string {
  return h.anchor === 'selection' && h.selection ? `page=${h.page}&selection=${h.selection.join(',')}` : `page=${h.page}`;
}

export const MAX_ALIAS_LENGTH = 100;

/* The alias of a highlight link: the quote, cut when long, or `p<n> area`. */
export function linkAlias(h: Pick<Highlight, 'page' | 'anchor' | 'quote'>): string {
  if (h.anchor === 'rect' || h.quote.length === 0) return `p${h.page} area`;
  const clean = collapseWhitespace(h.quote).replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_ALIAS_LENGTH) return clean;
  return `${clean.slice(0, MAX_ALIAS_LENGTH - 3).trimEnd()}...`;
}

/* `[[<pdf path>#page=3&selection=1,2,3,4&color=yellow|<quote>]]`. */
export function buildHighlightLink(h: Highlight): string {
  return `[[${h.sourceFile}#${buildSubpath(h)}|${linkAlias(h)}]]`;
}

/* `[[<note path without .md>]]`. */
export function buildNoteLink(notePath: string): string {
  return `[[${targetOf(notePath)}]]`;
}

/* The block a card or an embed of the highlight shows: the image of a
   rect highlight, else the quote. */
export function blockId(h: Pick<Highlight, 'anchor' | 'image'>): string {
  return h.anchor === 'rect' && h.image ? IMAGE_BLOCK_ID : QUOTE_BLOCK_ID;
}

/* `![[<note>#^quote]]` or `![[<note>#^image]]`. */
export function buildEmbed(h: Pick<Highlight, 'notePath' | 'anchor' | 'image'>): string {
  return `![[${targetOf(h.notePath)}#^${blockId(h)}]]`;
}

function nums(value: string | null, count: number): number[] | null {
  if (!value) return null;
  const parts = value.split(',').map((s) => Number(s.trim()));
  if (parts.length !== count || !parts.every((n) => Number.isFinite(n))) return null;
  return parts;
}

/* The parameters of a PDF subpath, with or without the leading `#`. Null
   when there is no page. Unknown parameters are ignored, as the viewer
   ignores them. */
export function parseSubpath(subpath: string): DeepLinkParams | null {
  const s = subpath.startsWith('#') ? subpath.slice(1) : subpath;
  if (!s.includes('=')) return null;
  const params = new Map<string, string>();
  for (const pair of s.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    params.set(decodeURIComponent(pair.slice(0, eq)).trim(), decodeURIComponent(pair.slice(eq + 1)).trim());
  }
  const page = Number(params.get('page'));
  if (!Number.isInteger(page) || page < 1) return null;
  const out: DeepLinkParams = { page };
  const selection = nums(params.get('selection') ?? null, 4);
  if (selection && selection.every((n) => Number.isInteger(n) && n >= 0)) out.selection = [selection[0] ?? 0, selection[1] ?? 0, selection[2] ?? 0, selection[3] ?? 0];
  const rect = nums(params.get('rect') ?? null, 4);
  if (rect) out.rect = normaliseRect([rect[0] ?? 0, rect[1] ?? 0, rect[2] ?? 0, rect[3] ?? 0]);
  const color = params.get('color');
  if (isHighlightColor(color)) out.color = color;
  return out;
}

export function sameSelection(a: TextSelection | null, b: TextSelection | undefined): boolean {
  return !!a && !!b && a.every((n, i) => n === b[i]);
}

/* Two rectangles that are the same to a hundredth of a unit. */
export function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  return !!a && !!b && a.every((n, i) => Math.abs(n - (b[i] ?? Number.NaN)) < 0.01);
}

/* The highlight on this page a link's parameters point at, if any. */
export function matchHighlight(params: DeepLinkParams, candidates: readonly Highlight[]): Highlight | null {
  for (const h of candidates) {
    if (h.page !== params.page) continue;
    if (params.selection && h.anchor === 'selection' && sameSelection(h.selection, params.selection)) return h;
    if (params.rect && sameRect(h.rects[0], params.rect)) return h;
  }
  return null;
}
