/* The one question the plugin asks: delete this highlight? A Modal, never
 * window.confirm. */
import { Modal } from 'obsidian';
import type { App } from 'obsidian';

export class ConfirmDeleteModal extends Modal {
  private resolved = false;

  constructor(app: App, private readonly what: string, private readonly resolve: (yes: boolean) => void) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText('Delete highlight?');
    this.contentEl.createEl('p', { text: `The note "${this.what}" goes to the trash. The PDF is not changed.` });
    const row = this.contentEl.createDiv({ cls: 'icor-pdfa-confirm-buttons' });
    const del = row.createEl('button', { cls: 'mod-warning', text: 'Delete' });
    del.addEventListener('click', () => this.finish(true));
    const cancel = row.createEl('button', { text: 'Cancel' });
    cancel.addEventListener('click', () => this.finish(false));
    cancel.focus();
  }

  override onClose(): void {
    this.finish(false);
  }

  private finish(yes: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(yes);
    this.close();
  }
}

export function confirmDelete(app: App, what: string): Promise<boolean> {
  return new Promise((resolve) => new ConfirmDeleteModal(app, what, resolve).open());
}
