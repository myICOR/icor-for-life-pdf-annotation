/* The highlight card: in a highlight note, and in every embed and canvas
 * card of one, the quote block (the body's first line, block id `quote`)
 * is styled as a card with the highlight's colour and gets a source line
 * under it, a link back to the PDF page that opens the highlight; the
 * image line of a rect highlight is styled the same. A Markdown
 * post-processor does it, so reading view, embeds and canvas cards all
 * show it; the editor shows the plain blockquote. */
import { setIcon, setTooltip } from 'obsidian';
import type { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { firstContentLine, readHighlight } from '../model/highlight';
import type { Highlight } from '../model/highlight';
import { basename } from '../model/naming';

export interface CardDeps {
  openHighlight(h: Highlight, evt: MouseEvent | KeyboardEvent): void;
  dragSource(el: HTMLElement, h: Highlight): void;
}

const CARD_CLASS = 'icor-pdfa-card';
const SOURCE_CLASS = 'icor-pdfa-source';

export function sourceText(h: Highlight): string {
  return `${basename(h.sourceFile)}, page ${h.page}`;
}

function actionable(el: HTMLElement, onActivate: (evt: MouseEvent | KeyboardEvent) => void): void {
  el.setAttribute('role', 'link');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', (evt) => {
    evt.preventDefault();
    onActivate(evt);
  });
  el.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onActivate(evt);
    }
  });
}

/* True when `el` renders the first content line of the note (the quote
   line), or when the renderer gives no section information (a block
   embed of the quote alone). */
function isQuoteSection(el: HTMLElement, ctx: MarkdownPostProcessorContext): boolean {
  const info = ctx.getSectionInfo(el);
  if (!info) return true;
  return info.lineStart === firstContentLine(info.text);
}

export function renderCard(el: HTMLElement, h: Highlight, deps: CardDeps): void {
  el.addClass(CARD_CLASS, `is-${h.color}`);
  el.setAttribute('data-icor-highlight', h.id);
  const quote = el.querySelector('blockquote');
  if (quote) quote.addClass('icor-pdfa-quote');
  const source = el.createDiv({ cls: SOURCE_CLASS });
  setIcon(source.createSpan({ cls: 'icor-pdfa-source-icon' }), 'file-text');
  source.createSpan({ cls: 'icor-pdfa-source-text', text: sourceText(h) });
  setTooltip(source, 'Open the highlight in the PDF');
  actionable(source, (evt) => deps.openHighlight(h, evt));
  deps.dragSource(el, h);
}

export function registerHighlightCards(plugin: Plugin, deps: CardDeps): void {
  plugin.registerMarkdownPostProcessor((el, ctx) => {
    const h = readHighlight(ctx.frontmatter, ctx.sourcePath);
    if (!h) return;
    if (el.querySelector(`.${SOURCE_CLASS}`) || el.hasClass(CARD_CLASS)) return;
    const quote = el.querySelector('blockquote');
    if (quote && isQuoteSection(el, ctx)) {
      renderCard(el, h, deps);
      return;
    }
    /* The image line of a rect highlight: the embed right after the quote. */
    if (h.anchor === 'rect' && el.querySelector('.internal-embed')) {
      const info = ctx.getSectionInfo(el);
      const first = info ? firstContentLine(info.text) : -1;
      if (info && info.lineStart !== first + 1) return;
      el.addClass('icor-pdfa-image', `is-${h.color}`);
      deps.dragSource(el, h);
    }
  });
}
