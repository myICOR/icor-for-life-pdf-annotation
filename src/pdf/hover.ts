/* The hover card: the first lines of the note under the pointer's
 * highlight, shown after a short rest, hidden when the pointer leaves. One
 * element per PDF view inside the scrolling container. Mouse only; touch
 * has no hover. */
import { debounce } from 'obsidian';
import type { Highlight } from '../model/highlight';

export interface HoverDeps {
  enabled(): boolean;
  preview(h: Highlight): Promise<string>;
}

const MARGIN = 6;

export class HoverCards {
  readonly el: HTMLElement;
  private current: string | null = null;
  private readonly show = debounce((h: Highlight, rect: DOMRect) => void this.render(h, rect), 250, true);

  constructor(private readonly container: HTMLElement, private readonly deps: HoverDeps) {
    this.el = container.createDiv({ cls: ['icor-pdfa-hover', 'is-hidden'] });
    this.el.setAttribute('role', 'tooltip');
  }

  enter(h: Highlight, target: HTMLElement, evt: PointerEvent): void {
    if (!this.deps.enabled() || evt.pointerType === 'touch') return;
    this.current = h.id;
    this.show(h, target.getBoundingClientRect());
  }

  leave(): void {
    this.current = null;
    this.show.cancel();
    this.el.addClass('is-hidden');
  }

  dispose(): void {
    this.show.cancel();
    this.el.remove();
  }

  private async render(h: Highlight, rect: DOMRect): Promise<void> {
    const text = await this.deps.preview(h);
    if (this.current !== h.id) return;
    this.el.empty();
    if (text.length > 0) this.el.createDiv({ cls: 'icor-pdfa-hover-note', text });
    else this.el.createDiv({ cls: 'icor-pdfa-hover-empty', text: 'No note yet. Click the highlight to add one.' });
    this.el.removeClass('is-hidden');
    const box = this.container.getBoundingClientRect();
    const top = rect.bottom - box.top + this.container.scrollTop + MARGIN;
    let left = rect.left - box.left + this.container.scrollLeft;
    const maxLeft = this.container.scrollLeft + this.container.clientWidth - this.el.offsetWidth - MARGIN;
    left = Math.max(this.container.scrollLeft + MARGIN, Math.min(left, maxLeft));
    this.el.setCssStyles({ top: `${Math.round(top)}px`, left: `${Math.round(left)}px` });
  }
}
