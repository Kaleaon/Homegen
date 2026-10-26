import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlanScale } from '../js/planScale.js';
import { generatePDF, SCALE_OPTIONS } from '../js/pdfEngine.js';
import { newState, createRoom } from '../js/model.js';

test('fit ratio uses model inches and paper inches, without a feet conversion', () => {
  const result = resolvePlanScale(
    { minX: 0, minY: 0, maxX: 480, maxY: 240 },
    { w: 760, h: 400 },
    { fit: true }
  );
  assert.equal(result.scalePt, 1.5);
  assert.equal(result.denominator, 48);
  assert.equal(result.label, 'Fit to Page (1:48.00 approx.)');
  // A 12-inch model ruler must measure a quarter inch on paper.
  assert.equal((12 * result.scalePt) / 72, 0.25);
});

test('large plans can fit below the previous 0.2 pt/in minimum', () => {
  const result = resolvePlanScale(
    { minX: -10000, minY: -5000, maxX: 10000, maxY: 5000 },
    { w: 760, h: 400 },
    { fit: true }
  );
  assert.ok(result.scalePt < 0.2);
  assert.ok(20000 * result.scalePt <= 720);
  assert.ok(10000 * result.scalePt <= 360);
});

test('fixed scales preserve exact dimensions and reject overflowing sheets', () => {
  const bounds = { minX: 0, minY: 0, maxX: 480, maxY: 240 };
  const scale = SCALE_OPTIONS['1/4"=1\'0"'];
  assert.equal(resolvePlanScale(bounds, { w: 760, h: 400 }, scale).scalePt, 1.5);
  assert.throws(
    () => resolvePlanScale(bounds, { w: 600, h: 400 }, scale),
    /Choose a larger sheet, a smaller scale, or Fit to Page/
  );
});

test('invalid printable areas and degenerate plans fail explicitly', () => {
  for (const maxX of [0, NaN, Infinity]) {
    assert.throws(
      () =>
        resolvePlanScale({ minX: 0, minY: 0, maxX, maxY: 120 }, { w: 760, h: 400 }, { fit: true }),
      /invalid plan bounds/
    );
  }
  assert.throws(
    () =>
      resolvePlanScale(
        { minX: 0, minY: 0, maxX: 120, maxY: 120 },
        { w: 30, h: 400 },
        { fit: true }
      ),
    /printable area/
  );
});

test('PDF exports use the same fit scale on different-sized floors', () => {
  const doc = newState();
  createRoom(doc, 'living', 0, 0, 240, 240, { level: 0 });
  createRoom(doc, 'living', 0, 0, 120, 120, { level: 1 });
  const pdf = generatePDF(doc, { scale: 'fit', includeRoomSchedule: false });
  assert.equal(pdf.getNumberOfPages(), 2);
  const labels = [...pdf.output().matchAll(/Fit to Page .*?1:([\d.]+) approx\./g)];
  assert.ok(labels.length >= 2, 'Every floor should carry the actual scale');
  assert.equal(new Set(labels.map((match) => match[1])).size, 1);
});

test('PDF refuses to crop a large plan at a declared fixed scale', () => {
  const doc = newState();
  createRoom(doc, 'living', 0, 0, 2000, 2000);
  assert.throws(() => generatePDF(doc), /Plan does not fit/);
  assert.ok(
    generatePDF(doc, { scale: 'fit', includeRoomSchedule: false }).output().startsWith('%PDF')
  );
});
