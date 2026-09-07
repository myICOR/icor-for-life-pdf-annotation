/* ICOR for Life - PDF Annotation. Highlights on Obsidian's built-in PDF
 * viewer that are notes in the vault: one markdown note per highlight
 * with the position in the frontmatter and the user's note in the body;
 * a floating toolbar on a text selection and an area tool; every
 * highlight painted over the page; a deep link that opens the PDF at the
 * highlight; a card on any canvas by drag and drop, with the canvases and
 * the connected notes written back into the highlight note; and a
 * sidebar listing the highlights of the open PDF. What Obsidian does not
 * publish is reached through one guarded adapter (src/internals.ts). */
import { Keymap, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { CanvasSync } from './canvas/CanvasSync';
import { CanvasDrops } from './canvas/drop';
import { VIEW_TYPE } from './constants';
import { makeDragSource } from './drag';
import { debugLog } from './log';
import { notePreview } from './model/highlight';
import type { Highlight, HighlightColor } from './model/highlight';
import { buildEmbed, buildHighlightLink, buildNoteLink, nativeSubpath } from './model/links';
import { copyText, openNoteForWriting } from './open';
import { PdfRegistry } from './pdf/registry';
import { registerHighlightCards } from './render/highlightCard';
import { DEFAULT_SETTINGS, normaliseSettings } from './settings/model';
import type { PdfaSettings } from './settings/model';
import { PdfaSettingsTab } from './settings/SettingsTab';
import { HighlightStore } from './store/HighlightStore';
import { HighlightWriter } from './store/HighlightWriter';
import { HighlightsView } from './views/HighlightsView';

export default class PdfAnnotationPlugin extends Plugin {
  override settings: PdfaSettings = { ...DEFAULT_SETTINGS };
  private store!: HighlightStore;
  private writer!: HighlightWriter;
  private sync!: CanvasSync;
  private drops!: CanvasDrops;
  private registry!: PdfRegistry;
  private lastPdf: TFile | null = null;
  private panelRevealed = false;

  override async onload(): Promise<void> {
    this.settings = normaliseSettings(await this.loadData());
    const log = (message: string): void => this.log(message);
    this.store = new HighlightStore(this.app, log);
    this.writer = new HighlightWriter(this.app, this.store, { highlightsFolder: () => this.settings.highlightsFolder, log });
    this.sync = new CanvasSync(this.app, this.store, this.writer, log);
    this.drops = new CanvasDrops(this, this.app, log);
    this.registry = new PdfRegistry({
      app: this.app,
      store: this.store,
      writer: this.writer,
      settings: () => this.settings,
      rememberColor: (color) => void this.rememberColor(color),
      openNote: (h) => void this.openNote(h),
      copyLink: (h) => void this.copyHighlightLink(h),
      copyEmbed: (h) => void this.copyEmbed(h),
      preview: (h) => this.preview(h),
      showPanel: () => void this.showSidebar(),
      log,
    });

    this.registerView(VIEW_TYPE, (leaf) => new HighlightsView(leaf, {
      store: this.store,
      openHighlight: (h, evt) => void this.openHighlight(h, evt),
      openNote: (h) => void this.openNote(h),
      copyLink: (h) => void this.copyHighlightLink(h),
      copyEmbed: (h) => void this.copyEmbed(h),
      setColor: (h, color) => void this.registry.setColor(h, color),
      remove: (h) => void this.registry.confirmDelete(h),
      dragSource: (el, h) => this.dragSource(el, h),
      imageUrl: (h) => this.imageUrl(h),
      preview: (h) => this.preview(h),
    }));
    this.addRibbonIcon('highlighter', 'Open highlights panel', () => void this.showSidebar());
    this.addSettingTab(new PdfaSettingsTab(this.app, this));
    registerHighlightCards(this, {
      openHighlight: (h, evt) => void this.openHighlight(h, evt),
      dragSource: (el, h) => this.dragSource(el, h),
    });
    this.registerCommands();
    this.registerVaultEvents();

    const sweep = (): void => {
      this.drops.sweep();
      this.registry.sweep();
      this.trackActivePdf();
    };
    this.registerEvent(this.app.workspace.on('layout-change', sweep));
    this.registerEvent(this.app.workspace.on('active-leaf-change', sweep));
    this.registerEvent(this.app.workspace.on('file-open', () => this.trackActivePdf()));
    this.app.workspace.onLayoutReady(() => {
      this.store.rebuild();
      this.sync.schedule();
      sweep();
    });
  }

  override onunload(): void {
    this.registry.disposeAll();
    this.sync.dispose();
    this.store.dispose();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /* After a settings change: every open view follows. */
  applySettings(): void {
    this.registry.applySettings();
    for (const view of this.sidebars()) view.render();
  }

  log(message: string): void {
    debugLog(this.settings.debug, message);
  }

  /* ---------- Actions shared by the PDF view, the sidebar and the cards ---------- */

  /* Opens the PDF at the highlight: the tab that shows the PDF already,
     else the way a link opens (Mod-click for a new tab). The viewer scrolls
     and flashes a text selection on its own; the painted box of a rect
     highlight is scrolled to once the page has rendered. */
  async openHighlight(h: Highlight, evt?: MouseEvent | KeyboardEvent): Promise<void> {
    const pdf = this.store.pdfFileOf(h);
    if (!pdf) {
      new Notice(`PDF not found: ${h.sourceFile}`);
      return;
    }
    const subpath = `#${nativeSubpath(h)}`;
    const target = Keymap.isModEvent(evt);
    const existing = target === false ? this.registry.leafShowing(pdf) : null;
    if (existing) {
      await existing.openFile(pdf, { eState: { subpath, focus: true } });
      await this.app.workspace.revealLeaf(existing);
    } else {
      await this.app.workspace.openLinkText(`${pdf.path}${subpath}`, h.notePath, target);
    }
    this.registry.reveal(h);
  }

  async openNote(h: Highlight): Promise<void> {
    const file = this.store.noteFileOf(h);
    if (!file) {
      new Notice(`Note not found: ${h.notePath}`);
      return;
    }
    await openNoteForWriting(this.app, file);
  }

  async copyHighlightLink(h: Highlight): Promise<void> {
    await copyText(buildHighlightLink(h), 'Highlight link');
  }

  async copyNoteLink(h: Highlight): Promise<void> {
    await copyText(buildNoteLink(h.notePath), 'Note link');
  }

  /* `![[<note>#^quote]]` (or `#^image`), for pasting into any note. */
  async copyEmbed(h: Highlight): Promise<void> {
    await copyText(buildEmbed(h), 'Embed');
  }

  async rememberColor(color: HighlightColor): Promise<void> {
    if (this.settings.lastColor === color) return;
    this.settings = { ...this.settings, lastColor: color };
    await this.saveSettings();
  }

  dragSource(el: HTMLElement, h: Highlight): void {
    makeDragSource(this.app, el, () => this.store.byId(h.id) ?? h);
  }

  imageUrl(h: Highlight): string | null {
    if (!h.image) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(h.image, h.notePath);
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }

  async preview(h: Highlight): Promise<string> {
    const file = this.store.noteFileOf(h);
    if (!file) return '';
    try {
      return notePreview(await this.app.vault.cachedRead(file));
    } catch {
      return '';
    }
  }

  /* The highlight a command acts on: the one under the pointer or last
     clicked in a PDF view, else the active note when it is a highlight. */
  currentHighlight(): Highlight | null {
    const fromPdf = this.registry.currentHighlight();
    if (fromPdf) return fromPdf;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    return file ? this.store.forNote(file.path) : null;
  }

  /* ---------- The sidebar ---------- */

  private sidebars(): HighlightsView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((leaf) => leaf.view).filter((v): v is HighlightsView => v instanceof HighlightsView);
  }

  private trackActivePdf(): void {
    const pdf = this.registry.activePdfFile();
    if (pdf) this.lastPdf = pdf;
    if (!this.lastPdf) return;
    for (const view of this.sidebars()) view.setPdf(this.lastPdf);
    /* The first PDF of the session reveals the panel, once. */
    if (pdf && this.settings.openPanelOnPdf && !this.panelRevealed) {
      this.panelRevealed = true;
      void this.showSidebar();
    }
  }

  async showSidebar(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      this.trackActivePdf();
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice('The right sidebar is not available in this window.');
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
    this.trackActivePdf();
  }

  /* ---------- Commands ---------- */

  private registerCommands(): void {
    this.addCommand({
      id: 'open-highlights-sidebar',
      name: 'Open highlights sidebar',
      icon: 'highlighter',
      callback: () => void this.showSidebar(),
    });
    this.addCommand({
      id: 'copy-highlight-link',
      name: 'Copy highlight link',
      icon: 'link',
      checkCallback: (checking) => {
        const h = this.currentHighlight();
        if (!h && !this.registry.canHighlightSelection()) return false;
        if (!checking) {
          if (h) void this.copyHighlightLink(h);
          else void this.registry.highlightSelection(this.settings.lastColor, 'copy');
        }
        return true;
      },
    });
    this.addCommand({
      id: 'copy-note-link',
      name: 'Copy link to highlight note',
      icon: 'file-symlink',
      checkCallback: (checking) => {
        const h = this.currentHighlight();
        if (!h) return false;
        if (!checking) void this.copyNoteLink(h);
        return true;
      },
    });
    this.addCommand({
      id: 'copy-embed',
      name: 'Copy highlight embed',
      icon: 'copy',
      checkCallback: (checking) => {
        const h = this.currentHighlight();
        if (!h) return false;
        if (!checking) void this.copyEmbed(h);
        return true;
      },
    });
    this.addCommand({
      id: 'highlight-selection',
      name: 'Highlight the selection',
      icon: 'highlighter',
      checkCallback: (checking) => {
        if (!this.registry.canHighlightSelection()) return false;
        if (!checking) void this.registry.highlightSelection(this.settings.lastColor, 'none');
        return true;
      },
    });
    this.addCommand({
      id: 'add-note-to-selection',
      name: 'Add a note to the selection',
      icon: 'sticky-note',
      checkCallback: (checking) => {
        if (!this.registry.canHighlightSelection()) return false;
        if (!checking) void this.registry.highlightSelection(this.settings.lastColor, 'note');
        return true;
      },
    });
    this.addCommand({
      id: 'draw-area-highlight',
      name: 'Draw area highlight',
      icon: 'square-dashed',
      checkCallback: (checking) => {
        const binding = this.registry.active();
        if (!binding?.area) return false;
        if (!checking) binding.area.arm();
        return true;
      },
    });
    this.addCommand({
      id: 'delete-highlight',
      name: 'Delete highlight',
      icon: 'trash-2',
      checkCallback: (checking) => {
        const h = this.currentHighlight();
        if (!h) return false;
        if (!checking) void this.registry.confirmDelete(h);
        return true;
      },
    });
    this.addCommand({
      id: 'cycle-color',
      name: 'Cycle highlight colour',
      icon: 'palette',
      checkCallback: (checking) => {
        const h = this.currentHighlight();
        if (!h) return false;
        if (!checking) void this.registry.cycleColor(h);
        return true;
      },
    });
  }

  /* ---------- Vault and cache events ---------- */

  private registerVaultEvents(): void {
    const { vault, metadataCache } = this.app;
    this.registerEvent(
      metadataCache.on('changed', (file, _data, cache) => {
        if (file.extension !== 'md') return;
        this.store.update(file, cache);
        this.sync.schedule();
      }),
    );
    /* The first resolve after startup means every file is indexed. */
    const once = metadataCache.on('resolved', () => {
      metadataCache.offref(once);
      this.store.rebuild();
      this.sync.schedule();
    });
    this.registerEvent(once);
    /* A canvas that appears fully formed (a script, a sync from another
       device, a duplicate) fires no `modify`; `forget` first, because a
       create after a delete must not hit the parse cache by mtime. A new
       .md file reaches the store through `changed`. */
    this.registerEvent(
      vault.on('create', (file) => {
        if (!(file instanceof TFile) || file.extension !== 'canvas') return;
        this.sync.forget(file.path);
        this.sync.schedule();
      }),
    );
    this.registerEvent(
      vault.on('delete', (file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension === 'md') this.store.remove(file.path);
        if (file.extension === 'canvas') this.sync.forget(file.path);
        this.sync.schedule();
      }),
    );
    this.registerEvent(
      vault.on('rename', (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        if (file.extension === 'md') this.store.rename(file, oldPath);
        if (file.extension === 'canvas' || oldPath.endsWith('.canvas')) this.sync.forget(oldPath);
        this.sync.schedule();
      }),
    );
    this.registerEvent(
      vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'canvas') this.sync.schedule();
      }),
    );
  }
}
