/* The settings, their defaults, and the one normaliser that turns whatever
 * data.json holds into a valid record. `lastColor` is state the plugin
 * keeps between sessions (the colour of the last highlight made), not a
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
  debug: boolean;
}

export const DEFAULT_HIGHLIGHTS_FOLDER = '04 Inner World/Documents/Highlights';

export const DEFAULT_SETTINGS: PdfaSettings = {
  highlightsFolder: DEFAULT_HIGHLIGHTS_FOLDER,
  defaultColor: DEFAULT_COLOR,
  lastColor: DEFAULT_COLOR,
  hoverCards: true,
  selectionToolbar: true,
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
  const clean = v.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '').trim();
  return clean.length > 0 ? clean : fallback;
}

export function normaliseSettings(raw: unknown): PdfaSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaultColor = oneOf(r.defaultColor, HIGHLIGHT_COLORS, DEFAULT_SETTINGS.defaultColor);
  return {
    highlightsFolder: cleanFolder(r.highlightsFolder, DEFAULT_SETTINGS.highlightsFolder),
    defaultColor,
    lastColor: oneOf(r.lastColor, HIGHLIGHT_COLORS, defaultColor),
    hoverCards: bool(r.hoverCards, DEFAULT_SETTINGS.hoverCards),
    selectionToolbar: bool(r.selectionToolbar, DEFAULT_SETTINGS.selectionToolbar),
    debug: bool(r.debug, DEFAULT_SETTINGS.debug),
  };
}
