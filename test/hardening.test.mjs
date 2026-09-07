/* Vex's 0.1.1 audit, kept closed: a crafted note cannot steer a delete,
 * a folder setting cannot climb, an id cannot break a selector, a source
 * cannot break the link it goes into. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFolder, isOwnImage, linkTarget, readHighlight } from './build/pure.mjs';

const base = { type: 'pdf-highlight', highlight_id: 'k3f9x2mq7a1b', source_file: '[[D/paper.pdf]]', page: 3, anchor: 'rect', rects: [[0, 0, 10, 10]] };

test('only the PNG the plugin wrote for the highlight counts as its image', () => {
  const h = readHighlight({ ...base, image: '[[04 Inner World/Documents/passport.pdf]]' }, 'H/n.md');
  assert.equal(h.image, '04 Inner World/Documents/passport.pdf', 'the field is read as written');
  assert.equal(isOwnImage('pdf', 'passport', h), false, 'but it is never trashed with the note');
  assert.equal(isOwnImage('png', 'paper-p3-k3f9x2mq7a1b', h), true);
  assert.equal(isOwnImage('png', 'paper-p4-k3f9x2mq7a1b', h), false, 'another page');
  assert.equal(isOwnImage('png', 'paper-p3-other', h), false, 'another id');
  assert.equal(isOwnImage('jpg', 'paper-p3-k3f9x2mq7a1b', h), false, 'another type');
});

test('the highlights folder rejects dot segments', () => {
  assert.equal(cleanFolder('../../x', 'D'), 'D');
  assert.equal(cleanFolder('a/./b', 'D'), 'D');
  assert.equal(cleanFolder('a/../b', 'D'), 'D');
  assert.equal(cleanFolder('/a//b\\c/', 'D'), 'a/b/c');
  assert.equal(cleanFolder('  ', 'D'), 'D');
});

test('an id is a plain token or the note is not a highlight', () => {
  assert.equal(readHighlight({ ...base, highlight_id: 'a"]' }, 'n.md'), null);
  assert.equal(readHighlight({ ...base, highlight_id: 'x] , .icor-pdfa-rect' }, 'n.md'), null);
  assert.equal(readHighlight({ ...base, highlight_id: ' ' }, 'n.md'), null);
  assert.equal(readHighlight({ ...base, highlight_id: 'x'.repeat(65) }, 'n.md'), null);
  assert.ok(readHighlight({ ...base, highlight_id: 'Ab_-9' }, 'n.md'));
});

test('a link target that would break a wikilink is no target', () => {
  assert.equal(linkTarget('a.pdf]] evil text [[b'), null);
  assert.equal(linkTarget('a|b'), null);
  assert.equal(linkTarget('a#b'), null);
  assert.equal(linkTarget('[[ok/file.pdf|alias]]'), 'ok/file.pdf');
  assert.equal(readHighlight({ ...base, source_file: 'a.pdf]] evil [[b' }, 'n.md'), null);
});
