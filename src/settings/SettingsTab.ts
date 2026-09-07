/* The settings page, declared: Obsidian 1.13 renders `getSettingDefinitions()`
 * and indexes it for settings search. The table it draws from is
 * definitions.ts. A change is applied at once through the plugin's
 * `applySettings`. */
import { PluginSettingTab } from 'obsidian';
import type { App } from 'obsidian';
import type PdfAnnotationPlugin from '../main';
import { SETTING_GROUPS, rowsIn } from './definitions';
import type { SettingRow } from './definitions';
import { normaliseSettings } from './model';

type Definitions = ReturnType<PluginSettingTab['getSettingDefinitions']>;
type Group = Extract<Definitions[number], { type: 'group' | 'list' }>;
type GroupItem = NonNullable<Group['items']>[number];

const GROUP_CLASS = 'icor-pdfa-settings-group';

export class PdfaSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: PdfAnnotationPlugin) {
    super(app, plugin);
  }

  override getSettingDefinitions(): Definitions {
    return SETTING_GROUPS.map((group) => ({
      type: 'group' as const,
      heading: group,
      cls: GROUP_CLASS,
      items: rowsIn(group).map((row) => this.toItem(row)),
    }));
  }

  private toItem(row: SettingRow): GroupItem {
    if (row.type === 'toggle') return { name: row.name, desc: row.desc, control: { type: 'toggle', key: row.key } };
    if (row.type === 'folder') return { name: row.name, desc: row.desc, control: { type: 'folder', key: row.key } };
    return { name: row.name, desc: row.desc, control: { type: 'dropdown', key: row.key, options: row.options } };
  }

  override getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const next = normaliseSettings({ ...this.plugin.settings, [key]: value });
    /* A new default color is the next highlight's color. */
    if (key === 'defaultColor') next.lastColor = next.defaultColor;
    this.plugin.settings = next;
    await this.plugin.saveSettings();
    this.plugin.applySettings();
  }
}
