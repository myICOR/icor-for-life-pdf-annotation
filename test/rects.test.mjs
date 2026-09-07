/* Rect maths: the viewport transform both ways, merging per line, union,
 * containment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInverse, applyTransform, mergeLineRects, pdfRectToView, rectContains, roundRect, unionRects, viewRectToPdf, isMatrix } from './build/pure.mjs';

/* pdf.js at scale 2 on a 612 x 792 page, no rotation: x scales, y flips. */
const m = [2, 0, 0, -2, 0, 1584];

test('the transform maps PDF space to page pixels and back', () => {
  assert.deepEqual(applyTransform(m, 0, 792), [0, 0]);
  assert.deepEqual(applyTransform(m, 306, 396), [612, 792]);
  assert.deepEqual(applyInverse(m, 612, 792), [306, 396]);
  assert.deepEqual(pdfRectToView([72, 700, 172, 720], m), [144, 144, 344, 184]);
  assert.deepEqual(viewRectToPdf([144, 144, 344, 184], m), [72, 700, 172, 720]);
  assert.equal(isMatrix(m), true);
  assert.equal(isMatrix([1, 2]), false);
});

test('rectangles on one line merge, lines stay apart, empties drop', () => {
  const merged = mergeLineRects([
    [10, 10, 50, 22],
    [52, 10.5, 90, 22],
    [10, 40, 60, 52],
    [95, 11, 120, 21],
    [200, 11, 200, 21],
    [130, 10, 150, 22],
  ]);
  /* 95 is five units past 90 and merges; 130 is ten past 120 and does not. */
  assert.deepEqual(merged, [[10, 10, 120, 22], [130, 10, 150, 22], [10, 40, 60, 52]]);
});

test('union, containment and rounding', () => {
  assert.deepEqual(unionRects([[1, 2, 3, 4], [0, 5, 2, 6]]), [0, 2, 3, 6]);
  assert.equal(unionRects([]), null);
  assert.equal(rectContains([0, 0, 10, 10], 5, 5), true);
  assert.equal(rectContains([0, 0, 10, 10], 11, 5), false);
  assert.deepEqual(roundRect([1.234, 2.345, 3.456, 4.567]), [1.23, 2.35, 3.46, 4.57]);
});
