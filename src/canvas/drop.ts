/* A highlight dropped on a canvas becomes a card that shows one block of
 * the note: the quote, or the image. Core's own drop makes a card of the
 * whole file and ignores any subpath, so this plugin takes the drop first:
 * a capture-phase listener on every canvas view's content element, which
 * runs before core's listener on the wrapper, acts only when the drag in
 * flight is this plugin's, and leaves every other drop to core. */
import { TFile } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { DRAG_SOURCE } from '../constants';
import { asCanvasView, ownDraggable, requireCanvas } from '../internals';
import type { CanvasView } from '../internals';

export class CanvasDrops {
  private readonly bound = new WeakSet<CanvasView>();

  constructor(private readonly plugin: Plugin, private readonly app: App, private readonly log: (message: string) => void) {}

  sweep(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
      const view = asCanvasView(leaf.view);
      if (view && !this.bound.has(view)) this.bind(view);
    }
  }

  private bind(view: CanvasView): void {
    this.bound.add(view);
    const onDrop = (evt: DragEvent): void => {
      const draggable = ownDraggable(this.app, DRAG_SOURCE);
      if (!draggable || !draggable.file) return;
      const canvas = view.canvas;
      if (!requireCanvas(canvas, ['readonly', 'posFromEvt', 'createFileNode'], 'Drop on a canvas')) return;
      if (canvas.readonly) return;
      evt.preventDefault();
      evt.stopPropagation();
      const file = draggable.file;
      if (!(file instanceof TFile)) return;
      canvas.createFileNode({ pos: canvas.posFromEvt(evt), file, subpath: draggable.subpath, save: true, focus: true });
      this.log(`dropped on canvas: ${file.path}${draggable.subpath ?? ''}`);
    };
    this.plugin.registerDomEvent(view.contentEl, 'drop', onDrop, { capture: true });
    view.register(() => this.bound.delete(view));
  }
}
