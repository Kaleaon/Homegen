import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { commit } from '../js/codes.js';
import { generatePDF, SCALE_OPTIONS } from '../js/pdfEngine.js';

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
    scale: 'fit',
    includeRoomSchedule: true,
  });

  const pageCount = pdf.getNumberOfPages();
  assert.ok(
    pageCount >= 3,
    `PDF with 30 rooms must paginate across at least 3 pages (got ${pageCount})`
  );
});

test('generatePDF throws error when document has no rooms', () => {
  assert.throws(() => generatePDF({ rooms: [] }), {
    name: 'Error',
    message: 'Cannot export PDF: add at least one room first.',
  });

  assert.throws(() => generatePDF({ rooms: null }), {
    name: 'Error',
    message: 'Cannot export PDF: add at least one room first.',
  });

  assert.throws(() => generatePDF({}), {
    name: 'Error',
    message: 'Cannot export PDF: add at least one room first.',
  });
});

test('generatePDF exports valid vector PDF for L-shaped polygon rooms', () => {
  let doc = M.newState();
  doc.name = 'L-Shaped Modern Residence';

  const lShapePoints = [
    { x: 0, y: 0 },
    { x: 240, y: 0 },
    { x: 240, y: 120 },
    { x: 120, y: 120 },
    { x: 120, y: 240 },
    { x: 0, y: 240 },
  ];

  doc.rooms.push({
    id: 'l_room_1',
    type: 'living',
    name: 'L Living Great Room',
    points: lShapePoints,
    ceiling: 96,
    floor: 'oak',
    walls: { 0: 'drywall', 1: 'drywall', 2: 'drywall', 3: 'drywall', 4: 'drywall', 5: 'drywall' },
    items: [],
    openings: [
      { id: 'door1', type: 'door_single', wall: 0, offset: 36, width: 36, swing: 'in' },
      { id: 'win1', type: 'win_std', wall: 4, offset: 48, width: 48 },
    ],
    level: 0,
  });

  const pdf = generatePDF(doc, {
    pageSize: 'Letter',
    orientation: 'landscape',
    scale: '1/4"=1\'0"',
    includeTitleBlock: true,
    includeScaleBar: true,
    includeRoomSchedule: true,
  });

  assert.ok(pdf, 'generatePDF must return a pdf object for L-shaped floorplan');
  const buf = pdf.output('arraybuffer');
  assert.ok(
    buf.byteLength > 1000,
    'generated PDF arraybuffer for L-shape must contain valid vector data'
  );
  assert.equal(pdf.getNumberOfPages(), 2, 'L-shaped PDF must include floorplan and schedule page');
});

test('generatePDF exports valid vector PDF for custom 5-sided and angled polygon rooms', () => {
  let doc = M.newState();
  doc.name = 'Angled Polygon Residence';

  const angledPoints = [
    { x: 0, y: 0 },
    { x: 180, y: 0 },
    { x: 240, y: 120 },
    { x: 120, y: 200 },
    { x: 0, y: 120 },
  ];

  doc.rooms.push({
    id: 'poly_room_1',
    type: 'bedroom',
    name: 'Pentagonal Bedroom',
    points: angledPoints,
    ceiling: 96,
    floor: 'carpet',
    walls: { 0: 'drywall', 1: 'drywall', 2: 'drywall', 3: 'drywall', 4: 'drywall' },
    items: [],
    openings: [
      { id: 'win_angled', type: 'win_std', wall: 1, offset: 24, width: 36 },
      { id: 'door_angled', type: 'door_single', wall: 3, offset: 30, width: 36, swing: 'in' },
    ],
    level: 0,
  });

  const pdf = generatePDF(doc, {
    pageSize: 'ARCH_C',
    orientation: 'landscape',
    scale: 'fit',
    includeTitleBlock: true,
    includeScaleBar: true,
    includeRoomSchedule: true,
  });

  assert.ok(pdf);
  const buf = pdf.output('arraybuffer');
  assert.ok(buf.byteLength > 1000);
});
