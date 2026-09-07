/* The painted highlights: one absolute layer per rendered page, a child of
 * the page element, re-inserted on every `pagerendered` (a zoom re-render
 * resets the page and strips it) and repainted when the store changes.
 * Each rectangle is positioned in percent of the page box through the
 * viewport transform, so it follows the page between renders. Rectangles
 * take pointer events (click, hover, drag); the layer itself lets clicks
 * through to the text layer. */
import type { Highlight, Rect } from '../model/highlight';
import { pdfRectToView, isMatrix } from '../model/rects';
import { markOwn } from '../dom';
import { isPageView } from '../internals';
import type { ObsidianViewer, PageView, PdfEventBus, PdfViewerChild } from '../internals';
import type { HighlightStore } from '../store/HighlightStore';

export const LAYER_CLASS = 'icor-pdfa-layer';
export const RECT_CLASS = 'icor-pdfa-rect';
export const HIGHLIGHT_ATTR = 'data-icor-highlight';

export interface LayerDeps {
  store: HighlightStore;
  pdfPath(): string | null;
  onRectClick(h: Highlight, el: HTMLElement, evt: MouseEvent): void;
  onRectEnter(h: Highlight, el: HTMLElement, evt: PointerEvent): void;
  onRectLeave(h: Highlight, el: HTMLElement): void;
  dragSource(el: HTMLElement, h: Highlight): void;
  log(message: string): void;
}

function percent(n: number, of: number): string {
  return `${((n / of) * 100).toFixed(4)}%`;
}

export class HighlightLayer {
  private readonly bus: PdfEventBus;
  private readonly onRendered = (evt: unknown): void => {
    const source = (evt as { source?: unknown } | null)?.source;
    if (isPageView(source)) {
      this.paint(source);
      this.revealPending(source);
    }
  };
  private unsubscribe: (() => void) | null = null;
  private pending: string | null = null;

  constructor(private readonly child: PdfViewerChild, private readonly viewer: ObsidianViewer, bus: PdfEventBus, private readonly deps: LayerDeps) {
    this.bus = bus;
  }

  attach(): void {
    this.bus.on('pagerendered', this.onRendered);
    this.unsubscribe = this.deps.store.subscribe(() => this.paintAll());
    this.paintAll();
  }

  dispose(): void {
    this.bus.off('pagerendered', this.onRendered);
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const page of this.loadedPages()) page.div.querySelector(`:scope > .${LAYER_CLASS}`)?.remove();
  }

  /* Every page that has rendered. */
  loadedPages(): PageView[] {
    const out: PageView[] = [];
    const count = this.viewer.pdfViewer.pagesCount;
    for (let i = 1; i <= count; i++) {
      const page = this.child.getPage(i);
      if (isPageView(page) && page.div.dataset.loaded) out.push(page);
    }
    return out;
  }

  paintAll(): void {
    for (const page of this.loadedPages()) this.paint(page);
  }

  paint(page: PageView): void {
    const pdfPath = this.deps.pdfPath();
    let layer = page.div.querySelector<HTMLElement>(`:scope > .${LAYER_CLASS}`);
    if (!layer) layer = markOwn(page.div.createDiv({ cls: LAYER_CLASS }));
    layer.empty();
    if (!pdfPath) return;
    const m = page.viewport.transform;
    if (!isMatrix(m)) return;
    const { width, height } = page.viewport;
    if (!(width > 0) || !(height > 0)) return;
    for (const h of this.deps.store.forPage(pdfPath, page.id)) {
      for (const rect of h.rects) this.place(layer, h, rect, m, width, height);
    }
  }

  private place(layer: HTMLElement, h: Highlight, rect: Rect, m: number[], width: number, height: number): void {
    const [x0, y0, x1, y1] = pdfRectToView(rect, m as [number, number, number, number, number, number]);
    const el = layer.createDiv({ cls: [RECT_CLASS, `is-${h.color}`] });
    el.setAttribute(HIGHLIGHT_ATTR, h.id);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-label', h.quote ? `Highlight: ${h.quote.slice(0, 80)}` : `Area highlight on page ${h.page}`);
    el.setCssStyles({ left: percent(x0, width), top: percent(y0, height), width: percent(x1 - x0, width), height: percent(y1 - y0, height) });
    el.addEventListener('click', (evt) => {
      evt.stopPropagation();
      this.deps.onRectClick(h, el, evt);
    });
    el.addEventListener('pointerenter', (evt) => this.deps.onRectEnter(h, el, evt));
    el.addEventListener('pointerleave', () => this.deps.onRectLeave(h, el));
    this.deps.dragSource(el, h);
  }

  /* The rectangles of a highlight on the rendered pages. */
  elementsOf(id: string): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const page of this.loadedPages()) {
      for (const el of Array.from(page.div.querySelectorAll<HTMLElement>(`:scope > .${LAYER_CLASS} > [${HIGHLIGHT_ATTR}="${id}"]`))) out.push(el);
    }
    return out;
  }

  /* Scrolls the first rectangle into view and pulses every one for two
     seconds; when the page has not rendered yet, does so once it has. */
  reveal(h: Highlight): void {
    const els = this.elementsOf(h.id);
    if (els.length === 0) {
      this.pending = h.id;
      return;
    }
    this.pending = null;
    els[0]?.scrollIntoView({ block: 'center', inline: 'nearest' });
    for (const el of els) this.flash(el);
  }

  flash(el: HTMLElement): void {
    el.removeClass('is-flashing');
    /* A reflow between the remove and the add restarts the animation. */
    void el.offsetWidth;
    el.addClass('is-flashing');
    el.addEventListener('animationend', () => el.removeClass('is-flashing'), { once: true });
  }

  private revealPending(page: PageView): void {
    if (!this.pending) return;
    const id = this.pending;
    const pdfPath = this.deps.pdfPath();
    if (!pdfPath) return;
    const h = this.deps.store.forPage(pdfPath, page.id).find((x) => x.id === id);
    if (h) this.reveal(h);
  }

  setActive(id: string | null): void {
    for (const page of this.loadedPages()) {
      for (const el of Array.from(page.div.querySelectorAll<HTMLElement>(`:scope > .${LAYER_CLASS} > .${RECT_CLASS}`))) {
        el.toggleClass('is-active', id !== null && el.getAttribute(HIGHLIGHT_ATTR) === id);
      }
    }
  }
}
