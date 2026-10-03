import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { commit } from '../js/codes.js';
import { generatePDF, SCALE_OPTIONS, SHEET_SIZES } from '../js/pdfEngine.js';

test('pdfEngine scale options map 1/4"=1\'0" scale correctly', () => {
  const scaleOpt = SCALE_OPTIONS['1/4"=1\'0"'];
  assert.ok(scaleOpt, 'scale option 1/4"=1\'0" must exist');

  // Model distance: 12 inches (1 foot)
  const modelInches = 12;

  // Points per model inch
  const ptPerInch = scaleOpt.ptPerInch;

  // Paper points = 12 * 1.5 = 18 pt
  const paperPoints = modelInches * ptPerInch;
  assert.equal(paperPoints, 18);

  // 1 inch = 72 pt, so 18 pt = 0.25 inches (1/4 inch)
  const paperInches = paperPoints / 72;
  assert.equal(
    paperInches,
    0.25,
    '12 inches of model distance must map to 0.25 (1/4) inches on paper'
  );
});

test('generatePDF creates valid vector PDF for a sample home', () => {
  let doc = M.newState();
  doc.name = 'Test Residence';

  const r1 = commit(doc, (n) => M.placeRoomKit(n, 'kit_living', 0, 0, 0));
  if (r1.ok) doc = r1.state;

  const r2 = commit(doc, (n) => M.placeRoomKit(n, 'kit_bedroom', 240, 0, 0));
  if (r2.ok) doc = r2.state;

  const pdf = generatePDF(doc, {
    pageSize: 'Letter',
    orientation: 'landscape',
    scale: '1/4"=1\'0"',
    projectTitle: 'Test Residence',
    designer: 'Jane Designer',
    date: '2026-10-03',
    includeTitleBlock: true,
    includeScaleBar: true,
    includeRoomSchedule: true,
  });

  assert.ok(pdf, 'generatePDF must return a pdf object');
  const buf = pdf.output('arraybuffer');
  assert.ok(buf.byteLength > 1000, 'generated PDF arraybuffer must contain data');

  // Verify page count (Floorplan + Room Schedule)
  const pageCount = pdf.getNumberOfPages();
  assert.ok(pageCount >= 2, 'PDF must contain floorplan page and room schedule page');
});

test('generatePDF supports Fit to Page scale option', () => {
  let doc = M.newState();
  doc.name = 'Fit Test Home';

  const r1 = commit(doc, (n) => M.placeRoomKit(n, 'kit_living', 0, 0, 0));
  if (r1.ok) doc = r1.state;

  const pdf = generatePDF(doc, {
    pageSize: 'A4',
    orientation: 'landscape',
    scale: 'fit',
    includeTitleBlock: true,
    includeScaleBar: true,
    includeRoomSchedule: false,
  });

  assert.ok(pdf);
  const buf = pdf.output('arraybuffer');
  assert.ok(buf.byteLength > 500);
});

test('generatePDF automatically paginates room schedule if many rooms present', () => {
  let doc = M.newState();
  doc.name = 'Mansion Project';

  // Add 30 rooms to trigger room schedule pagination
  for (let i = 0; i < 30; i++) {
    doc.rooms.push({
      id: `room_${i}`,
      type: i % 2 === 0 ? 'bedroom' : 'living',
      name: `Room ${i + 1}`,
      x: (i % 5) * 120,
      y: Math.floor(i / 5) * 120,
      w: 108,
      h: 108,
      ceiling: 96,
      floor: 'oak',
      walls: { N: 'drywall', E: 'drywall', S: 'drywall', W: 'drywall' },
      items: [],
      openings: [],
      level: 0,
    });
  }

  const pdf = generatePDF(doc, {
    pageSize: 'Letter',
    orientation: 'landscape',
    scale: '1/8"=1\'0"',
    includeRoomSchedule: true,
  });

  const pageCount = pdf.getNumberOfPages();
  assert.ok(
    pageCount >= 3,
    `PDF with 30 rooms must paginate across at least 3 pages (got ${pageCount})`
  );
});
