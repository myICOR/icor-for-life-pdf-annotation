/* The highlight: one markdown note per highlight, the position and the
 * content in the frontmatter, the user's own note in the body. This module
 * is pure (no Obsidian import): it reads a frontmatter object the way the
 * metadata cache hands it over, and writes the text of a new note. The
 * field names and the body shape are the contract; see README.md, "The
 * highlight note". */

export type HighlightColor = 'yellow' | 'red' | 'orange' | 'green' | 'blue' | 'purple';

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = ['yellow', 'red', 'orange', 'green', 'blue', 'purple'];

export const COLOR_NAMES: Record<HighlightColor, string> = {
  yellow: 'Yellow',
  red: 'Red',
  orange: 'Orange',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
};

export const DEFAULT_COLOR: HighlightColor = 'yellow';

/* `selection` anchors a text highlight through the text layer; `rect`
   anchors a drawn box. */
export type Anchor = 'selection' | 'rect';

/* A rectangle in PDF user space on one page: x0, y0, x1, y1 with x0 < x1
   and y0 < y1 (y grows upward, as in the PDF). */
export type Rect = [number, number, number, number];

/* A text selection on one page the way Obsidian's own PDF links write it:
   the `data-idx` of the text-layer span and the character offset inside
   it, at each end. */
export type TextSelection = [number, number, number, number];

export interface Highlight {
  id: string;
  notePath: string;
  /* The link target of `source_file` as written, without the brackets. */
  sourceFile: string;
  /* The link target of `document`, the wrapper note, when there is one. */
  document: string | null;
  page: number;
  anchor: Anchor;
  color: HighlightColor;
  quote: string;
  selection: TextSelection | null;
  rects: Rect[];
  /* The link target of the cropped image, rect highlights only. */
  image: string | null;
  created: string;
  canvases: string[];
  linkedNotes: string[];
}

export const TYPE_FIELD = 'type';
export const NOTE_TYPE_VALUE = 'pdf-highlight';
export const CSS_CLASS_VALUE = 'icor-pdf-highlight';
export const QUOTE_BLOCK_ID = 'quote';
export const IMAGE_BLOCK_ID = 'image';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const ID_LENGTH = 12;

/* Twelve lowercase letters and digits, stable for the life of the note. */
export function newId(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) out += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length) % ID_ALPHABET.length];
  return out;
}

export function isHighlightColor(v: unknown): v is HighlightColor {
  return typeof v === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(v);
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/* "[[target]]", "[[target|alias]]" or "[[target#sub|alias]]" to "target";
   a plain string is taken as the target itself. */
export function linkTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length === 0) return null;
  const m = /^!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/.exec(s);
  return (m?.[1] ?? s).trim() || null;
}

export function wikilink(target: string): string {
  return `[[${target}]]`;
}

/* The link target for a vault path: a note loses its `.md`, every other
   file keeps its extension. */
export function targetOf(path: string): string {
  return path.endsWith('.md') ? path.slice(0, -3) : path;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFinite4(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export function normaliseRect(r: [number, number, number, number]): Rect {
  return [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
}

function readRects(v: unknown): Rect[] {
  if (!Array.isArray(v)) return [];
  const out: Rect[] = [];
  for (const r of v) if (isFinite4(r)) out.push(normaliseRect(r));
  return out;
}

function readSelection(v: unknown): TextSelection | null {
  if (!isFinite4(v)) return null;
  if (!v.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return [v[0], v[1], v[2], v[3]];
}

function readTargets(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const t = linkTarget(item);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function readCreated(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoLocal(v);
  return '';
}

/* `2026-09-07T10:15:00`, local time, no milliseconds, no zone. */
export function isoLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* `2026-09-07-101500`, for a file name. */
export function stampOf(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* The highlight a frontmatter object describes, or null when the object is
   not a highlight note or lacks what a highlight needs (the type, the id,
   the source file, the page and at least one rectangle). Anything else
   falls back to a default. */
export function readHighlight(frontmatter: unknown, notePath: string): Highlight | null {
  if (!isRecord(frontmatter)) return null;
  if (frontmatter[TYPE_FIELD] !== NOTE_TYPE_VALUE) return null;
  const id = frontmatter.highlight_id;
  if (typeof id !== 'string' || id.length === 0) return null;
  const sourceFile = linkTarget(frontmatter.source_file);
  if (!sourceFile) return null;
  const page = frontmatter.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) return null;
  const rects = readRects(frontmatter.rects);
  if (rects.length === 0) return null;
  const selection = readSelection(frontmatter.selection);
  const image = linkTarget(frontmatter.image);
  const anchor: Anchor = frontmatter.anchor === 'rect' || (frontmatter.anchor !== 'selection' && !selection) ? 'rect' : 'selection';
  return {
    id,
    notePath,
    sourceFile,
    document: linkTarget(frontmatter.document),
    page,
    anchor,
    color: isHighlightColor(frontmatter.color) ? frontmatter.color : DEFAULT_COLOR,
    quote: typeof frontmatter.quote === 'string' ? collapseWhitespace(frontmatter.quote) : '',
    selection: anchor === 'selection' ? selection : null,
    rects,
    image: anchor === 'rect' ? image : null,
    created: readCreated(frontmatter.created),
    canvases: readTargets(frontmatter.canvases),
    linkedNotes: readTargets(frontmatter.linked_notes),
  };
}

/* A YAML double-quoted scalar. */
export function yamlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\p{Cc}/gu, ' ')}"`;
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export const NOTE_HEADING = '## Note';

/* The first body line: the quote as a blockquote carrying the block id a
   canvas card points at. A rect highlight with no text in the box says
   where it is instead. */
export function quoteLine(h: Pick<Highlight, 'quote' | 'page' | 'anchor'>): string {
  const text = collapseWhitespace(h.quote) || (h.anchor === 'rect' ? `Area on page ${h.page}` : `Page ${h.page}`);
  return `> ${text} ^${QUOTE_BLOCK_ID}`;
}

export function imageLine(image: string): string {
  return `![[${image}]] ^${IMAGE_BLOCK_ID}`;
}

/* The frontmatter of a highlight note, in the order README.md documents
   the fields; `document` is written only when known. */
export function buildFrontmatter(h: Highlight): string {
  const lines: string[] = ['---'];
  lines.push(`${TYPE_FIELD}: ${NOTE_TYPE_VALUE}`);
  lines.push(`highlight_id: ${h.id}`);
  lines.push(`source_file: ${yamlString(wikilink(h.sourceFile))}`);
  if (h.document) lines.push(`document: ${yamlString(wikilink(h.document))}`);
  lines.push(`page: ${h.page}`);
  lines.push(`anchor: ${h.anchor}`);
  if (h.anchor === 'selection' && h.selection) lines.push(`selection: [${h.selection.join(', ')}]`);
  lines.push(`rects: [${h.rects.map((r) => `[${r.map(num).join(', ')}]`).join(', ')}]`);
  lines.push(`color: ${h.color}`);
  lines.push(`quote: ${yamlString(collapseWhitespace(h.quote))}`);
  if (h.anchor === 'rect' && h.image) lines.push(`image: ${yamlString(wikilink(h.image))}`);
  lines.push(`created: ${h.created}`);
  lines.push(`canvases: [${h.canvases.map((t) => yamlString(wikilink(t))).join(', ')}]`);
  lines.push(`linked_notes: [${h.linkedNotes.map((t) => yamlString(wikilink(t))).join(', ')}]`);
  lines.push(`cssclasses: [${CSS_CLASS_VALUE}]`);
  lines.push('---');
  return lines.join('\n');
}

/* The body: the quote line, the image line for a rect highlight, a blank
   line, the Note heading, an empty line for the user. */
export function buildBody(h: Highlight): string {
  const lines = [quoteLine(h)];
  if (h.anchor === 'rect' && h.image) lines.push(imageLine(h.image));
  lines.push('', NOTE_HEADING, '', '');
  return lines.join('\n');
}

export function buildNoteText(h: Highlight): string {
  return `${buildFrontmatter(h)}\n${buildBody(h)}`;
}

/* The body of a highlight note without its frontmatter. */
export function noteBody(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/* The user's own note: the body after the Note heading, or, in a note
   without the heading, everything after the quote and image lines. */
export function annotationText(text: string): string {
  const body = noteBody(text);
  const at = body.indexOf(`\n${NOTE_HEADING}`);
  if (at >= 0) return body.slice(at + NOTE_HEADING.length + 1).trim();
  if (body.startsWith(NOTE_HEADING)) return body.slice(NOTE_HEADING.length).trim();
  return body
    .split('\n')
    .filter((l) => !/\^(quote|image)\s*$/.test(l))
    .join('\n')
    .trim();
}

/* The first lines of the annotation, for hover cards and rows. */
export function notePreview(text: string, maxLines = 3, maxChars = 200): string {
  const lines = annotationText(text)
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s+)/, '').replace(/[*_`~]/g, '').trim())
    .filter((l) => l.length > 0);
  const out = lines.slice(0, maxLines).join(' ');
  if (out.length <= maxChars) return out;
  return `${out.slice(0, maxChars - 1).trimEnd()}…`;
}

/* The body with the quote line replaced (a colour change never touches
   it; a re-anchoring would). Returns the text unchanged when there is no
   quote line to replace. */
export function replaceQuoteLine(text: string, line: string): string {
  const re = new RegExp(`^> .*\\^${QUOTE_BLOCK_ID}\\s*$`, 'm');
  return re.test(text) ? text.replace(re, line) : text;
}

/* The index of the first line that renders as content: the first non-blank
   line after the frontmatter block, or -1 when there is none. The card
   post-processor renders the card in front of that section only. */
export function firstContentLine(text: string): number {
  const lines = text.split('\n');
  let i = 0;
  if (lines[0]?.trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i]?.trim() !== '---') i++;
    i++;
  }
  for (; i < lines.length; i++) if ((lines[i] ?? '').trim().length > 0) return i;
  return -1;
}

/* Top of the page first (PDF y grows upward), then left to right. */
export function compareOnPage(a: Highlight, b: Highlight): number {
  if (a.page !== b.page) return a.page - b.page;
  const ay = Math.max(...a.rects.map((r) => r[3]));
  const by = Math.max(...b.rects.map((r) => r[3]));
  if (ay !== by) return by - ay;
  const ax = Math.min(...a.rects.map((r) => r[0]));
  const bx = Math.min(...b.rects.map((r) => r[0]));
  return ax - bx;
}

/* Rectangles sorted top of the page first, for the frontmatter. */
export function sortRectsTopDown(rects: readonly Rect[]): Rect[] {
  return [...rects].sort((a, b) => b[3] - a[3] || a[0] - b[0]);
}

/* True when a document note's `source_file` or `digital_location` names
   this PDF: the same vault path, or the same file name. */
export function namesPdf(value: unknown, pdfPath: string): boolean {
  const target = linkTarget(value);
  if (!target) return false;
  const name = pdfPath.slice(pdfPath.lastIndexOf('/') + 1).toLowerCase();
  const t = target.replace(/\\/g, '/').toLowerCase();
  if (t === pdfPath.toLowerCase()) return true;
  return t.slice(t.lastIndexOf('/') + 1) === name;
}
