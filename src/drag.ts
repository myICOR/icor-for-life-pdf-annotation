/* Every drag this plugin starts: a highlight note as a file draggable, the
 * way the file explorer drags a note, with the block the dropped card
 * should show. A canvas gets a card of that block (src/canvas/drop.ts);
 * an editor gets a link, from core's own handling of a file draggable. */
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { DRAG_SOURCE } from './constants';
import { dragManager } from './internals';
import type { Highlight } from './model/highlight';
import { blockId } from './model/links';

/* `#^image` for a rect highlight with an image, `#^quote` otherwise. */
export function dropSubpath(h: Highlight): string {
  return `#^${blockId(h)}`;
}

/* Makes `el` a drag source for the highlight's note. Returns false, with
   the feature degraded once, when the drag manager is not there. */
export function makeDragSource(app: App, el: HTMLElement, highlight: () => Highlight | null): boolean {
  const manager = dragManager(app, ['handleDrag', 'dragFile'], 'Drag a highlight');
  if (!manager) return false;
  manager.handleDrag(el, (evt) => {
    const h = highlight();
    if (!h) return null;
    const file = app.vault.getFileByPath(h.notePath);
    if (!(file instanceof TFile)) return null;
    return { ...manager.dragFile(evt, file, DRAG_SOURCE), subpath: dropSubpath(h) };
  });
  return true;
}
