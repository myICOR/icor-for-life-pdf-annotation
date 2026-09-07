/* The built main.js loads in a bare Node VM against a stub of the
 * `obsidian` module, the plugin constructs, `onload` wires everything
 * without throwing, and the layout-ready work runs against an empty vault.
 * This is the smoke test that runs without the app. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const repo = resolve(import.meta.dirname, '..');

function stubObsidian() {
  const events = () => ({ on: () => ({ ref: true }), off: () => {}, offref: () => {}, trigger: () => {} });
  class Component {
    register() {}
    registerEvent() {}
    registerDomEvent() {}
    load() {}
    unload() {}
    addChild(c) { return c; }
  }
  class Plugin extends Component {
    constructor(app, manifest) { super(); this.app = app; this.manifest = manifest; this.commands = []; this.views = {}; this.postProcessors = []; this.settingTabs = []; }
    async loadData() { return null; }
    async saveData(d) { this.saved = d; }
    addCommand(c) { this.commands.push(c); }
    registerView(type, factory) { this.views[type] = factory; }
    registerMarkdownPostProcessor(fn) { this.postProcessors.push(fn); }
    addSettingTab(tab) { this.settingTabs.push(tab); }
    addRibbonIcon() { return fakeEl(); }
  }
  class TFile { constructor(path) { this.path = path; this.extension = path.slice(path.lastIndexOf('.') + 1); this.basename = path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.')); this.stat = { mtime: 1 }; } }
  class TFolder {}
  class View extends Component { constructor(leaf) { super(); this.leaf = leaf; this.contentEl = fakeEl(); } getViewType() { return ''; } }
  class ItemView extends View {}
  class FileView extends View {}
  class MarkdownView extends FileView {}
  class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
  class Notice { constructor(text) { Notice.shown.push(text); } }
  Notice.shown = [];
  class Modal { constructor(app) { this.app = app; this.contentEl = fakeEl(); this.titleEl = fakeEl(); } open() {} close() {} }
  /* Every debounced call runs at once and is counted, so a test can see
     that something was scheduled. */
  const debounce = (fn) => { const d = (...args) => { stub.debounced++; return fn(...args); }; d.cancel = () => {}; return d; };
  const stub = {
    debounced: 0,
    Component, Plugin, TFile, TFolder, View, ItemView, FileView, MarkdownView, PluginSettingTab, Notice, Modal, debounce,
    Keymap: { isModEvent: () => false },
    Platform: { isMobile: false, isPhone: false, isDesktopApp: true },
    setIcon: () => {}, setTooltip: () => {}, normalizePath: (p) => p, getLinkpath: (p) => p,
    events,
  };
  return new Proxy(stub, { get: (t, name) => (name in t ? t[name] : class Stub {}) });
}

function fakeEl() {
  const el = {
    children: [], classes: new Set(), attrs: {}, listeners: {},
    addClass(...c) { c.forEach((x) => el.classes.add(x)); }, removeClass(...c) { c.forEach((x) => el.classes.delete(x)); }, hasClass(c) { return el.classes.has(c); }, toggleClass(c, on) { on ? el.classes.add(c) : el.classes.delete(c); },
    createDiv() { const d = fakeEl(); el.children.push(d); return d; }, createSpan() { const d = fakeEl(); el.children.push(d); return d; }, createEl() { const d = fakeEl(); el.children.push(d); return d; },
    empty() { el.children = []; }, setText() {}, setAttribute(k, v) { el.attrs[k] = v; }, setAttr(k, v) { el.attrs[k] = v; }, getAttribute(k) { return el.attrs[k]; },
    addEventListener(n, f) { (el.listeners[n] ??= []).push(f); }, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, appendChild() {}, detach() {}, remove() {},
    setCssProps() {}, setCssStyles() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }, contains() { return false; },
  };
  return el;
}

function fakeApp(obsidian) {
  const layoutReady = [];
  const app = {
    layoutReady,
    workspace: { ...obsidian.events(), onLayoutReady: (cb) => layoutReady.push(cb), getLeavesOfType: () => [], getMostRecentLeaf: () => null, getActiveViewOfType: () => null, getRightLeaf: () => null, revealLeaf: async () => {}, openLinkText: async () => {} },
    vault: { ...obsidian.events(), handlers: {}, on(name, fn) { (this.handlers[name] ??= []).push(fn); return { ref: true }; }, getMarkdownFiles: () => [], getFiles: () => [], getFileByPath: () => null, getAbstractFileByPath: () => null, cachedRead: async () => '', getResourcePath: () => '' },
    metadataCache: { ...obsidian.events(), resolvedLinks: {}, getFileCache: () => null, getFirstLinkpathDest: () => null },
    fileManager: { processFrontMatter: async () => {}, trashFile: async () => {}, getAvailablePathForAttachment: async (n) => n },
  };
  return app;
}

async function loadPlugin() {
  const obsidian = stubObsidian();
  const code = readFileSync(resolve(repo, 'main.js'), 'utf8');
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: (name) => { if (name === 'obsidian') return obsidian; throw new Error(`unexpected require: ${name}`); }, console, navigator: { clipboard: { writeText: async () => {} } } });
  vm.runInContext(code, context, { filename: 'main.js' });
  const PluginClass = module.exports.default ?? module.exports;
  const app = fakeApp(obsidian);
  const plugin = new PluginClass(app, JSON.parse(readFileSync(resolve(repo, 'manifest.json'), 'utf8')));
  return { plugin, app, obsidian };
}

test('main.js loads, the plugin constructs and onload wires the commands, the view and the post-processor', async () => {
  const { plugin, app } = await loadPlugin();
  await plugin.onload();
  assert.deepEqual(Array.from(plugin.commands, (c) => c.id), ['open-highlights-sidebar', 'copy-highlight-link', 'copy-note-link', 'copy-embed', 'highlight-selection', 'add-note-to-selection', 'draw-area-highlight', 'delete-highlight', 'cycle-color']);
  assert.deepEqual(Object.keys(plugin.views), ['icor-pdf-highlights']);
  assert.equal(plugin.postProcessors.length, 1);
  assert.equal(plugin.settingTabs.length, 1);
  assert.equal(plugin.settings.highlightsFolder, '04 Inner World/Documents/Highlights');
  for (const cb of app.layoutReady) cb();
  /* Every command's check runs against an empty workspace without throwing
     and, with nothing to act on, reports itself unavailable. */
  for (const c of plugin.commands) if (c.checkCallback) assert.equal(c.checkCallback(true), false, c.id);
  plugin.onunload();
});

test('the settings tab declares one group per settings group with the rows', async () => {
  const { plugin } = await loadPlugin();
  await plugin.onload();
  const defs = plugin.settingTabs[0].getSettingDefinitions();
  /* Arrays made inside the VM are of its realm; copy them into ours before
     a strict deep-equal (it compares prototypes). */
  assert.deepEqual(Array.from(defs, (g) => g.heading), ['Highlights', 'Viewer', 'Advanced']);
  assert.deepEqual(Array.from(defs).flatMap((g) => Array.from(g.items, (i) => i.control.type)), ['folder', 'dropdown', 'toggle', 'toggle', 'toggle', 'toggle']);
  await plugin.settingTabs[0].setControlValue('defaultColor', 'blue');
  assert.equal(plugin.settings.lastColor, 'blue');
});

test('a canvas file that appears fully formed schedules the canvas sync', async () => {
  const { plugin, app, obsidian } = await loadPlugin();
  await plugin.onload();
  for (const cb of app.layoutReady) cb();
  assert.deepEqual(Object.keys(app.vault.handlers).sort(), ['create', 'delete', 'modify', 'rename']);
  const fire = (name, ...args) => { for (const fn of app.vault.handlers[name]) fn(...args); };
  obsidian.debounced = 0;
  fire('create', new obsidian.TFile('Maps/new.canvas'));
  assert.ok(obsidian.debounced > 0, 'the sync was scheduled by the create');
  obsidian.debounced = 0;
  fire('create', new obsidian.TFile('Notes/plain.md'));
  assert.equal(obsidian.debounced, 0, 'a new note is the cache event\'s job');
  fire('modify', new obsidian.TFile('Maps/new.canvas'));
  assert.ok(obsidian.debounced > 0, 'a modified canvas schedules too');
  plugin.onunload();
});
