/* The right-sidebar view: the highlights of the PDF in the most recently
 * active PDF tab, grouped by page. A row shows the colour, the quote or
 * the image, and the first lines of the note; a click opens the highlight
 * in the PDF, the button opens the note, and the row drags onto a canvas. */
import { ItemView, Keymap, setIcon, setTooltip } from 'obsidian';
import type { TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE } from '../constants';
import type { Highlight } from '../model/highlight';
import type { HighlightStore, Unsubscribe } from '../store/HighlightStore';

export interface SidebarDeps {
  store: HighlightStore;
  openHighlight(h: Highlight, evt: MouseEvent | KeyboardEvent): void;
  openNote(h: Highlight, evt: MouseEvent | KeyboardEvent): void;
  dragSource(el: HTMLElement, h: Highlight): void;
  imageUrl(h: Highlight): string | null;
  preview(h: Highlight): Promise<string>;
}

export const DISPLAY_TEXT = 'PDF highlights';
export const EMPTY_NO_PDF = 'Open a PDF to see its highlights here.';
export const EMPTY_NO_HIGHLIGHTS = 'No highlights on this PDF yet. Select text in it to make one.';

function actionable(el: HTMLElement, onActivate: (evt: MouseEvent | KeyboardEvent) => void): void {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', (evt) => onActivate(evt));
  el.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onActivate(evt);
    }
  });
}

export class HighlightsView extends ItemView {
  private pdf: TFile | null = null;
  private unsubscribe: Unsubscribe | null = null;
  private renderedFor: string | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly deps: SidebarDeps) {
    super(leaf);
    this.navigation = false;
  }

  override getViewType(): string {
    return VIEW_TYPE;
  }

  override getDisplayText(): string {
    return DISPLAY_TEXT;
  }

  override getIcon(): string {
    return 'highlighter';
  }

  override async onOpen(): Promise<void> {
    this.contentEl.addClass('icor-pdfa-sidebar');
    this.unsubscribe = this.deps.store.subscribe(() => this.render());
    this.render();
    return Promise.resolve();
  }

  override async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    return Promise.resolve();
  }

  /* The PDF whose highlights the view lists; null keeps the last one. */
  setPdf(file: TFile | null): void {
    if (!file || file === this.pdf) return;
    this.pdf = file;
    this.render();
  }

  currentPdf(): TFile | null {
    return this.pdf;
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.renderedFor = this.pdf?.path ?? null;
    const header = contentEl.createDiv({ cls: 'icor-pdfa-sidebar-header' });
    if (!this.pdf) {
      header.setText(DISPLAY_TEXT);
      contentEl.createDiv({ cls: 'icor-pdfa-empty', text: EMPTY_NO_PDF });
      return;
    }
    header.setText(this.pdf.basename);
    const highlights = this.deps.store.forPdf(this.pdf.path);
    if (highlights.length === 0) {
      contentEl.createDiv({ cls: 'icor-pdfa-empty', text: EMPTY_NO_HIGHLIGHTS });
      return;
    }
    const list = contentEl.createDiv({ cls: 'icor-pdfa-list' });
    let page = 0;
    for (const h of highlights) {
      if (h.page !== page) {
        page = h.page;
        list.createDiv({ cls: 'icor-pdfa-page', text: `Page ${page}` });
      }
      this.renderRow(list, h);
    }
  }

  private renderRow(list: HTMLElement, h: Highlight): void {
    const row = list.createDiv({ cls: ['icor-pdfa-row', `is-${h.color}`] });
    row.setAttribute('data-icor-highlight', h.id);
    row.createSpan({ cls: 'icor-pdfa-dot' });
    const body = row.createDiv({ cls: 'icor-pdfa-row-body' });
    const url = h.anchor === 'rect' ? this.deps.imageUrl(h) : null;
    if (url) {
      const img = body.createEl('img', { cls: 'icor-pdfa-row-thumb' });
      img.setAttribute('src', url);
      img.setAttribute('alt', h.quote || `Area on page ${h.page}`);
    } else {
      body.createDiv({ cls: 'icor-pdfa-row-quote', text: h.quote || `Area on page ${h.page}` });
    }
    const note = body.createDiv({ cls: 'icor-pdfa-row-note' });
    void this.deps.preview(h).then((text) => {
      if (this.renderedFor !== (this.pdf?.path ?? null)) return;
      note.setText(text);
      note.toggleClass('is-empty', text.length === 0);
    });
    const open = row.createEl('button', { cls: ['icor-pdfa-row-open', 'clickable-icon'] });
    setIcon(open, 'file-text');
    setTooltip(open, 'Open the note');
    open.setAttribute('aria-label', 'Open the note');
    open.addEventListener('click', (evt) => {
      evt.stopPropagation();
      this.deps.openNote(h, evt);
    });
    setTooltip(row, 'Show in the PDF. Drag onto a canvas for a card.');
    actionable(row, (evt) => {
      if (Keymap.isModEvent(evt)) this.deps.openNote(h, evt);
      else this.deps.openHighlight(h, evt);
    });
    this.deps.dragSource(row, h);
  }
}
