/* Every highlight note in the vault, read from the metadata cache: a note
 * is a highlight when its frontmatter says `type: pdf-highlight`, whatever
 * its name or folder. Kept fresh from the cache's own events, resolved to
 * the PDF each note points at, and served per PDF, per page and per note.
 * Views subscribe and re-render on every change. */
import { TFile, getLinkpath } from 'obsidian';
import type { App, CachedMetadata } from 'obsidian';
import { compareOnPage, readHighlight } from '../model/highlight';
import type { Highlight } from '../model/highlight';

export type Unsubscribe = () => void;

export class HighlightStore {
  private readonly byNote = new Map<string, Highlight>();
  private byPdf = new Map<string, Highlight[]>();
  private readonly listeners = new Set<() => void>();
  private built = false;

  constructor(private readonly app: App, private readonly log: (message: string) => void) {}

  get ready(): boolean {
    return this.built;
  }

  /* Reads every markdown file's cache. Safe to call again. */
  rebuild(): void {
    this.byNote.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.read(file);
    this.built = true;
    this.recompute();
    this.log(`index rebuilt: ${this.byNote.size} highlights on ${this.byPdf.size} PDFs`);
  }

  /* A note's cache changed. */
  update(file: TFile, cache?: CachedMetadata | null): void {
    const before = this.byNote.get(file.path);
    const after = this.read(file, cache);
    if (!before && !after) return;
    this.recompute();
  }

  /* A highlight just written, before the cache has indexed its note, so
     the page paints at once; the cache's own event replaces it. */
  insert(h: Highlight): void {
    this.byNote.set(h.notePath, h);
    this.recompute();
  }

  remove(path: string): void {
    if (this.byNote.delete(path)) this.recompute();
  }

  rename(file: TFile, oldPath: string): void {
    const had = this.byNote.delete(oldPath);
    const has = this.read(file) !== null;
    if (had || has) this.recompute();
  }

  all(): Highlight[] {
    return [...this.byNote.values()];
  }

  forNote(notePath: string): Highlight | null {
    return this.byNote.get(notePath) ?? null;
  }

  byId(id: string): Highlight | null {
    for (const h of this.byNote.values()) if (h.id === id) return h;
    return null;
  }

  /* The highlights of a PDF, top of the first page first. */
  forPdf(pdfPath: string): Highlight[] {
    return this.byPdf.get(pdfPath) ?? [];
  }

  forPage(pdfPath: string, page: number): Highlight[] {
    return this.forPdf(pdfPath).filter((h) => h.page === page);
  }

  /* The PDF a highlight points at, resolved the way a link is. */
  pdfFileOf(h: Highlight): TFile | null {
    const file = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(h.sourceFile), h.notePath);
    return file instanceof TFile ? file : null;
  }

  noteFileOf(h: Highlight): TFile | null {
    const file = this.app.vault.getFileByPath(h.notePath);
    return file instanceof TFile ? file : null;
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  private read(file: TFile, cache?: CachedMetadata | null): Highlight | null {
    const meta = cache === undefined ? this.app.metadataCache.getFileCache(file) : cache;
    const h = readHighlight(meta?.frontmatter, file.path);
    if (h) this.byNote.set(file.path, h);
    else this.byNote.delete(file.path);
    return h;
  }

  private recompute(): void {
    const next = new Map<string, Highlight[]>();
    for (const h of this.byNote.values()) {
      const pdf = this.pdfFileOf(h);
      const key = pdf ? pdf.path : h.sourceFile;
      const list = next.get(key) ?? [];
      list.push(h);
      next.set(key, list);
    }
    for (const list of next.values()) list.sort(compareOnPage);
    this.byPdf = next;
    for (const listener of this.listeners) listener();
  }
}
