/* The highlight model: ids, link targets, the frontmatter reader, the note
 * builder and a round trip through a reader of the YAML subset the builder
 * writes, the body helpers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_LENGTH, NOTE_HEADING, annotationText, buildBody, buildFrontmatter, buildNoteText, compareOnPage, firstContentLine, isoLocal, linkTarget, namesPdf,
  newId, noteBody, notePreview, quoteLine, readHighlight, replaceQuoteLine, sortRectsTopDown, stampOf, targetOf, wikilink, yamlString,
} from './build/pure.mjs';

/* A reader of exactly the YAML the builder writes: `key: scalar`, double
   quoted strings with \\ and \" escapes, flow arrays of numbers, strings
   and nested arrays. Not a YAML parser; a mirror of buildFrontmatter. */
function readFlow(s) {
  let i = 0;
  const skip = () => { while (s[i] === ' ' || s[i] === ',') i++; };
  const value = () => {
    skip();
    if (s[i] === '[') { i++; const out = []; skip(); while (s[i] !== ']') { out.push(value()); skip(); } i++; return out; }
    if (s[i] === '"') { i++; let out = ''; while (s[i] !== '"') { if (s[i] === '\\') { i++; } out += s[i]; i++; } i++; return out; }
    let raw = ''; while (i < s.length && s[i] !== ',' && s[i] !== ']') raw += s[i++];
    raw = raw.trim(); return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  };
  return value();
}
function readFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const out = {};
  for (const line of m[1].split('\n')) {
    const at = line.indexOf(': ');
    const key = line.slice(0, at), raw = line.slice(at + 2);
    out[key] = raw.startsWith('[') || raw.startsWith('"') ? readFlow(raw) : /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}

const full = {
  id: 'abc123def456',
  notePath: 'H/x/2026-09-07-101500-p3-abc1.md',
  sourceFile: '04 Inner World/Documents/_files/paper.pdf',
  document: '04 Inner World/Documents/paper',
  page: 3,
  anchor: 'selection',
  color: 'green',
  quote: 'the "quoted" text, with a \\ backslash',
  selection: [16, 0, 18, 42],
  rects: [[72, 640.2, 402.5, 654.9], [72, 620, 300, 634]],
  image: null,
  created: '2026-09-07T10:15:00',
  canvases: ['Maps/Reading.canvas'],
  linkedNotes: ['Notes/A', 'Notes/B'],
};

test('an id is twelve lowercase letters and digits from the random source', () => {
  let n = 0;
  const id = newId(() => ((n++ * 7919) % 1000) / 1000);
  assert.equal(id.length, ID_LENGTH);
  assert.match(id, /^[a-z0-9]{12}$/);
  assert.notEqual(newId(), newId());
});

test('link targets come out of every wikilink shape', () => {
  assert.equal(linkTarget('[[a/b.pdf]]'), 'a/b.pdf');
  assert.equal(linkTarget('[[a/b.pdf|alias]]'), 'a/b.pdf');
  assert.equal(linkTarget('[[a/b#page=3|alias]]'), 'a/b');
  assert.equal(linkTarget('![[img.png]]'), 'img.png');
  assert.equal(linkTarget('plain/path.pdf'), 'plain/path.pdf');
  assert.equal(linkTarget(''), null);
  assert.equal(linkTarget(3), null);
  assert.equal(wikilink('x'), '[[x]]');
  assert.equal(targetOf('a/b.md'), 'a/b');
  assert.equal(targetOf('a/b.canvas'), 'a/b.canvas');
});

test('the note text round-trips through the reader', () => {
  const text = buildNoteText(full);
  const fm = readFrontmatter(text);
  assert.equal(fm.type, 'pdf-highlight');
  assert.equal(fm.source_file, '[[04 Inner World/Documents/_files/paper.pdf]]');
  assert.equal(fm.document, '[[04 Inner World/Documents/paper]]');
  assert.deepEqual(fm.cssclasses, ['icor-pdf-highlight']);
  const back = readHighlight(fm, full.notePath);
  assert.deepEqual(back, full);
  assert.deepEqual(Object.keys(fm), ['type', 'highlight_id', 'source_file', 'document', 'page', 'anchor', 'selection', 'rects', 'color', 'quote', 'created', 'canvases', 'linked_notes', 'cssclasses']);
});

test('the body is the quote line, the image line for a rect, a blank, the heading, a blank', () => {
  assert.equal(buildBody(full), `> the "quoted" text, with a \\ backslash ^quote\n\n${NOTE_HEADING}\n\n`);
  const rect = { ...full, anchor: 'rect', selection: null, quote: '', image: '05 Assets/Images/paper-p3-abc123def456.png', rects: [[10, 10, 100, 50]] };
  assert.equal(buildBody(rect), `> Area on page 3 ^quote\n![[05 Assets/Images/paper-p3-abc123def456.png]] ^image\n\n${NOTE_HEADING}\n\n`);
  const fm = readFrontmatter(buildNoteText(rect));
  assert.equal(fm.anchor, 'rect');
  assert.equal(fm.selection, undefined);
  assert.equal(fm.image, '[[05 Assets/Images/paper-p3-abc123def456.png]]');
  assert.deepEqual(readHighlight(fm, rect.notePath), rect);
  assert.doesNotMatch(buildFrontmatter({ ...full, document: null }), /document:/);
});

test('the reader refuses what is not a highlight and defaults the rest', () => {
  assert.equal(readHighlight(null, 'a.md'), null);
  assert.equal(readHighlight({ type: 'document' }, 'a.md'), null);
  assert.equal(readHighlight({ type: 'pdf-highlight', source_file: '[[x.pdf]]', page: 1, rects: [[0, 0, 1, 1]] }, 'a.md'), null, 'no id');
  assert.equal(readHighlight({ type: 'pdf-highlight', highlight_id: 'x', page: 1, rects: [[0, 0, 1, 1]] }, 'a.md'), null, 'no source');
  assert.equal(readHighlight({ type: 'pdf-highlight', highlight_id: 'x', source_file: '[[x.pdf]]', page: 0, rects: [[0, 0, 1, 1]] }, 'a.md'), null, 'page 0');
  assert.equal(readHighlight({ type: 'pdf-highlight', highlight_id: 'x', source_file: '[[x.pdf]]', page: 1, rects: [] }, 'a.md'), null, 'no rects');
  const h = readHighlight({ type: 'pdf-highlight', highlight_id: 'x', source_file: 'x.pdf', page: 2, rects: [[10, 20, 5, 2], 'bad'], color: 'pink', created: new Date(2026, 8, 7, 10, 15, 0), linked_notes: ['[[a]]', '[[a]]', 7], canvases: null, quote: ' a \n b ' }, 'a.md');
  assert.deepEqual(h, {
    id: 'x', notePath: 'a.md', sourceFile: 'x.pdf', document: null, page: 2, anchor: 'rect', color: 'yellow', quote: 'a b', selection: null,
    rects: [[5, 2, 10, 20]], image: null, created: '2026-09-07T10:15:00', canvases: [], linkedNotes: ['a'],
  });
  const withSelection = readHighlight({ type: 'pdf-highlight', highlight_id: 'x', source_file: 'x.pdf', page: 2, rects: [[0, 0, 1, 1]], selection: [1, 2, 3, 4] }, 'a.md');
  assert.equal(withSelection.anchor, 'selection');
  assert.deepEqual(withSelection.selection, [1, 2, 3, 4]);
  const badSelection = readHighlight({ type: 'pdf-highlight', highlight_id: 'x', source_file: 'x.pdf', page: 2, rects: [[0, 0, 1, 1]], anchor: 'selection', selection: [1, -2, 3, 4] }, 'a.md');
  assert.equal(badSelection.selection, null);
});

test('yaml strings escape what would break the line', () => {
  assert.equal(yamlString('a "b" \\ c\nd'), '"a \\"b\\" \\\\ c d"');
  assert.equal(quoteLine({ quote: '', page: 4, anchor: 'rect' }), '> Area on page 4 ^quote');
  assert.equal(quoteLine({ quote: '', page: 4, anchor: 'selection' }), '> Page 4 ^quote');
  assert.equal(isoLocal(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02T03:04:05');
  assert.equal(stampOf(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02-030405');
});

test('the body helpers find the annotation and the first content line', () => {
  const text = buildNoteText(full) + 'My *thought* here.\n\n- and a list\n';
  assert.equal(noteBody(text).startsWith('> the'), true);
  assert.equal(annotationText(text), 'My *thought* here.\n\n- and a list');
  assert.equal(notePreview(text), 'My thought here. and a list');
  assert.equal(notePreview(buildNoteText(full)), '');
  assert.equal(annotationText('> q ^quote\n![[i.png]] ^image\nfree text'), 'free text');
  assert.equal(notePreview('---\na: 1\n---\n' + 'x'.repeat(300)), 'x'.repeat(199) + '…');
  assert.equal(firstContentLine(buildNoteText(full)), 16, 'two fences and fourteen fields');
  assert.equal(firstContentLine('---\na: 1\n---\n\n\n> q'), 5);
  assert.equal(firstContentLine('hello'), 0);
  assert.equal(firstContentLine('---\na: 1\n---\n\n'), -1);
  assert.equal(replaceQuoteLine(text, '> new ^quote'), text.replace(/^> .*\^quote$/m, '> new ^quote'));
  assert.equal(replaceQuoteLine('no quote line', '> new ^quote'), 'no quote line');
});

test('ordering: page, then top of the page, then left', () => {
  const a = { ...full, page: 1, rects: [[10, 700, 20, 710]] };
  const b = { ...full, page: 1, rects: [[10, 600, 20, 610]] };
  const c = { ...full, page: 1, rects: [[30, 700, 40, 710]] };
  const d = { ...full, page: 2, rects: [[0, 900, 1, 901]] };
  assert.deepEqual([d, c, b, a].sort(compareOnPage), [a, c, b, d]);
  assert.deepEqual(sortRectsTopDown([[0, 1, 1, 2], [0, 5, 1, 6], [2, 5, 3, 6]]), [[0, 5, 1, 6], [2, 5, 3, 6], [0, 1, 1, 2]]);
});

test('a document note names the PDF by path or by file name', () => {
  assert.equal(namesPdf('[[04 Inner World/Documents/_files/paper.pdf]]', '04 Inner World/Documents/_files/paper.pdf'), true);
  assert.equal(namesPdf('paper.pdf', '04 Inner World/Documents/_files/paper.pdf'), true);
  assert.equal(namesPdf('Dropbox/Legal/Paper.PDF', '04 Inner World/Documents/_files/paper.pdf'), true);
  assert.equal(namesPdf('other.pdf', '04 Inner World/Documents/_files/paper.pdf'), false);
  assert.equal(namesPdf(undefined, 'x.pdf'), false);
});
