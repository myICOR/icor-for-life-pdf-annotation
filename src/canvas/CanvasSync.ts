/* The canvas fields of every highlight note, kept fresh: `canvases` (the
 * .canvas files the note is on) and `linked_notes` (the files whose cards
 * are connected to one of the note's cards by an edge, either direction).
 * The metadata cache's resolved links say which canvases mention a
 * highlight note; those files are parsed (cached by modification time)
 * and the note is written only when the values changed, debounced. The
 * write goes through the metadata cache back into the store, which calls
 * this again, computes the same values, and writes nothing. */
import { TFile, debounce } from 'obsidian';
import type { App } from 'obsidian';
import { targetOf } from '../model/highlight';
import type { Highlight } from '../model/highlight';
import type { HighlightStore } from '../store/HighlightStore';
import type { HighlightWriter } from '../store/HighlightWriter';
import { filesOn, fileLinks, parseCanvasJson } from './parse';

export const CANVAS_EXTENSION = 'canvas';

interface Parsed {
  mtime: number;
  files: string[];
  links: Map<string, string[]>;
}

export class CanvasSync {
  private readonly cache = new Map<string, Parsed>();
  private readonly flush = debounce(() => void this.run(), 600, true);
  private running = false;
  private again = false;
  private disposed = false;

  constructor(
    private readonly app: App,
    private readonly store: HighlightStore,
    private readonly writer: HighlightWriter,
    private readonly log: (message: string) => void,
  ) {}

  isCanvasFile(file: unknown): file is TFile {
    return file instanceof TFile && file.extension === CANVAS_EXTENSION;
  }

  /* Something that can change a canvas field happened. */
  schedule(): void {
    if (!this.disposed) this.flush();
  }

  forget(path: string): void {
    this.cache.delete(path);
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.flush.cancel();
    this.cache.clear();
  }

  private async run(): Promise<void> {
    if (this.disposed || !this.store.ready) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      await this.pass();
    } finally {
      this.running = false;
      if (this.again && !this.disposed) {
        this.again = false;
        this.schedule();
      }
    }
  }

  private async pass(): Promise<void> {
    const highlights = this.store.all();
    if (highlights.length === 0) return;
    const notePaths = new Set(highlights.map((h) => h.notePath));
    const canvases = this.app.vault.getFiles().filter((f) => this.isCanvasFile(f));
    const resolved = this.app.metadataCache.resolvedLinks;
    const onCanvas = new Map<string, Set<string>>();
    const linksOf = new Map<string, Map<string, string[]>>();
    for (const canvas of canvases) {
      /* The cache knows which files a canvas links; a canvas it has not
         indexed yet is read anyway. */
      const known = resolved[canvas.path];
      if (known && !Object.keys(known).some((t) => notePaths.has(t))) continue;
      const parsed = await this.parsed(canvas);
      if (!parsed) continue;
      linksOf.set(canvas.path, parsed.links);
      for (const file of parsed.files) {
        if (!notePaths.has(file)) continue;
        const set = onCanvas.get(file) ?? new Set();
        set.add(canvas.path);
        onCanvas.set(file, set);
      }
    }
    let written = 0;
    for (const h of highlights) {
      if (this.disposed) return;
      const on = [...(onCanvas.get(h.notePath) ?? [])].sort((a, b) => a.localeCompare(b));
      const linked = new Set<string>();
      for (const canvasPath of on) for (const path of linksOf.get(canvasPath)?.get(h.notePath) ?? []) linked.add(targetOf(path));
      const linkedNotes = [...linked].sort((a, b) => a.localeCompare(b));
      if (await this.writer.setCanvasFields(h, on, linkedNotes)) written++;
    }
    if (written > 0) this.log(`canvas sync: ${written} note(s) updated`);
  }

  private async parsed(canvas: TFile): Promise<Parsed | null> {
    const cached = this.cache.get(canvas.path);
    if (cached && cached.mtime === canvas.stat.mtime) return cached;
    try {
      const data = parseCanvasJson(await this.app.vault.cachedRead(canvas));
      if (!data) return null;
      const parsed: Parsed = { mtime: canvas.stat.mtime, files: filesOn(data), links: fileLinks(data) };
      this.cache.set(canvas.path, parsed);
      return parsed;
    } catch {
      return null;
    }
  }
}

export type { Highlight };
