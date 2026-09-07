/* The one door to what Obsidian does not publish. Three surfaces: the drag
 * manager (for dragging a highlight onto a canvas or into an editor), the
 * canvas object of a canvas view (for the drop that makes a card show one
 * block of the note), and the built-in PDF view (for painting, the
 * selection and the area tool). Every name here was read in the 1.13.7
 * bundle (docs/architecture.md lists each with where it was found) and
 * none of them is in obsidian.d.ts, so every use goes through a runtime
 * guard: a feature asks for the members it needs and switches itself off,
 * with a Notice and a console line, when one is missing. Nothing outside
 * this file names a private member without a guard having passed first. */
import { TFile } from 'obsidian';
import type { App, EventRef, TAbstractFile, View } from 'obsidian';
import { degrade } from './log';

type MemberKind = 'function' | 'element' | 'object' | 'boolean' | 'number' | 'array';

/* Cross-window: an element in a pop-out window is of that window's
   classes, which a plain `instanceof` here would not see. Obsidian's
   `instanceOf` on Node checks by name across windows. */
export function isHtmlElement(value: unknown): value is HTMLElement {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Partial<Node>;
  return typeof node.instanceOf === 'function' && node.instanceOf(HTMLElement);
}

/* The element an event landed on, whatever window it came from. */
export function targetElement(target: EventTarget | null): Element | null {
  if (typeof target !== 'object' || target === null) return null;
  const node = target as Partial<Node>;
  if (typeof node.instanceOf !== 'function') return null;
  if (node.instanceOf(Element)) return node;
  return node.instanceOf(Node) ? node.parentElement : null;
}

function hasKind(value: unknown, kind: MemberKind): boolean {
  switch (kind) {
    case 'function':
      return typeof value === 'function';
    case 'element':
      return isHtmlElement(value);
    case 'object':
      return typeof value === 'object' && value !== null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

function missing(target: unknown, table: Record<string, MemberKind>, members: readonly string[]): string[] {
  if (typeof target !== 'object' || target === null) return [...members];
  const record = target as Record<string, unknown>;
  return members.filter((m) => !hasKind(record[m], table[m] ?? 'object'));
}

/* ---------- The drag manager ---------- */

export interface FileDraggable {
  source?: string;
  type: string;
  icon?: string;
  title?: string;
  file?: TAbstractFile;
  /* The plugin's own addition: the block the dropped card should show. */
  subpath?: string;
}

export interface DragManager {
  draggable: FileDraggable | null;
  /* Sets `el.draggable = true` and starts a drag with what `factory`
     returns on dragstart (the file explorer's path). */
  handleDrag(el: HTMLElement, factory: (evt: DragEvent) => FileDraggable | null): void;
  /* Writes the obsidian:// URL of the file into the data transfer and
     returns the draggable the canvas and the editors understand. */
  dragFile(evt: DragEvent, file: TFile, source?: string): FileDraggable;
  onDragStart(evt: DragEvent, draggable: FileDraggable): void;
}

const DRAG_MEMBERS: Record<string, MemberKind> = {
  handleDrag: 'function',
  dragFile: 'function',
  onDragStart: 'function',
};

export type DragMember = keyof typeof DRAG_MEMBERS;

export function dragManager(app: App, members: readonly DragMember[], feature: string): DragManager | null {
  const manager = (app as Partial<App> & { dragManager?: unknown }).dragManager;
  const gone = missing(manager, DRAG_MEMBERS, members);
  if (gone.length === 0) return manager as DragManager;
  degrade(`${feature}: app.dragManager.${gone.join(', app.dragManager.')}`);
  return null;
}

/* The draggable of the drag in flight, if it is one of this plugin's. */
export function ownDraggable(app: App, source: string): FileDraggable | null {
  const manager = (app as Partial<App> & { dragManager?: { draggable?: unknown } }).dragManager;
  const d = manager?.draggable;
  if (typeof d !== 'object' || d === null) return null;
  const draggable = d as FileDraggable;
  return draggable.source === source && draggable.file instanceof TFile ? draggable : null;
}

/* ---------- The canvas of a canvas view ---------- */

export interface CanvasNode {
  id: string;
}

export interface Canvas {
  readonly: boolean;
  wrapperEl: HTMLElement;
  posFromEvt(evt: { clientX: number; clientY: number }): { x: number; y: number };
  createFileNode(options: { pos: { x: number; y: number }; size?: { width: number; height: number }; file: TFile; subpath?: string; save?: boolean; focus?: boolean }): CanvasNode;
}

export interface CanvasView extends View {
  canvas: Canvas;
  file: TFile | null;
  contentEl: HTMLElement;
}

const CANVAS_MEMBERS: Record<string, MemberKind> = {
  readonly: 'boolean',
  wrapperEl: 'element',
  posFromEvt: 'function',
  createFileNode: 'function',
};

export type CanvasMember = keyof typeof CANVAS_MEMBERS;

export const CANVAS_VIEW_TYPE = 'canvas';

export function asCanvasView(view: View | null | undefined): CanvasView | null {
  if (!view || view.getViewType() !== CANVAS_VIEW_TYPE) return null;
  const canvas = (view as Partial<CanvasView>).canvas;
  if (typeof canvas !== 'object' || canvas === null) return null;
  return view as CanvasView;
}

export function requireCanvas(canvas: unknown, members: readonly CanvasMember[], feature: string): canvas is Canvas {
  const gone = missing(canvas, CANVAS_MEMBERS, members);
  if (gone.length === 0) return true;
  degrade(`${feature}: canvas.${gone.join(', canvas.')}`);
  return false;
}

/* ---------- The built-in PDF view ---------- */

export const PDF_VIEW_TYPE = 'pdf';

/* pdf.js: the page's viewport (`PageViewport`). */
export interface PageViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  transform: number[];
  rawDims: { pageWidth: number; pageHeight: number; pageX: number; pageY: number };
  convertToViewportRectangle(rect: number[]): number[];
  convertToPdfPoint(x: number, y: number): number[];
}

/* pdf.js: the page proxy. */
export interface PdfPage {
  view: number[];
  getViewport(options: { scale: number; rotation?: number }): PageViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PageViewport; transform?: number[] }): { promise: Promise<void> };
}

/* One character of the text layer with its rectangle in PDF user space,
   Obsidian's `includeChars` addition to pdf.js. */
export interface TextChar {
  u: string;
  r: number[];
}

export interface TextContentItem {
  str: string;
  chars?: TextChar[];
}

/* The text layer of a page: the builder (`textLayer`) holds the div and
   the pdf.js layer (`textLayer.textLayer`) with the spans and the items. */
export interface TextLayerBuilder {
  div: HTMLElement;
  textLayer?: { textDivs: HTMLElement[]; textContentItems?: TextContentItem[] } | null;
}

/* pdf.js `PDFPageView`, with Obsidian's `getPagePoint`. */
export interface PageView {
  id: number;
  div: HTMLElement;
  viewport: PageViewport;
  pdfPage?: PdfPage | null;
  textLayer?: TextLayerBuilder | null;
  getPagePoint?(x: number, y: number): number[];
}

export interface PdfEventBus {
  on(name: string, listener: (evt: unknown) => void): void;
  off(name: string, listener: (evt: unknown) => void): void;
}

/* pdf.js `PDFViewer`. */
export interface PdfJsViewer {
  pagesCount: number;
  currentPageNumber: number;
  currentScale?: number;
  getPageView(index: number): PageView | undefined;
  scrollPageIntoView(options: { pageNumber: number; destArray?: unknown[] | null }): void;
}

/* Obsidian's viewer object (a `PDFViewerApplication` derivative). */
export interface ObsidianViewer {
  eventBus: PdfEventBus;
  pdfViewer: PdfJsViewer;
  dom: { containerEl: HTMLElement; viewerContainerEl: HTMLElement; viewerEl: HTMLElement; pdfContainerEl: HTMLElement } | null;
  pdfDocument?: unknown;
  pdfLoadingTask?: { promise: Promise<unknown> } | null;
}

/* The real viewer, what PDF++ calls PDFViewerChild. */
export interface PdfViewerChild {
  containerEl: HTMLElement;
  file: TFile | null;
  pdfViewer: ObsidianViewer | null;
  getPage(page: number): PageView | undefined;
  applySubpath(subpath: string): void;
  getTextSelectionRangeStr?(pageEl: HTMLElement): string | null;
  clearTextHighlight?(): void;
  highlightText?(page: number, range: [[number, number], [number, number]]): void;
}

export interface PdfViewerComponent {
  child: PdfViewerChild | null;
  then(callback: (child: PdfViewerChild) => void): void;
}

export interface PdfView extends View {
  viewer: PdfViewerComponent;
  file: TFile | null;
  contentEl: HTMLElement;
}

const CHILD_MEMBERS: Record<string, MemberKind> = {
  containerEl: 'element',
  pdfViewer: 'object',
  getPage: 'function',
  applySubpath: 'function',
  getTextSelectionRangeStr: 'function',
  clearTextHighlight: 'function',
  highlightText: 'function',
};

export type ChildMember = keyof typeof CHILD_MEMBERS;

const VIEWER_MEMBERS: Record<string, MemberKind> = {
  eventBus: 'object',
  pdfViewer: 'object',
  dom: 'object',
};

export type ViewerMember = keyof typeof VIEWER_MEMBERS;

/* A PDF view is the view of type 'pdf' carrying a `viewer` with `then`. */
export function asPdfView(view: View | null | undefined): PdfView | null {
  if (!view || view.getViewType() !== PDF_VIEW_TYPE) return null;
  const viewer = (view as Partial<PdfView>).viewer;
  if (typeof viewer !== 'object' || viewer === null || typeof viewer.then !== 'function') return null;
  return view as PdfView;
}

/* Runs `callback` with the viewer's child now, or once it has loaded. */
export function whenViewerReady(view: PdfView, callback: (child: PdfViewerChild) => void): void {
  view.viewer.then(callback);
}

export function requireChild(child: unknown, members: readonly ChildMember[], feature: string): child is PdfViewerChild {
  const gone = missing(child, CHILD_MEMBERS, members);
  if (gone.length === 0) return true;
  degrade(`${feature}: pdf viewer.${gone.join(', viewer.')}`);
  return false;
}

export function requireViewer(viewer: unknown, members: readonly ViewerMember[], feature: string): viewer is ObsidianViewer {
  const gone = missing(viewer, VIEWER_MEMBERS, members);
  if (gone.length === 0) return true;
  degrade(`${feature}: pdf viewer.pdfViewer.${gone.join(', pdfViewer.')}`);
  return false;
}

/* The event bus with `on` and `off`, pdf.js's public shape. */
export function eventBusOf(viewer: ObsidianViewer): PdfEventBus | null {
  const bus = viewer.eventBus as Partial<PdfEventBus>;
  return typeof bus.on === 'function' && typeof bus.off === 'function' ? (bus as PdfEventBus) : null;
}

/* A rendered page view has its element and a viewport with a transform. */
export function isPageView(value: unknown): value is PageView {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<PageView>;
  return typeof p.id === 'number' && isHtmlElement(p.div) && typeof p.viewport === 'object' && p.viewport !== null && Array.isArray(p.viewport.transform);
}

/* The `data-idx` text-layer spans, the way core's own selection link
   reads them. */
export const TEXT_NODE_CLASS = 'textLayerNode';

export function closestTextNode(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (isHtmlElement(n) && n.hasClass(TEXT_NODE_CLASS)) return n;
    n = n.parentNode;
  }
  return null;
}

/* Wraps a method on one object, own property over the prototype's, and
   returns the undo. The undo restores only while the wrapper is still the
   one installed, so another plugin's later patch of the same method is not
   torn out from under it. Kept for the one case a wrap becomes
   unavoidable; 0.1.0 installs none. */
export function around<T extends object, K extends keyof T & string>(target: T, name: K, wrap: (original: T[K]) => T[K]): () => void {
  const record = target as unknown as Record<string, unknown>;
  const original = record[name];
  const own = Object.prototype.hasOwnProperty.call(record, name);
  const wrapped = wrap(original as T[K]);
  record[name] = wrapped;
  return () => {
    if (record[name] !== wrapped) return;
    if (own) record[name] = original;
    else delete record[name];
  };
}

/* `pdfjsLib.setLayerDimensions(layer, viewport)`: sizes an absolute layer
   to the page through the page's own CSS scale variables. The global is
   set once the viewer has loaded pdf.js. */
export function setLayerDimensions(win: Window, layer: HTMLElement, viewport: PageViewport): boolean {
  const lib = (win as Window & { pdfjsLib?: { setLayerDimensions?: unknown } }).pdfjsLib;
  if (!lib || typeof lib.setLayerDimensions !== 'function') return false;
  (lib.setLayerDimensions as (el: HTMLElement, vp: PageViewport) => void)(layer, viewport);
  return true;
}

export type { EventRef };
