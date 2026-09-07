/* The canvas parser: which files a canvas places and which files each is
 * connected to by an edge, either direction. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileLinks, filesOn, parseCanvasJson, parseCanvasLinks } from './build/pure.mjs';

const node = (id, extra) => ({ id, x: 0, y: 0, width: 100, height: 100, ...extra });
const canvas = {
  nodes: [
    node('h', { type: 'file', file: 'H/hl.md', subpath: '#^quote' }),
    node('a', { type: 'file', file: 'Notes/A.md' }),
    node('b', { type: 'file', file: 'Notes/B.md' }),
    node('h2', { type: 'file', file: 'H/hl.md' }),
    node('t', { type: 'text', text: 'a text card' }),
    node('g', { type: 'group', label: 'G' }),
    node('c', { type: 'file', file: 'Maps/child.canvas' }),
  ],
  edges: [
    { id: 'e1', fromNode: 'h', toNode: 'a' },
    { id: 'e2', fromNode: 'b', toNode: 'h2', fromEnd: 'arrow', toEnd: 'none' },
    { id: 'e3', fromNode: 'h', toNode: 't' },
    { id: 'e4', fromNode: 'h', toNode: 'h2' },
    { id: 'e5', fromNode: 'h', toNode: 'h' },
    { id: 'e6', fromNode: 'a', toNode: 'missing' },
    { id: 'e7', fromNode: 'c', toNode: 'h' },
  ],
  metadata: { icorCanvases: { version: 1, strokes: [] } },
};

test('every file card with the files its cards connect to, either direction', () => {
  const links = fileLinks(canvas);
  assert.deepEqual(links.get('H/hl.md'), ['Maps/child.canvas', 'Notes/A.md', 'Notes/B.md']);
  assert.deepEqual(links.get('Notes/A.md'), ['H/hl.md']);
  assert.deepEqual(links.get('Notes/B.md'), ['H/hl.md']);
  assert.deepEqual(links.get('Maps/child.canvas'), ['H/hl.md']);
  assert.deepEqual(filesOn(canvas), ['H/hl.md', 'Maps/child.canvas', 'Notes/A.md', 'Notes/B.md']);
});

test('malformed input yields nothing, not a throw', () => {
  assert.equal(parseCanvasJson('{'), null);
  assert.equal(parseCanvasJson('[]'), null);
  assert.equal(parseCanvasLinks('not json'), null);
  assert.deepEqual(fileLinks({}), new Map());
  assert.deepEqual(fileLinks({ nodes: [{ id: 'x' }, 'junk'], edges: ['junk'] }), new Map());
  assert.deepEqual(parseCanvasLinks(JSON.stringify(canvas)).get('Notes/A.md'), ['H/hl.md']);
});
