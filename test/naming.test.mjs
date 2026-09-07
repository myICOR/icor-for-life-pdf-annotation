/* Names and folders: what a note and an image are called and where. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ancestors, basename, dirname, folderFor, imageFileName, joinPath, noteBaseName, sanitizeName, slugOf, uniquePath } from './build/pure.mjs';

test('path helpers', () => {
  assert.equal(basename('a/b/c.pdf'), 'c');
  assert.equal(basename('c'), 'c');
  assert.equal(basename('a/.hidden'), '.hidden');
  assert.equal(dirname('a/b/c.pdf'), 'a/b');
  assert.equal(dirname('c.pdf'), '');
  assert.equal(joinPath('a/', '/b', '', 'c'), 'a/b/c');
  assert.deepEqual(ancestors('a/b/c'), ['a', 'a/b', 'a/b/c']);
});

test('names lose what a file name or a wikilink cannot carry', () => {
  assert.equal(sanitizeName('  Paper: "Draft" [v2] #1 | ^x?  '), 'Paper Draft v2 1 x');
  assert.equal(sanitizeName('...dots...'), 'dots');
  assert.equal(slugOf('My Paper (2026) v2'), 'my-paper-2026-v2');
  assert.equal(slugOf('???'), 'pdf');
});

test('the folder is the root plus the PDF basename', () => {
  assert.equal(folderFor('04 Inner World/Documents/Highlights', 'x/y/Paper Title.pdf'), '04 Inner World/Documents/Highlights/Paper Title');
  assert.equal(folderFor('H', 'x/???.pdf'), 'H/PDF');
});

test('note and image names', () => {
  assert.equal(noteBaseName('2026-09-07-101500', 3, 'abc123def456'), '2026-09-07-101500-p3-abc1');
  assert.equal(imageFileName('x/My Paper.pdf', 3, 'abc123def456'), 'my-paper-p3-abc123def456.png');
});

test('a taken name gets a numeric suffix', () => {
  const taken = new Set(['H/P/n.md', 'H/P/n 2.md']);
  assert.equal(uniquePath('H/P', 'n', '.md', (p) => taken.has(p)), 'H/P/n 3.md');
  assert.equal(uniquePath('H/P', 'm', '.md', (p) => taken.has(p)), 'H/P/m.md');
});
