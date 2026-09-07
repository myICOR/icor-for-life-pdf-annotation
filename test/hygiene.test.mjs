/* Text properties of the repo: what the directory's scanner reads, what the
 * team's hard rules say, and what the private-API discipline requires. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(repo, f), 'utf8');

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === 'build' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/* Every text file in the repo except this one, which carries the very
   strings it forbids. */
const self = resolve(repo, 'test/hygiene.test.mjs');
const textFiles = ['README.md', 'CHANGELOG.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md', 'CONTRIBUTING.md', 'LICENSE', 'manifest.json', 'package.json', 'styles.css', 'esbuild.config.mjs', 'eslint.config.mjs']
  .map((f) => resolve(repo, f))
  .filter((f) => statSync(f, { throwIfNoEntry: false })?.isFile())
  .concat(walk(resolve(repo, 'src'), ['.ts']), walk(resolve(repo, 'test'), ['.mjs', '.ts']), walk(resolve(repo, 'docs'), ['.md']), walk(resolve(repo, '.github'), ['.yml']))
  .filter((f) => f !== self);

const sources = walk(resolve(repo, 'src'), ['.ts']);
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('no em dash or en dash anywhere in the repo text', () => {
  const hits = [];
  for (const f of textFiles) {
    for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (/[—–]/.test(line)) hits.push(`${f.slice(repo.length + 1)}:${i + 1}`);
    }
  }
  assert.deepEqual(hits, [], `dashes at:\n  ${hits.join('\n  ')}`);
});

test('the plugin touches no global it should not and writes no raw HTML or inline style', () => {
  const banned = [
    [/vault\.config/, 'app.vault.config'],
    [/app\.plugins\b/, 'app.plugins'],
    [/internalPlugins/, 'app.internalPlugins'],
    [/window\.event/, 'window.event'],
    [/\bprocess\./, 'Node process'],
    [/\bdocument\./, 'the global document'],
    [/\bsetTimeout\(|\bsetInterval\(/, 'a bare timer'],
    [/console\.(log|info|error)\(/, 'console output outside the debug and degrade channels'],
    [/\beval\(|new Function\(/, 'dynamic code'],
    [/\.style\.[a-zA-Z]+\s*=/, 'an inline style write'],
    [/innerHTML|outerHTML/, 'raw HTML'],
    [/\bfetch\(|XMLHttpRequest|WebSocket|requestUrl/, 'a network call'],
    [/from ['"](node:)?(fs|child_process|path|os|electron)['"]/, 'a Node module'],
    [/\brequire\(/, 'a require call'],
    [/\(\?<[=!]/, 'a regex lookbehind'],
    [/!important/, '!important'],
    [/\bactiveLeaf\b/, 'the deprecated activeLeaf'],
    [/window\.confirm|window\.alert|window\.prompt/, 'a native dialog'],
    [/pdfjs-dist/, 'a bundled pdf.js'],
  ];
  for (const f of sources) {
    const text = stripComments(readFileSync(f, 'utf8'));
    for (const [re, what] of banned) assert.doesNotMatch(text, re, `${f.slice(repo.length + 1)} uses ${what}`);
  }
  const warn = sources.filter((f) => /console\.warn\(/.test(stripComments(readFileSync(f, 'utf8'))));
  assert.deepEqual(warn.map((f) => f.slice(repo.length + 1)), ['src/log.ts'], 'console.warn lives in the degrade channel only');
});

test('every private member is named in internals.ts and guarded before use', () => {
  const internals = read('src/internals.ts');
  const declared = new Set([...internals.matchAll(/^\s{2}(\w+): '(function|element|object|boolean|number|array)',$/gm)].map((m) => m[1]));
  assert.ok(declared.size >= 12, 'the member tables are present');
  const requested = new Set();
  for (const f of sources) {
    const text = stripComments(readFileSync(f, 'utf8'));
    for (const m of text.matchAll(/(?:requireCanvas|requireChild|requireViewer|dragManager)\([^,]+, \[([^\]]*)\]/g)) {
      for (const name of m[1].matchAll(/'(\w+)'/g)) requested.add(name[1]);
    }
  }
  assert.ok(requested.size >= 4, 'features ask for members by name');
  for (const name of requested) assert.ok(declared.has(name), `${name} is requested but not declared in a member table`);
  /* No feature module reaches for a private object on its own. */
  for (const f of sources) {
    if (f.endsWith('/internals.ts')) continue;
    const text = stripComments(readFileSync(f, 'utf8'));
    const rel = f.slice(repo.length + 1);
    assert.doesNotMatch(text, /as any\b/, `${rel} casts to any`);
    assert.doesNotMatch(text, /\.dragManager\b/, `${rel} reaches app.dragManager outside the adapter`);
    assert.doesNotMatch(text, /\bview\.viewer\b|\.viewer\.child\b/, `${rel} reaches the PDF viewer outside the adapter`);
    assert.doesNotMatch(text, /\bpdfjsLib\b|\bpdfjsViewer\b/, `${rel} reaches the pdf.js globals outside the adapter`);
    assert.doesNotMatch(text, /'textLayerNode'|"textLayerNode"/, `${rel} names the text-layer class outside the adapter`);
  }
});

test('every class the plugin adds carries the icor-pdfa- prefix, apart from what it borrows on purpose', () => {
  const borrowed = new Set(['clickable-icon', 'mod-warning', 'is-empty', 'is-active', 'is-hidden', 'is-selected', 'is-flashing']);
  for (const f of sources) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/(?:addClass|cls:)\s*\(?\s*(\[[^\]]*\]|'[^']+'|`[^`]+`|[A-Z_]+_CLASS)/g)) {
      if (/^[A-Z_]+_CLASS$/.test(m[1])) {
        const value = text.match(new RegExp(`const ${m[1]} = '([^']+)'`))?.[1] ?? '';
        assert.ok(value.startsWith('icor-pdfa-'), `${f.slice(repo.length + 1)}: ${m[1]} = ${value}`);
        continue;
      }
      for (const cls of m[1].matchAll(/['`]([^'`]+)['`]/g)) {
        const name = cls[1].replace(/\$\{[^}]*\}/g, 'x');
        assert.ok(name.startsWith('icor-pdfa-') || borrowed.has(name) || /^is-x$/.test(name), `${f.slice(repo.length + 1)}: class ${name}`);
      }
    }
  }
});

test('the stylesheet: prefixed selectors, Obsidian variables only, no hex, no pixel, no !important', () => {
  const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'a hex colour');
  assert.doesNotMatch(css, /!important/);
  assert.doesNotMatch(css, /\d(px|em|rem)\b/, 'a literal length; sizes come from --size-* and --radius-*');
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    for (const selector of m[1].split(',')) {
      const s = selector.trim();
      if (/^\d+%$|^from$|^to$/.test(s)) continue;
      assert.match(s, /icor-pdfa-|icor-pdf-highlight/, `selector ${s} does not carry the prefix`);
    }
  }
  for (const m of css.matchAll(/(?:^|[\s;{])(color|background[a-z-]*|z-index|font-weight|height|width|border-radius|stroke)\s*:\s*([^;]+);/g)) {
    assert.match(m[2].trim(), /^var\(--|^calc\(|^rgba?\(var\(--|^\d+%?$|^currentColor$|^none$|^transparent$|^fit-content$/, `${m[1]}: ${m[2].trim()} is not an Obsidian variable`);
  }
});

test('the built plugin bundles nothing but its own code', () => {
  const main = read('main.js');
  assert.match(main, /require\("obsidian"\)/);
  assert.doesNotMatch(main, /node_modules/, 'a dependency was bundled');
  assert.doesNotMatch(main, /pdfjs-dist/, 'pdf.js must come from the host');
  assert.ok(main.length < 96000, `main.js is ${main.length} bytes; expected a small plugin`);
});
