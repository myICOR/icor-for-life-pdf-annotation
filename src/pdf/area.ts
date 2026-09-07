/* The area tool: Mod (Cmd on macOS, Ctrl elsewhere) plus drag on a page
 * draws a box, as Heptabase does; the "Draw area highlight" command arms
 * the next plain drag, which is the path on a phone and from the keyboard.
 * The box becomes a rect highlight with the text inside it as its quote
 * and a PNG of the region rendered from the page at twice the device
 * pixel ratio (once on a phone), renders one at a time. */
import { Keymap, Notice, Platform } from 'obsidian';
import type { Rect } from '../model/highlight';
import { markOwn } from '../dom';
import { cleanScannedQuote, normaliseRect } from '../model/highlight';
import { rectHeight, rectWidth, viewRectToPdf, isMatrix } from '../model/rects';
import { isPageView, targetElement } from '../internals';
import type { PageView, PdfViewerChild } from '../internals';
import { pageOf, textInRect, textItemsOf } from './selection';

export interface AreaResult {
  page: number;
  pageView: PageView;
  rect: Rect;
  quote: string;
  image: ArrayBuffer | null;
}

export interface AreaDeps {
  color(): string;
  onArea(result: AreaResult): void;
  log(message: string): void;
}

const MIN_SIZE = 6;
const MAX_PIXELS = 12_000_000;

export class AreaTool {
  private armed = false;
  private drawing: { pageEl: HTMLElement; pageView: PageView; box: HTMLElement; x0: number; y0: number; pointerId: number } | null = null;
  private renders: Promise<unknown> = Promise.resolve();
  private readonly controller = new AbortController();

  constructor(private readonly child: PdfViewerChild, private readonly container: HTMLElement, private readonly deps: AreaDeps) {}

  attach(): void {
    const { signal } = this.controller;
    this.container.addEventListener('pointerdown', (evt) => this.onDown(evt), { capture: true, signal });
    this.container.addEventListener('pointermove', (evt) => this.onMove(evt), { capture: true, signal });
    this.container.addEventListener('pointerup', (evt) => void this.onUp(evt), { capture: true, signal });
    this.container.addEventListener('pointercancel', () => this.cancel(), { capture: true, signal });
  }

  dispose(): void {
    this.controller.abort();
    this.cancel();
    this.disarm();
  }

  /* The next drag on a page draws a box. */
  arm(): void {
    this.armed = true;
    this.child.containerEl.addClass('icor-pdfa-armed');
    new Notice('Drag a box on the page to highlight an area. Escape cancels.');
  }

  disarm(): void {
    this.armed = false;
    this.child.containerEl.removeClass('icor-pdfa-armed');
  }

  get isArmed(): boolean {
    return this.armed;
  }

  private onDown(evt: PointerEvent): void {
    if (evt.button !== 0 || this.drawing) return;
    const wanted = this.armed || (evt.pointerType === 'mouse' && Keymap.isModifier(evt, 'Mod'));
    if (!wanted) return;
    const page = pageOf(targetElement(evt.target));
    if (!page) return;
    const pageView = this.child.getPage(page.page);
    if (!isPageView(pageView)) return;
    evt.preventDefault();
    evt.stopPropagation();
    const { x, y } = this.pagePoint(page.el, evt);
    const box = markOwn(page.el.createDiv({ cls: ['icor-pdfa-box', `is-${this.deps.color()}`] }));
    this.drawing = { pageEl: page.el, pageView, box, x0: x, y0: y, pointerId: evt.pointerId };
    this.draw(x, y);
    try {
      this.container.setPointerCapture(evt.pointerId);
    } catch {
      /* A pointer that is not active cannot be captured; the listeners on
         the container carry the drag either way. */
    }
  }

  private onMove(evt: PointerEvent): void {
    if (!this.drawing || evt.pointerId !== this.drawing.pointerId) return;
    evt.preventDefault();
    const { x, y } = this.pagePoint(this.drawing.pageEl, evt);
    this.draw(x, y);
  }

  private async onUp(evt: PointerEvent): Promise<void> {
    const d = this.drawing;
    if (!d || evt.pointerId !== d.pointerId) return;
    evt.preventDefault();
    evt.stopPropagation();
    const { x, y } = this.pagePoint(d.pageEl, evt);
    const view = normaliseRect([d.x0, d.y0, x, y]);
    this.cancel();
    this.disarm();
    if (rectWidth(view) < MIN_SIZE || rectHeight(view) < MIN_SIZE) return;
    const m = d.pageView.viewport.transform;
    if (!isMatrix(m)) return;
    const rect = viewRectToPdf(view, m);
    const items = textItemsOf(d.pageView);
    const quote = items ? cleanScannedQuote(textInRect(items, rect)) : '';
    const page = Number(d.pageEl.dataset.pageNumber);
    let image: ArrayBuffer | null = null;
    try {
      image = await this.render(d.pageView, rect);
    } catch (error) {
      this.deps.log(`area render failed: ${String(error)}`);
      new Notice('The area could not be rendered to an image; the highlight is saved without one.');
    }
    this.deps.onArea({ page, pageView: d.pageView, rect, quote, image });
  }

  cancel(): void {
    if (!this.drawing) return;
    this.drawing.box.remove();
    try {
      this.container.releasePointerCapture(this.drawing.pointerId);
    } catch {
      /* not captured */
    }
    this.drawing = null;
  }

  /* Client coordinates to the page's content box, in pixels. */
  private pagePoint(pageEl: HTMLElement, evt: { clientX: number; clientY: number }): { x: number; y: number } {
    const base = pageEl.getBoundingClientRect();
    const style = pageEl.win.getComputedStyle(pageEl);
    const bl = parseFloat(style.borderLeftWidth) || 0;
    const bt = parseFloat(style.borderTopWidth) || 0;
    const w = pageEl.clientWidth;
    const h = pageEl.clientHeight;
    return { x: Math.max(0, Math.min(w, evt.clientX - base.left - bl)), y: Math.max(0, Math.min(h, evt.clientY - base.top - bt)) };
  }

  private draw(x: number, y: number): void {
    const d = this.drawing;
    if (!d) return;
    const r = normaliseRect([d.x0, d.y0, x, y]);
    const w = d.pageEl.clientWidth || 1;
    const h = d.pageEl.clientHeight || 1;
    d.box.setCssStyles({ left: `${(r[0] / w) * 100}%`, top: `${(r[1] / h) * 100}%`, width: `${((r[2] - r[0]) / w) * 100}%`, height: `${((r[3] - r[1]) / h) * 100}%` });
  }

  /* The PNG of the region, rendered from the page, one render at a time. */
  private render(pageView: PageView, rect: Rect): Promise<ArrayBuffer | null> {
    const job = this.renders.then(() => this.renderNow(pageView, rect));
    this.renders = job.catch(() => null);
    return job;
  }

  private async renderNow(pageView: PageView, rect: Rect): Promise<ArrayBuffer | null> {
    const pdfPage = pageView.pdfPage;
    if (!pdfPage) return null;
    const win = pageView.div.win;
    const dpr = win.devicePixelRatio || 1;
    let scale = Platform.isPhone ? dpr : 2 * dpr;
    const pixels = rectWidth(rect) * rectHeight(rect) * scale * scale;
    if (pixels > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / pixels);
    const viewport = pdfPage.getViewport({ scale, rotation: pageView.viewport.rotation });
    const box = normaliseRect(viewport.convertToViewportRectangle(rect) as [number, number, number, number]);
    const width = Math.max(1, Math.round(box[2] - box[0]));
    const height = Math.max(1, Math.round(box[3] - box[1]));
    /* Any document's canvas serves an offscreen render. */
    const canvas = createEl('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.translate(-box[0], -box[1]);
    await pdfPage.render({ canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    this.deps.log(`area rendered: ${width} x ${height} at scale ${scale.toFixed(2)}`);
    return blob.arrayBuffer();
  }
}
