/* Opening notes and PDFs somewhere, through the public workspace API. */
import { Keymap, Notice } from 'obsidian';
import type { App, PaneType, TFile } from 'obsidian';

export const NO_SIDEBAR = 'The right sidebar is not available in this window.';

export async function openInRightSidebar(app: App, file: TFile): Promise<void> {
  const leaf = app.workspace.getRightLeaf(false);
  if (!leaf) {
    new Notice(NO_SIDEBAR);
    return;
  }
  await leaf.openFile(file);
  await app.workspace.revealLeaf(leaf);
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
