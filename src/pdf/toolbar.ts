/* The floating toolbar: above a fresh text selection (the colours, copy
 * link, copy embed, add note) and above a clicked highlight (the colours
 * change it; copy link, copy embed, open note, delete). One element per
 * PDF view, inside the scrolling container so it scrolls with the page,
 * hidden by Escape, an outside press, or a collapsed selection. On a phone
 * it is the only path, since there is no context menu there. */
import { Platform, setIcon, setTooltip } from 'obsidian';
import { COLOR_NAMES, HIGHLIGHT_COLORS } from '../model/highlight';
import type { Highlight, HighlightColor } from '../model/highlight';
import { buttonLike, markOwn } from '../dom';
import { targetElement } from '../internals';

export type ToolbarMode = { kind: 'new'; color: HighlightColor } | { kind: 'existing'; highlight: Highlight };

export interface ToolbarActions {
  pickColor(color: HighlightColor): void;
  copyLink(): void;
  copyEmbed(): void;
  note(): void;
  remove(): void;
}

export const TOOLBAR_CLASS = 'icor-pdfa-toolbar';
const MARGIN = 8;

export class SelectionToolbar {
  readonly el: HTMLElement;
  private mode: ToolbarMode | null = null;
  private readonly swatches = new Map<HighlightColor, HTMLElement>();
  private noteButton!: HTMLElement;
  private deleteButton!: HTMLElement;

  constructor(private readonly container: HTMLElement, private readonly actions: ToolbarActions) {
    this.el = markOwn(container.createDiv({ cls: [TOOLBAR_CLASS, 'is-hidden'] }));
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', 'Highlight');
    /* A press on the toolbar must not collapse the selection it acts on. */
    this.el.addEventListener('pointerdown', (evt) => evt.preventDefault());
    this.el.addEventListener('mousedown', (evt) => evt.preventDefault());
    this.build();
  }

  private build(): void {
    for (const color of HIGHLIGHT_COLORS) {
      /* A div, not a button: the theme restyles plain buttons as ink. */
      const swatch = buttonLike(this.el.createDiv({ cls: ['icor-pdfa-swatch', `is-${color}`] }), COLOR_NAMES[color], () => this.actions.pickColor(color));
      setTooltip(swatch, COLOR_NAMES[color]);
      this.swatches.set(color, swatch);
    }
    this.el.createDiv({ cls: 'icor-pdfa-toolbar-divider' });
    this.button('link', 'Copy highlight link', () => this.actions.copyLink());
    this.button('copy', 'Copy embed', () => this.actions.copyEmbed());
    this.noteButton = this.button('sticky-note', 'Add note', () => this.actions.note());
    this.deleteButton = this.button('trash-2', 'Delete', () => this.actions.remove());
  }

  private button(icon: string, label: string, onClick: () => void): HTMLElement {
    const button = buttonLike(this.el.createDiv({ cls: ['icor-pdfa-tool', 'clickable-icon'] }), label, onClick);
    setIcon(button, icon);
    setTooltip(button, label);
    return button;
  }

  get visible(): boolean {
    return !this.el.hasClass('is-hidden');
  }

  currentMode(): ToolbarMode | null {
    return this.mode;
  }

  /* Shows the toolbar above `anchor` (client coordinates), inside the
     scrolling container. */
  show(mode: ToolbarMode, anchor: DOMRect): void {
    this.mode = mode;
    const selected = mode.kind === 'new' ? mode.color : mode.highlight.color;
    for (const [color, swatch] of this.swatches) swatch.toggleClass('is-selected', color === selected);
    const existing = mode.kind === 'existing';
    setTooltip(this.noteButton, existing ? 'Open note' : 'Add note');
    this.noteButton.setAttribute('aria-label', existing ? 'Open note' : 'Add note');
    setIcon(this.noteButton, existing ? 'file-text' : 'sticky-note');
    this.deleteButton.toggleClass('is-hidden', !existing);
    this.el.removeClass('is-hidden');
    this.position(anchor);
  }

  hide(): void {
    this.mode = null;
    this.el.addClass('is-hidden');
  }

  contains(target: EventTarget | null): boolean {
    const el = targetElement(target);
    return !!el && this.el.contains(el);
  }

  private position(anchor: DOMRect): void {
    const box = this.container.getBoundingClientRect();
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    /* Above the selection; on a phone the OS callout sits below it. */
    let top = anchor.top - box.top + this.container.scrollTop - height - MARGIN;
    if (top < this.container.scrollTop + MARGIN && !Platform.isPhone) top = anchor.bottom - box.top + this.container.scrollTop + MARGIN;
    let left = anchor.left - box.left + this.container.scrollLeft + anchor.width / 2 - width / 2;
    const maxLeft = this.container.scrollLeft + this.container.clientWidth - width - MARGIN;
    left = Math.max(this.container.scrollLeft + MARGIN, Math.min(left, maxLeft));
    this.el.setCssStyles({ top: `${Math.round(top)}px`, left: `${Math.round(left)}px` });
  }
}
