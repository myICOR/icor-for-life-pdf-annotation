/* Every open PDF view, wired once. Phase 1 shape: view discovery and the
 * active PDF; the painting, the toolbar and the area tool come in Phase 2. */
import type { App, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { asPdfView } from '../internals';
import type { Highlight, HighlightColor } from '../model/highlight';
import type { PdfaSettings } from '../settings/model';
import type { HighlightStore } from '../store/HighlightStore';
import type { HighlightWriter } from '../store/HighlightWriter';

export interface RegistryHost {
  app: App;
  store: HighlightStore;
  writer: HighlightWriter;
  settings(): PdfaSettings;
  rememberColor(color: HighlightColor): void;
  openNote(h: Highlight): void;
  log(message: string): void;
}

export type AfterHighlight = 'none' | 'copy' | 'note' | 'embed';

export interface PdfBinding {
  area: { arm(): void } | null;
}

export class PdfRegistry {
  constructor(private readonly plugin: Plugin, private readonly host: RegistryHost) {}

  sweep(): void {
    void this.plugin;
  }

  applySettings(): void {}

  disposeAll(): void {}

  active(): PdfBinding | null {
    return null;
  }

  /* The PDF of the most recently active PDF view, if any. */
  activePdfFile(): TFile | null {
    const view = asPdfView(this.host.app.workspace.getMostRecentLeaf()?.view);
    return view?.file ?? null;
  }

  leafShowing(pdf: TFile): WorkspaceLeaf | null {
    for (const leaf of this.host.app.workspace.getLeavesOfType('pdf')) {
      const view = asPdfView(leaf.view);
      if (view?.file === pdf) return leaf;
    }
    return null;
  }

  reveal(_h: Highlight): void {}

  currentHighlight(): Highlight | null {
    return null;
  }

  canHighlightSelection(): boolean {
    return false;
  }

  async highlightSelection(_color: HighlightColor, _then: AfterHighlight): Promise<void> {}

  async confirmDelete(_h: Highlight): Promise<void> {}

  async cycleColor(_h: Highlight): Promise<void> {}
}
