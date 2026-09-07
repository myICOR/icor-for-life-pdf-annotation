/* Every open PDF view, wired once. A sweep runs at layout-ready and on
 * every layout or active-leaf change and binds the PDF views it has not
 * seen, once their viewer has loaded (`view.viewer.then`); a binding lives
 * as long as its view or until the plugin unloads. Each feature is bound
 * only when the private members it needs are present (src/internals.ts),
 * so a missing one costs that feature and nothing else. Version 0.1.0
 * binds the main PDF view only; PDF embeds in notes and on canvas cards
 * are a different component and stay unpainted. */
import { Notice } from 'obsidian';
import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import { makeDragSource } from '../drag';
import { asPdfView, eventBusOf, isHtmlElement, requireChild, requireViewer, targetElement, whenViewerReady } from '../internals';
import type { ObsidianViewer, PdfEventBus, PdfView, PdfViewerChild } from '../internals';
import { degrade } from '../log';
import { HIGHLIGHT_COLORS } from '../model/highlight';
import type { Highlight, HighlightColor } from '../model/highlight';
import { basename } from '../model/naming';
import type { PdfaSettings } from '../settings/model';
import type { HighlightStore } from '../store/HighlightStore';
import type { HighlightWriter } from '../store/HighlightWriter';
import { AreaTool } from './area';
import type { AreaResult } from './area';
import { confirmDelete } from './confirm';
import { HoverCards } from './hover';
import { HighlightLayer, RECT_CLASS } from './layer';
import { readSelection } from './selection';
import { SelectionToolbar } from './toolbar';

export interface RegistryHost {
  app: App;
  store: HighlightStore;
  writer: HighlightWriter;
  settings(): PdfaSettings;
  rememberColor(color: HighlightColor): void;
  openNote(h: Highlight): void;
  copyLink(h: Highlight): void;
  copyEmbed(h: Highlight): void;
  preview(h: Highlight): Promise<string>;
  log(message: string): void;
}

export type AfterHighlight = 'none' | 'copy' | 'note' | 'embed';

export interface PdfBinding {
  view: PdfView;
  child: PdfViewerChild;
  viewer: ObsidianViewer;
  bus: PdfEventBus;
  container: HTMLElement;
  layer: HighlightLayer | null;
  toolbar: SelectionToolbar | null;
  hover: HoverCards | null;
  area: AreaTool | null;
  /* The highlight last clicked in this view. */
  current: Highlight | null;
  anchor: DOMRect | null;
  controller: AbortController;
}

const FEATURE = 'PDF highlights';

export class PdfRegistry {
  private readonly bindings = new Map<PdfView, PdfBinding>();
  private readonly waiting = new WeakSet<PdfView>();
  private lastActive: PdfBinding | null = null;
  private pendingReveal: Highlight | null = null;

  constructor(private readonly host: RegistryHost) {}

  sweep(): void {
    for (const leaf of this.host.app.workspace.getLeavesOfType('pdf')) {
      const view = asPdfView(leaf.view);
      if (!view || this.bindings.has(view) || this.waiting.has(view)) continue;
      this.waiting.add(view);
      whenViewerReady(view, (child) => {
        this.waiting.delete(view);
        if (!this.bindings.has(view)) this.bind(view, child);
      });
    }
    const recent = asPdfView(this.host.app.workspace.getMostRecentLeaf()?.view);
    const binding = recent ? this.bindings.get(recent) : null;
    if (binding) this.lastActive = binding;
  }

  applySettings(): void {
    for (const binding of this.bindings.values()) {
      if (!this.host.settings().selectionToolbar && binding.toolbar?.currentMode()?.kind === 'new') binding.toolbar.hide();
    }
  }

  disposeAll(): void {
    for (const view of [...this.bindings.keys()]) this.unbind(view);
  }

  /* The binding of the PDF view in the most recently focused leaf, else
     the last one that was. */
  active(): PdfBinding | null {
    const view = asPdfView(this.host.app.workspace.getMostRecentLeaf()?.view);
    const binding = view ? this.bindings.get(view) : null;
    if (binding) return binding;
    return this.lastActive && this.bindings.has(this.lastActive.view) ? this.lastActive : null;
  }

  activePdfFile(): TFile | null {
    return this.active()?.view.file ?? asPdfView(this.host.app.workspace.getMostRecentLeaf()?.view)?.file ?? null;
  }

  leafShowing(pdf: TFile): WorkspaceLeaf | null {
    for (const leaf of this.host.app.workspace.getLeavesOfType('pdf')) {
      const view = asPdfView(leaf.view);
      if (view?.file === pdf) return leaf;
    }
    return null;
  }

  /* Scrolls to and flashes the highlight in the view that shows its PDF,
     now or once that view has been wired and its page rendered. */
  reveal(h: Highlight): void {
    const pdf = this.host.store.pdfFileOf(h);
    for (const binding of this.bindings.values()) {
      if (pdf && binding.view.file === pdf && binding.layer) {
        this.pendingReveal = null;
        binding.layer.reveal(h);
        return;
      }
    }
    this.pendingReveal = h;
  }

  currentHighlight(): Highlight | null {
    const binding = this.active();
    if (!binding) return null;
    const mode = binding.toolbar?.currentMode();
    if (mode?.kind === 'existing') return this.host.store.byId(mode.highlight.id) ?? mode.highlight;
    return binding.current ? (this.host.store.byId(binding.current.id) ?? binding.current) : null;
  }

  canHighlightSelection(): boolean {
    const binding = this.active();
    return !!binding && readSelection(binding.child, binding.container.win) !== null;
  }

  async highlightSelection(color: HighlightColor, then: AfterHighlight): Promise<void> {
    const binding = this.active();
    if (!binding) return;
    const info = readSelection(binding.child, binding.container.win);
    const pdf = binding.view.file;
    if (!info || !pdf) {
      new Notice('Select some text in the document first.');
      return;
    }
    try {
      const { highlight } = await this.host.writer.create({ pdf, page: info.page, anchor: 'selection', color, quote: info.quote, selection: info.selection, rects: info.rects });
      this.host.store.insert(highlight);
      this.host.rememberColor(color);
      binding.container.win.getSelection()?.removeAllRanges();
      binding.toolbar?.hide();
      binding.current = highlight;
      this.after(highlight, then, 'Highlight saved.');
    } catch (error) {
      this.host.log(`highlight failed: ${String(error)}`);
      new Notice(`Could not save the highlight: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async confirmDelete(h: Highlight): Promise<void> {
    if (!(await confirmDelete(this.host.app, basename(h.notePath)))) return;
    try {
      await this.host.writer.delete(h);
      this.host.store.remove(h.notePath);
      for (const binding of this.bindings.values()) {
        if (binding.current?.id === h.id) binding.current = null;
        if (binding.toolbar?.currentMode()?.kind === 'existing') binding.toolbar.hide();
      }
      new Notice('Highlight deleted.');
    } catch (error) {
      this.host.log(`delete failed: ${String(error)}`);
      new Notice(`Could not delete the highlight: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cycleColor(h: Highlight): Promise<void> {
    const next = HIGHLIGHT_COLORS[(HIGHLIGHT_COLORS.indexOf(h.color) + 1) % HIGHLIGHT_COLORS.length] ?? h.color;
    await this.setColor(h, next);
  }

  async setColor(h: Highlight, color: HighlightColor): Promise<void> {
    try {
      await this.host.writer.setColor(h, color);
      const updated = { ...h, color };
      this.host.store.insert(updated);
      this.host.rememberColor(color);
      for (const binding of this.bindings.values()) {
        if (binding.current?.id === h.id) binding.current = updated;
        const mode = binding.toolbar?.currentMode();
        if (mode?.kind === 'existing' && mode.highlight.id === h.id && binding.anchor) binding.toolbar?.show({ kind: 'existing', highlight: updated }, binding.anchor);
      }
    } catch (error) {
      this.host.log(`recolour failed: ${String(error)}`);
      new Notice(`Could not change the colour: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private after(h: Highlight, then: AfterHighlight, saved: string): void {
    switch (then) {
      case 'copy':
        this.host.copyLink(h);
        return;
      case 'embed':
        this.host.copyEmbed(h);
        return;
      case 'note':
        this.host.openNote(h);
        return;
      default:
        new Notice(saved);
    }
  }

  private bind(view: PdfView, child: PdfViewerChild): void {
    const { app, store } = this.host;
    const log = (message: string): void => this.host.log(message);
    if (!requireChild(child, ['containerEl', 'pdfViewer', 'getPage'], FEATURE)) return;
    const viewer = child.pdfViewer;
    if (!requireViewer(viewer, ['eventBus', 'pdfViewer', 'dom'], FEATURE)) return;
    const bus = eventBusOf(viewer);
    if (!bus) {
      degrade(`${FEATURE}: pdf viewer.pdfViewer.eventBus.on`);
      return;
    }
    const container = viewer.dom?.viewerContainerEl;
    if (!isHtmlElement(container)) {
      degrade(`${FEATURE}: pdf viewer.pdfViewer.dom.viewerContainerEl`);
      return;
    }
    const binding: PdfBinding = { view, child, viewer, bus, container, layer: null, toolbar: null, hover: null, area: null, current: null, anchor: null, controller: new AbortController() };
    const settings = (): PdfaSettings => this.host.settings();
    binding.hover = new HoverCards(container, { enabled: () => settings().hoverCards, preview: (h) => this.host.preview(h) });
    binding.layer = new HighlightLayer(child, viewer, bus, {
      store,
      pdfPath: () => view.file?.path ?? null,
      onRectClick: (h, el) => this.onRectClick(binding, h, el),
      onRectEnter: (h, el, evt) => binding.hover?.enter(h, el, evt),
      onRectLeave: () => binding.hover?.leave(),
      dragSource: (el, h) => makeDragSource(app, el, () => store.byId(h.id) ?? h),
      log,
    });
    binding.layer.attach();
    binding.toolbar = new SelectionToolbar(container, {
      pickColor: (color) => void this.onPickColor(binding, color),
      copyLink: () => this.onToolbarAction(binding, 'copy'),
      copyEmbed: () => this.onToolbarAction(binding, 'embed'),
      note: () => this.onToolbarAction(binding, 'note'),
      remove: () => {
        const mode = binding.toolbar?.currentMode();
        if (mode?.kind === 'existing') void this.confirmDelete(mode.highlight);
      },
    });
    /* The area tool needs the page proxy for the crop; it degrades to a
       highlight without an image when that is missing, not to nothing. */
    binding.area = new AreaTool(child, container, {
      color: () => settings().lastColor,
      onArea: (result) => void this.onArea(binding, result),
      log,
    });
    binding.area.attach();
    this.wireSelection(binding);
    this.bindings.set(binding.view, binding);
    view.register(() => this.unbind(view));
    log(`pdf wired: ${view.file?.path ?? '(no file)'}`);
    if (this.pendingReveal && view.file && store.pdfFileOf(this.pendingReveal) === view.file) {
      const h = this.pendingReveal;
      this.pendingReveal = null;
      binding.layer.reveal(h);
    }
  }

  private wireSelection(binding: PdfBinding): void {
    const { container, controller } = binding;
    const { signal } = controller;
    const check = (): void => {
      container.win.requestAnimationFrame(() => this.checkSelection(binding));
    };
    container.addEventListener('pointerup', check, { signal });
    container.doc.addEventListener('selectionchange', check, { signal });
    container.addEventListener(
      'pointerdown',
      (evt) => {
        if (binding.toolbar?.contains(evt.target)) return;
        if (targetElement(evt.target)?.closest(`.${RECT_CLASS}`)) return;
        if (binding.toolbar?.currentMode()?.kind === 'existing') {
          binding.toolbar.hide();
          binding.layer?.setActive(null);
        }
      },
      { signal },
    );
    container.doc.addEventListener(
      'keydown',
      (evt) => {
        if (evt.key !== 'Escape') return;
        binding.toolbar?.hide();
        binding.layer?.setActive(null);
        binding.area?.cancel();
        binding.area?.disarm();
      },
      { signal },
    );
  }

  private checkSelection(binding: PdfBinding): void {
    const { toolbar } = binding;
    if (!toolbar || !this.bindings.has(binding.view)) return;
    if (toolbar.currentMode()?.kind === 'existing') return;
    const info = readSelection(binding.child, binding.container.win);
    if (!info) {
      if (toolbar.currentMode()?.kind === 'new') toolbar.hide();
      return;
    }
    if (!this.host.settings().selectionToolbar) return;
    const rects = info.range.getClientRects();
    const anchor = rects.length > 0 ? (rects[0] as DOMRect) : info.range.getBoundingClientRect();
    binding.anchor = anchor;
    toolbar.show({ kind: 'new', color: this.host.settings().lastColor }, anchor);
  }

  private onRectClick(binding: PdfBinding, h: Highlight, el: HTMLElement): void {
    const latest = this.host.store.byId(h.id) ?? h;
    binding.current = latest;
    binding.anchor = el.getBoundingClientRect();
    binding.layer?.setActive(latest.id);
    binding.hover?.leave();
    binding.toolbar?.show({ kind: 'existing', highlight: latest }, binding.anchor);
  }

  private async onPickColor(binding: PdfBinding, color: HighlightColor): Promise<void> {
    const mode = binding.toolbar?.currentMode();
    if (!mode) return;
    if (mode.kind === 'existing') await this.setColor(mode.highlight, color);
    else await this.highlightSelection(color, 'none');
  }

  private onToolbarAction(binding: PdfBinding, then: AfterHighlight): void {
    const mode = binding.toolbar?.currentMode();
    if (!mode) return;
    if (mode.kind === 'existing') {
      const h = this.host.store.byId(mode.highlight.id) ?? mode.highlight;
      this.after(h, then, '');
      return;
    }
    void this.highlightSelection(mode.color, then);
  }

  private async onArea(binding: PdfBinding, result: AreaResult): Promise<void> {
    const pdf = binding.view.file;
    if (!pdf) return;
    try {
      const { highlight } = await this.host.writer.create({ pdf, page: result.page, anchor: 'rect', color: this.host.settings().lastColor, quote: result.quote, selection: null, rects: [result.rect], image: result.image });
      this.host.store.insert(highlight);
      binding.current = highlight;
      new Notice(result.image ? 'Area highlight saved with its image.' : 'Area highlight saved.');
      const el = binding.layer?.elementsOf(highlight.id)[0];
      if (el) this.onRectClick(binding, highlight, el);
    } catch (error) {
      this.host.log(`area highlight failed: ${String(error)}`);
      new Notice(`Could not save the area highlight: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private unbind(view: PdfView): void {
    const binding = this.bindings.get(view);
    if (!binding) return;
    this.bindings.delete(view);
    if (this.lastActive === binding) this.lastActive = null;
    binding.controller.abort();
    binding.area?.dispose();
    binding.toolbar?.el.remove();
    binding.hover?.dispose();
    binding.layer?.dispose();
    this.host.log(`pdf released: ${view.file?.path ?? '(no file)'}`);
  }
}
