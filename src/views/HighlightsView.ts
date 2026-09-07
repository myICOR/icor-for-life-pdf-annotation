/* The right-sidebar panel "PDF highlights": the highlights of the PDF in
 * the most recently active PDF tab, grouped by page. A row shows the
 * colour, the page, the quote (three lines) or the image, and the first
 * line of the note; a click scrolls the PDF to the highlight and flashes
 * it (opening the PDF first when it is not open); the actions under the
 * row and the context menu change the colour, open the note, copy the
 * link or the embed, delete. The row drags onto a canvas. */
import { ItemView, Keymap, Menu, setIcon, setTooltip } from 'obsidian';
import type { TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE } from '../constants';
import { buttonLike, markOwn } from '../dom';
import { COLOR_NAMES, HIGHLIGHT_COLORS } from '../model/highlight';
import type { Highlight, HighlightColor } from '../model/highlight';
import type { HighlightStore, Unsubscribe } from '../store/HighlightStore';

export interface SidebarDeps {
  store: HighlightStore;
  openHighlight(h: Highlight, evt: MouseEvent | KeyboardEvent): void;
  openNote(h: Highlight): void;
  copyLink(h: Highlight): void;
  copyEmbed(h: Highlight): void;
  setColor(h: Highlight, color: HighlightColor): void;
  remove(h: Highlight): void;
  dragSource(el: HTMLElement, h: Highlight): void;
  imageUrl(h: Highlight): string | null;
  preview(h: Highlight): Promise<string>;
}

export const DISPLAY_TEXT = 'PDF highlights';
export const EMPTY_NO_PDF = 'Open a PDF to see its highlights here.';
export const EMPTY_NO_HIGHLIGHTS = 'No highlights in this PDF yet. Select text or hold Cmd and drag a box.';

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
    markOwn(this.contentEl).addClass('icor-pdfa-sidebar');
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
    body.createDiv({ cls: 'icor-pdfa-row-page', text: `Page ${h.page}${h.anchor === 'rect' ? ', area' : ''}` });
    const url = h.anchor === 'rect' ? this.deps.imageUrl(h) : null;
    if (url) {
      const img = body.createEl('img', { cls: 'icor-pdfa-row-thumb' });
      img.setAttribute('src', url);
      img.setAttribute('alt', h.quote || `Area on page ${h.page}`);
    }
    if (h.quote || !url) body.createDiv({ cls: 'icor-pdfa-row-quote', text: h.quote || `Area on page ${h.page}` });
    const note = body.createDiv({ cls: ['icor-pdfa-row-note', 'is-empty'] });
    void this.deps.preview(h).then((text) => {
      if (this.renderedFor !== (this.pdf?.path ?? null)) return;
      note.setText(text);
      note.toggleClass('is-empty', text.length === 0);
    });
    this.renderActions(body, h);
    setTooltip(row, 'Show in the PDF. Cmd-click opens the note.');
    buttonLike(row, h.quote || `Area on page ${h.page}`, (evt) => {
      if (Keymap.isModEvent(evt)) this.deps.openNote(h);
      else this.deps.openHighlight(h, evt);
    });
    row.addEventListener('contextmenu', (evt) => {
      evt.preventDefault();
      this.showMenu(h, evt);
    });
    this.deps.dragSource(row, h);
  }

  private renderActions(body: HTMLElement, h: Highlight): void {
    const actions = body.createDiv({ cls: 'icor-pdfa-row-actions' });
    /* Presses inside the actions must not open the highlight. */
    actions.addEventListener('click', (evt) => evt.stopPropagation());
    actions.addEventListener('keydown', (evt) => evt.stopPropagation());
    for (const color of HIGHLIGHT_COLORS) {
      const swatch = buttonLike(actions.createDiv({ cls: ['icor-pdfa-swatch', 'is-small', `is-${color}`] }), COLOR_NAMES[color], () => this.deps.setColor(h, color));
      swatch.toggleClass('is-selected', color === h.color);
      setTooltip(swatch, COLOR_NAMES[color]);
    }
    const button = (icon: string, label: string, onClick: () => void): void => {
      const el = buttonLike(actions.createDiv({ cls: 'clickable-icon' }), label, onClick);
      setIcon(el, icon);
      setTooltip(el, label);
    };
    button('file-text', 'Open note', () => this.deps.openNote(h));
    button('link', 'Copy highlight link', () => this.deps.copyLink(h));
    button('trash-2', 'Delete', () => this.deps.remove(h));
  }

  private showMenu(h: Highlight, evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('Show in the PDF').setIcon('file-search').onClick((e) => this.deps.openHighlight(h, e instanceof MouseEvent ? e : evt)));
    menu.addItem((item) => item.setTitle('Open note').setIcon('file-text').onClick(() => this.deps.openNote(h)));
    menu.addItem((item) => item.setTitle('Copy highlight link').setIcon('link').onClick(() => this.deps.copyLink(h)));
    menu.addItem((item) => item.setTitle('Copy embed').setIcon('copy').onClick(() => this.deps.copyEmbed(h)));
    menu.addSeparator();
    for (const color of HIGHLIGHT_COLORS) {
      menu.addItem((item) => item.setTitle(COLOR_NAMES[color]).setIcon(color === h.color ? 'check' : 'circle').onClick(() => this.deps.setColor(h, color)));
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('Delete').setIcon('trash-2').onClick(() => this.deps.remove(h)));
    menu.showAtMouseEvent(evt);
  }
}
