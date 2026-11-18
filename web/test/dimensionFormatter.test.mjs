import test from 'node:test';
import assert from 'node:assert/strict';
import { formatFractionalInches } from '../js/dimensionFormatter.js';
import { fmtLen as renderFmtLen } from '../js/render.js';
import { fmtLen as bomFmtLen, generateBOMCSV } from '../js/bomExporter.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';
import { exportSVG } from '../js/svg.js';
import { generatePDF } from '../js/pdfEngine.js';
import { newState, createRoom } from '../js/model.js';
import { evaluate } from '../js/codes.js';
import { WT } from '../js/geometry.js';
import { fmtLenInches, fmtDimensionText } from '../../designer3d/tools/constraintHandles.mjs';

test('formatFractionalInches formats integer feet and inches accurately', () => {
  assert.equal(formatFractionalInches(144), "12'");
  assert.equal(formatFractionalInches(144, { includeZeroInches: true }), '12\' 0"');
  assert.equal(formatFractionalInches(150), '12\' 6"');
  assert.equal(formatFractionalInches(150, { includeZeroInches: true }), '12\' 6"');
  assert.equal(formatFractionalInches(6), '6"');
  assert.equal(formatFractionalInches(12), "1'");
  assert.equal(formatFractionalInches(12, { includeZeroInches: true }), '1\' 0"');
});

test('formatFractionalInches formats sub-inch and mixed fractional values down to 1/16"', () => {
  assert.equal(formatFractionalInches(14.5), '1\' 2 1/2"');
  assert.equal(formatFractionalInches(150.5), '12\' 6 1/2"');
  assert.equal(formatFractionalInches(12.5), '1\' 1/2"');
  assert.equal(formatFractionalInches(12.5, { includeZeroInches: true }), '1\' 1/2"');
  assert.equal(formatFractionalInches(6.25), '6 1/4"');
  assert.equal(formatFractionalInches(0.375), '3/8"');
  assert.equal(formatFractionalInches(0.375, { includeZeroInches: true }), '3/8"');
});

test('formatFractionalInches reduces all sixteenth fractions by greatest common divisor', () => {
  const expected = [
    [1 / 16, '1/16"'],
    [2 / 16, '1/8"'],
    [3 / 16, '3/16"'],
    [4 / 16, '1/4"'],
    [5 / 16, '5/16"'],
    [6 / 16, '3/8"'],
    [7 / 16, '7/16"'],
    [8 / 16, '1/2"'],
    [9 / 16, '9/16"'],
    [10 / 16, '5/8"'],
    [11 / 16, '11/16"'],
    [12 / 16, '3/4"'],
    [13 / 16, '13/16"'],
    [14 / 16, '7/8"'],
    [15 / 16, '15/16"'],
  ];

  for (const [inches, formatted] of expected) {
    assert.equal(formatFractionalInches(inches), formatted);
  }
});

test('formatFractionalInches handles rollover rounding cleanly without 12" or 16/16" artifacts', () => {
  assert.equal(formatFractionalInches(11.99), "1'");
  assert.equal(formatFractionalInches(11.99, { includeZeroInches: true }), '1\' 0"');
  assert.equal(formatFractionalInches(155.99), "13'");
  assert.equal(formatFractionalInches(155.99, { includeZeroInches: true }), '13\' 0"');
  assert.equal(formatFractionalInches(14.99), '1\' 3"');
  assert.equal(formatFractionalInches(0.99), '1"');
});

test('formatFractionalInches handles zero, negative zero, and near-zero lengths', () => {
  assert.equal(formatFractionalInches(0), '0"');
  assert.equal(formatFractionalInches(0, { includeZeroInches: true }), '0\' 0"');
  assert.equal(formatFractionalInches(-0), '0"');
  assert.equal(formatFractionalInches(0.01), '0"');
  assert.equal(formatFractionalInches(-0.01), '0"');
  assert.equal(formatFractionalInches(-0.01, { includeZeroInches: true }), '0\' 0"');
});

test('formatFractionalInches preserves negative signs across fractional and whole dimensions', () => {
  assert.equal(formatFractionalInches(-14.5), '-1\' 2 1/2"');
  assert.equal(formatFractionalInches(-0.375), '-3/8"');
  assert.equal(formatFractionalInches(-6), '-6"');
  assert.equal(formatFractionalInches(-144), "-12'");
  assert.equal(formatFractionalInches(-144, { includeZeroInches: true }), '-12\' 0"');
  assert.equal(formatFractionalInches(-11.99, { includeZeroInches: true }), '-1\' 0"');
});

test('formatFractionalInches safely handles null, undefined, NaN, and non-finite inputs', () => {
  assert.equal(formatFractionalInches(null), '0"');
  assert.equal(formatFractionalInches(undefined), '0"');
  assert.equal(formatFractionalInches(Number.NaN), '0"');
  assert.equal(formatFractionalInches(Number.POSITIVE_INFINITY), '0"');
  assert.equal(formatFractionalInches(Number.NEGATIVE_INFINITY), '0"');
  assert.equal(formatFractionalInches(''), '0"');
  assert.equal(formatFractionalInches(false), '0"');
  assert.equal(formatFractionalInches(null, { includeZeroInches: true }), '0\' 0"');
  assert.equal(formatFractionalInches(Number.NaN, { includeZeroInches: true }), '0\' 0"');
});

test('rendering, constraint handles, overlay, SVG, PDF, and BOM modules emit consistent fractional dimensions', () => {
  assert.equal(renderFmtLen(150.5), '12\' 6 1/2"');
  assert.equal(renderFmtLen(11.99), "1'");
  assert.equal(fmtLenInches(144), '12\' 0"');
  assert.equal(fmtLenInches(11.99), '1\' 0"');
  assert.equal(fmtDimensionText(150.5, 126.375), '12\' 6 1/2" × 10\' 6 3/8"');
  assert.equal(bomFmtLen(150.5), '12\' 6 1/2"');
  assert.equal(bomFmtLen(null), '');
  assert.equal(bomFmtLen(undefined), '');
  assert.equal(bomFmtLen(Number.NaN), '');

  const state = newState();
  // interiorPolygon insets each wall by WT / 2, so interior width/height equals room w/h minus WT
  const room = createRoom(state, 'living', 0, 0, 150.5 + WT, 126.375 + WT);
  room.name = 'Fractional Studio';

  // Compliance overlay uses room.w and room.h directly for 4-vertex room dimension labels
  const overlayState = newState();
  const overlayRoom = createRoom(overlayState, 'living', 0, 0, 150.5, 126.375);
  const report = evaluate(overlayState);
  const scene = new ComplianceOverlayScene();
  scene.update(overlayState, report, { curLevel: 0, selection: overlayRoom.id });
  const dimLabel = scene.getNodesByType('dimensionLabel')[0];
  assert.equal(dimLabel.data.dimensionText, '12\' 6 1/2" × 10\' 6 3/8"');

  // SVG export encodes quotes as &quot; in label-sub and raw in schedule cell
  const svg = exportSVG(state, { sheetSize: 'letter', scale: '1/4' });
  assert.ok(
    svg.includes('12\' 6 1/2" × 10\' 6 3/8"') ||
      svg.includes('12&apos; 6 1/2&quot; × 10&apos; 6 3/8&quot;'),
    'SVG export should contain fractional room dimensions'
  );

  // BOM CSV schedule
  const csv = generateBOMCSV(state, {
    includeMetadata: false,
    includeFurniture: false,
    includeOpenings: false,
    includeFinishes: false,
    includeRooms: true,
  });
  assert.ok(
    csv.includes('"12\' 6 1/2"""') && csv.includes('"10\' 6 3/8"""'),
    'BOM CSV room schedule should preserve fractional dimensions with RFC 4180 quote escaping'
  );

  // PDF vector export
  const pdf = generatePDF(state, {
    pageSize: 'Letter',
    orientation: 'landscape',
    scale: '1/4"=1\'0"',
    includeRoomSchedule: true,
  });
  const pdfText = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  assert.ok(
    pdfText.includes('12\' 6 1/2"') && pdfText.includes('10\' 6 3/8"'),
    'Generated PDF should embed fractional dimension strings'
  );
});
