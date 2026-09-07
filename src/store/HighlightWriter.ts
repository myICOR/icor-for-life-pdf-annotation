/* Every write to a highlight note: create, recolor, the canvas fields,
 * delete. The note is created in one `vault.create` with the text the pure
 * builder makes; later changes go through `fileManager.processFrontMatter`
 * so Obsidian's own YAML handling keeps the rest of the frontmatter as it
 * is. The cropped image of a rect highlight is placed by Obsidian's own
 * attachment rule. */
import { TFile, TFolder, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { Anchor, Highlight, HighlightColor, Rect, TextSelection } from '../model/highlight';
import { buildNoteText, isOwnImage, isoLocal, namesPdf, newId, sortRectsTopDown, stampOf, targetOf, wikilink } from '../model/highlight';
import { ancestors, folderFor, imageFileName, noteBaseName, uniquePath } from '../model/naming';
import type { HighlightStore } from './HighlightStore';

export interface CreateInput {
  pdf: TFile;
  page: number;
  anchor: Anchor;
  color: HighlightColor;
  quote: string;
  selection: TextSelection | null;
  rects: Rect[];
  /* The PNG of a rect highlight. */
  image?: ArrayBuffer | null;
}

export interface WriterDeps {
  highlightsFolder(): string;
  log(message: string): void;
  now?(): Date;
}

export class HighlightWriter {
  constructor(private readonly app: App, private readonly store: HighlightStore, private readonly deps: WriterDeps) {}

  async create(input: CreateInput): Promise<{ file: TFile; highlight: Highlight }> {
    const { vault, fileManager } = this.app;
    const now = this.deps.now ? this.deps.now() : new Date();
    const id = newId();
    const folder = folderFor(this.deps.highlightsFolder(), input.pdf.path);
    await this.ensureFolder(folder);
    const notePath = uniquePath(folder, noteBaseName(stampOf(now), input.page, id), '.md', (p) => vault.getAbstractFileByPath(normalizePath(p)) !== null);
    let image: string | null = null;
    if (input.anchor === 'rect' && input.image) {
      const imagePath = normalizePath(await fileManager.getAvailablePathForAttachment(imageFileName(input.pdf.path, input.page, id), notePath));
      await this.ensureFolder(imagePath.slice(0, imagePath.lastIndexOf('/')));
      const imageFile = await vault.createBinary(imagePath, input.image);
      image = imageFile.path;
    }
    const highlight: Highlight = {
      id,
      notePath,
      sourceFile: input.pdf.path,
      document: this.documentNoteFor(input.pdf),
      page: input.page,
      anchor: input.anchor,
      color: input.color,
      quote: input.quote,
      selection: input.anchor === 'selection' ? input.selection : null,
      rects: sortRectsTopDown(input.rects),
      image,
      created: isoLocal(now),
      canvases: [],
      linkedNotes: [],
    };
    const file = await vault.create(notePath, buildNoteText(highlight));
    this.deps.log(`highlight created: ${file.path}`);
    return { file, highlight };
  }

  async setColor(h: Highlight, color: HighlightColor): Promise<void> {
    const file = this.store.noteFileOf(h);
    if (!file || h.color === color) return;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.color = color;
    });
    this.deps.log(`highlight recolored: ${file.path}`);
  }

  /* Writes `canvases` and `linked_notes` only when they changed. */
  async setCanvasFields(h: Highlight, canvases: readonly string[], linkedNotes: readonly string[]): Promise<boolean> {
    if (sameList(h.canvases, canvases) && sameList(h.linkedNotes, linkedNotes)) return false;
    const file = this.store.noteFileOf(h);
    if (!file) return false;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.canvases = canvases.map(wikilink);
      fm.linked_notes = linkedNotes.map(wikilink);
    });
    this.deps.log(`canvas fields written: ${file.path} (${canvases.length} canvases, ${linkedNotes.length} linked notes)`);
    return true;
  }

  /* Trashes the note and, when nothing else links to it, its image. */
  async delete(h: Highlight): Promise<void> {
    const file = this.store.noteFileOf(h);
    if (!file) return;
    const image = this.ownImageOf(h);
    await this.app.fileManager.trashFile(file);
    if (image && this.linkCount(image.path, file.path) === 0) await this.app.fileManager.trashFile(image);
    this.deps.log(`highlight deleted: ${file.path}`);
  }

  /* The image that goes with the note: only the PNG this plugin wrote for
     this highlight (its own name shape), never another file a crafted
     `image` field points at. */
  ownImageOf(h: Highlight): TFile | null {
    if (!h.image) return null;
    const image = this.app.metadataCache.getFirstLinkpathDest(h.image, h.notePath);
    return image instanceof TFile && isOwnImage(image.extension, image.basename, h) ? image : null;
  }

  /* The `type: document` note whose `source_file` or `digital_location`
     names this PDF, as a link target, when there is exactly such a note. */
  documentNoteFor(pdf: TFile): string | null {
    const matches: string[] = [];
    for (const note of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(note)?.frontmatter;
      if (!fm || fm.type !== 'document') continue;
      if (namesPdf(fm.source_file, pdf.path) || namesPdf(fm.digital_location, pdf.path)) matches.push(note.path);
    }
    matches.sort((a, b) => a.localeCompare(b));
    return matches[0] ? targetOf(matches[0]) : null;
  }

  /* How many notes other than `except` link to `path`. */
  private linkCount(path: string, except: string): number {
    let count = 0;
    for (const [source, targets] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      if (source === except) continue;
      if (targets[path]) count++;
    }
    return count;
  }

  private async ensureFolder(path: string): Promise<void> {
    for (const folder of ancestors(normalizePath(path))) {
      const existing = this.app.vault.getAbstractFileByPath(folder);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`${folder} exists and is not a folder`);
      try {
        await this.app.vault.createFolder(folder);
      } catch {
        /* Created by someone else between the check and the call. */
      }
    }
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
