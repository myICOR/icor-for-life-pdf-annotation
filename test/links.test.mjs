/* Deep links: the subpath, the alias, the note link, the embed, the parser
 * and the match against the index. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbed, buildHighlightLink, buildNoteLink, buildSubpath, linkAlias, matchHighlight, nativeSubpath, parseSubpath, sameRect } from './build/pure.mjs';

const text = { id: 'a', notePath: 'H/n.md', sourceFile: 'D/p.pdf', page: 3, anchor: 'selection', color: 'yellow', quote: 'some [quoted] text | here', selection: [16, 0, 18, 42], rects: [[72, 640.2, 402.5, 654.9]], image: null };
const rect = { id: 'b', notePath: 'H/r.md', sourceFile: 'D/p.pdf', page: 5, anchor: 'rect', color: 'blue', quote: '', selection: null, rects: [[10.123, 20, 100, 200.456]], image: 'I/r.png' };

test('subpaths in the viewer and PDF++ form', () => {
  assert.equal(buildSubpath(text), 'page=3&selection=16,0,18,42&color=yellow');
  assert.equal(buildSubpath(rect), 'page=5&rect=10.12,20,100,200.46&color=blue');
  assert.equal(nativeSubpath(text), 'page=3&selection=16,0,18,42');
  assert.equal(nativeSubpath(rect), 'page=5');
});

test('the alias is the quote without link-breaking characters, or the area', () => {
  assert.equal(linkAlias(text), 'some quoted text here');
  assert.equal(linkAlias(rect), 'p5 area');
  assert.equal(linkAlias({ ...text, quote: 'w'.repeat(150) }), `${'w'.repeat(97)}...`);
  assert.equal(buildHighlightLink(text), '[[D/p.pdf#page=3&selection=16,0,18,42&color=yellow|some quoted text here]]');
  assert.equal(buildNoteLink('H/n.md'), '[[H/n]]');
  assert.equal(buildEmbed(text), '![[H/n#^quote]]');
  assert.equal(buildEmbed(rect), '![[H/r#^image]]');
  assert.equal(buildEmbed({ ...rect, image: null }), '![[H/r#^quote]]');
});

test('the parser reads page, selection, rect and color and ignores the rest', () => {
  assert.deepEqual(parseSubpath('#page=3&selection=16,0,18,42&color=yellow'), { page: 3, selection: [16, 0, 18, 42], color: 'yellow' });
  assert.deepEqual(parseSubpath('page=5&rect=100,200.46,10.12,20&color=blue&zoom=2'), { page: 5, rect: [10.12, 20, 100, 200.46], color: 'blue' });
  assert.deepEqual(parseSubpath('page=2&color=pink&selection=1,2,3'), { page: 2 });
  assert.deepEqual(parseSubpath('page=2&selection=1,-2,3,4'), { page: 2 });
  assert.equal(parseSubpath('page=0'), null);
  assert.equal(parseSubpath('outline-dest'), null);
  assert.equal(parseSubpath('height=300'), null);
});

test('a link matches the highlight it came from', () => {
  const list = [text, rect];
  assert.equal(matchHighlight(parseSubpath(buildSubpath(text)), list), text);
  assert.equal(matchHighlight(parseSubpath(buildSubpath(rect)), list), rect);
  assert.equal(matchHighlight({ page: 3, selection: [0, 0, 0, 1] }, list), null);
  assert.equal(matchHighlight({ page: 5, rect: [10.12, 20, 100, 200.46] }, list), rect, 'to a hundredth');
  assert.equal(sameRect([1, 2, 3, 4], [1, 2, 3, 4.005]), true);
  assert.equal(sameRect([1, 2, 3, 4], undefined), false);
});
