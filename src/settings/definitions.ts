/* The settings page as data. The settings tab's `getSettingDefinitions()`
 * draws from this table, and the tests read it to prove every setting has
 * exactly one row. */
import { COLOR_NAMES } from '../model/highlight';
import type { PdfaSettings } from './model';

export type SettingGroup = 'Highlights' | 'Viewer' | 'Advanced';

export interface ToggleRow {
  type: 'toggle';
  group: SettingGroup;
  key: keyof PdfaSettings;
  name: string;
  desc: string;
}

export interface DropdownRow {
  type: 'dropdown';
  group: SettingGroup;
  key: keyof PdfaSettings;
  name: string;
  desc: string;
  options: Record<string, string>;
}

export interface FolderRow {
  type: 'folder';
  group: SettingGroup;
  key: keyof PdfaSettings;
  name: string;
  desc: string;
}

export type SettingRow = ToggleRow | DropdownRow | FolderRow;

export const SETTING_GROUPS: readonly SettingGroup[] = ['Highlights', 'Viewer', 'Advanced'];

export const SETTING_ROWS: readonly SettingRow[] = [
  {
    type: 'folder',
    group: 'Highlights',
    key: 'highlightsFolder',
    name: 'Highlights folder',
    desc: 'Where highlight notes are created: one folder per PDF under this one, named after the PDF. Folders are created when the first highlight needs them. Notes moved elsewhere keep working.',
  },
  {
    type: 'dropdown',
    group: 'Highlights',
    key: 'defaultColor',
    name: 'Default colour',
    desc: 'The colour of the next highlight after this setting changes. The toolbar remembers the last colour you picked from then on.',
    options: COLOR_NAMES,
  },
  {
    type: 'toggle',
    group: 'Viewer',
    key: 'selectionToolbar',
    name: 'Toolbar on selection',
    desc: 'Show the small toolbar above a text selection in a PDF: the colours, copy link, add note. Off, the commands still work on the current selection.',
  },
  {
    type: 'toggle',
    group: 'Viewer',
    key: 'hoverCards',
    name: 'Hover cards',
    desc: 'Show the first lines of the note when the pointer rests on a painted highlight.',
  },
  {
    type: 'toggle',
    group: 'Advanced',
    key: 'debug',
    name: 'Debug logging',
    desc: 'Writes what the plugin did (views wired, notes written, index rebuilt) to the developer console. Never the text of a note or a PDF.',
  },
];

export function settingKeys(): (keyof PdfaSettings)[] {
  return SETTING_ROWS.map((r) => r.key);
}

export function rowsIn(group: SettingGroup): SettingRow[] {
  return SETTING_ROWS.filter((r) => r.group === group);
}
