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

export const DEFAULT_HIGHLIGHTS_FOLDER = '04 Inner World/Notes/Highlights';

/* The default before Scaffold 1.17.0 renamed `04 Inner World/Documents` to
   `04 Inner World/Notes`. `rememberColor` persists the whole settings
   object, so every install that ever made a highlight holds this string in
   data.json; left alone, the next highlight would recreate the retired
   folder. Only this exact string is mapped; any other value is the user's. */
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
  const folder = r.highlightsFolder === LEGACY_HIGHLIGHTS_FOLDER ? DEFAULT_HIGHLIGHTS_FOLDER : r.highlightsFolder;
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
