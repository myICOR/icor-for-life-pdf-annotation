/* The settings, their defaults, and the one normaliser that turns whatever
 * data.json holds into a valid record. `lastColor` is state the plugin
 * keeps between sessions (the color of the last highlight made), not a
 * row on the settings page. */
import { DEFAULT_COLOR, HIGHLIGHT_COLORS } from '../model/highlight';
import type { HighlightColor } from '../model/highlight';

export interface PdfaSettings {
  /* The root folder for highlight notes; one subfolder per PDF under it. */
  highlightsFolder: string;
  defaultColor: HighlightColor;
  lastColor: HighlightColor;
  hoverCards: boolean;
  selectionToolbar: boolean;
  /* Reveal the highlights panel the first time a PDF becomes active. */
  openPanelOnPdf: boolean;
  debug: boolean;
}

export const DEFAULT_HIGHLIGHTS_FOLDER = '04 Notes/Highlights';

/* The defaults of older vaults: 2.x (`04 Inner World`) and early 3.0
   (`02 Inner World`), before the Workbench layout gave Notes its own top
   folder. `rememberColor` persists the whole settings object, so every
   install that ever made a highlight holds one of these in data.json without
   having chosen it. It is kept while the vault still has that top folder and
   follows the vault once it has moved (followFolders, which needs the vault
   and so runs on load, not here). Only these exact strings are read that
   way; any other value is the user's. */
export const V2_HIGHLIGHTS_FOLDER = '04 Inner World/Notes/Highlights';
export const EARLY_3_HIGHLIGHTS_FOLDER = '02 Inner World/Notes/Highlights';
export const OLD_HIGHLIGHTS_FOLDERS: readonly string[] = [V2_HIGHLIGHTS_FOLDER, EARLY_3_HIGHLIGHTS_FOLDER];

/* The default before Scaffold 1.17.0 renamed `04 Inner World/Documents` to
   `04 Inner World/Notes`: a 2.x value, so it becomes the 2.x default above
   and followFolders takes it from there. Only this exact string is mapped. */
export const LEGACY_HIGHLIGHTS_FOLDER = '04 Inner World/Documents/Highlights';

export const DEFAULT_SETTINGS: PdfaSettings = {
  highlightsFolder: DEFAULT_HIGHLIGHTS_FOLDER,
  defaultColor: DEFAULT_COLOR,
  lastColor: DEFAULT_COLOR,
  hoverCards: true,
  selectionToolbar: true,
  openPanelOnPdf: true,
  debug: false,
};

/* The keys that are state rather than settings: no row on the page. */
export const STATE_KEYS: readonly (keyof PdfaSettings)[] = ['lastColor'];

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

/* A folder path as the vault writes it: forward slashes, no leading or
   trailing slash, never empty. */
export function cleanFolder(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const parts = v.replace(/\\/g, '/').split('/').map((p) => p.trim()).filter((p) => p.length > 0);
  /* A dot segment could point above the vault root. */
  if (parts.some((p) => p === '.' || p === '..')) return fallback;
  const clean = parts.join('/');
  return clean.length > 0 ? clean : fallback;
}

export function normaliseSettings(raw: unknown): PdfaSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaultColor = oneOf(r.defaultColor, HIGHLIGHT_COLORS, DEFAULT_SETTINGS.defaultColor);
  /* The migrated value reaches data.json on the next save the plugin
     already makes (a color change or a settings-page edit); there is no
     save on load, and mapping again on every load is harmless. */
  const folder = r.highlightsFolder === LEGACY_HIGHLIGHTS_FOLDER ? V2_HIGHLIGHTS_FOLDER : r.highlightsFolder;
  return {
    highlightsFolder: cleanFolder(folder, DEFAULT_SETTINGS.highlightsFolder),
    defaultColor,
    lastColor: oneOf(r.lastColor, HIGHLIGHT_COLORS, defaultColor),
    hoverCards: bool(r.hoverCards, DEFAULT_SETTINGS.hoverCards),
    selectionToolbar: bool(r.selectionToolbar, DEFAULT_SETTINGS.selectionToolbar),
    openPanelOnPdf: bool(r.openPanelOnPdf, DEFAULT_SETTINGS.openPanelOnPdf),
    debug: bool(r.debug, DEFAULT_SETTINGS.debug),
  };
}

const topFolder = (path: string): string => path.split('/')[0] ?? path;

/* The settings once the vault is known: an old default stays while the
   vault still has its top folder (`04 Inner World`, `02 Inner World`);
   otherwise it becomes the current default, and `save` says the change can be written, which is once
   the vault has the new top folder. Until then the old value is read again
   on the next load. `exists` asks the vault by path, so this works before
   Obsidian has listed the files. Same object back when nothing changes. */
export async function followFolders(settings: PdfaSettings, exists: (path: string) => Promise<boolean>): Promise<{ settings: PdfaSettings; save: boolean }> {
  const saved = settings.highlightsFolder;
  if (!OLD_HIGHLIGHTS_FOLDERS.includes(saved) || await exists(topFolder(saved))) return { settings, save: false };
  return { settings: { ...settings, highlightsFolder: DEFAULT_HIGHLIGHTS_FOLDER }, save: await exists(topFolder(DEFAULT_HIGHLIGHTS_FOLDER)) };
}
