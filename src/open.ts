/* Opening notes and PDFs somewhere, through the public workspace API. */
import { Keymap, MarkdownView, Notice } from 'obsidian';
import type { App, PaneType, TFile, WorkspaceLeaf } from 'obsidian';
import { NOTE_HEADING } from './model/highlight';

export const NO_SIDEBAR = 'The right sidebar is not available in this window.';

export async function openInRightSidebar(app: App, file: TFile): Promise<WorkspaceLeaf | null> {
  const leaf = app.workspace.getRightLeaf(false);
  if (!leaf) {
    new Notice(NO_SIDEBAR);
    return null;
  }
  await leaf.openFile(file);
  await app.workspace.revealLeaf(leaf);
  return leaf;
}

/* Opens a highlight note in the right sidebar with the cursor on the
   line under its Note heading (the end of the note when there is none). */
export async function openNoteForWriting(app: App, file: TFile): Promise<void> {
  const leaf = await openInRightSidebar(app, file);
  const view = leaf?.view;
  if (!(view instanceof MarkdownView)) return;
  const { editor } = view;
  let line = editor.lastLine();
  for (let i = 0; i <= editor.lastLine(); i++) {
    if (editor.getLine(i).trim() === NOTE_HEADING) {
      line = Math.min(i + 2, editor.lastLine());
      break;
    }
  }
  editor.setCursor({ line, ch: editor.getLine(line).length });
  editor.focus();
}

/* Opens the way Obsidian's own links do: a plain click in the current
   tab, Mod-click in a new tab, Mod-Alt-click in a split, Mod-Alt-Shift
   in a new window. */
export async function openLikeLink(app: App, file: TFile, evt?: MouseEvent | KeyboardEvent): Promise<void> {
  const target: PaneType | boolean = Keymap.isModEvent(evt);
  await app.workspace.getLeaf(target).openFile(file);
}

/* Copies text and says so. */
export async function copyText(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    new Notice(`${what} copied.`);
    return true;
  } catch {
    new Notice(`Could not copy the ${what.toLowerCase()}.`);
    return false;
  }
}
