/* The mark every root element this plugin creates carries: the INKLINE
 * theme styles plain buttons and inputs as ink, and exempts an element
 * (and everything under it) that names the suite plugin it belongs to.
 * The attribute is the theme's own escape hatch for suite plugins. */
import { PLUGIN_ID } from './constants';

export const OWN_ATTR = 'data-ink-plugin';

export function markOwn<T extends HTMLElement>(el: T): T {
  el.setAttribute(OWN_ATTR, PLUGIN_ID);
  return el;
}

/* A div that acts as a button: role, tab stop, Enter and Space. */
export function buttonLike(el: HTMLElement, label: string, onActivate: (evt: MouseEvent | KeyboardEvent) => void): HTMLElement {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', label);
  el.addEventListener('click', (evt) => onActivate(evt));
  el.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      onActivate(evt);
    }
  });
  return el;
}
