import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseDistanceInInches,
  formatDistanceInInches,
  formatElevationBadge,
  parseElevationInInches,
  newState,
  createRoom,
} from '../js/model.js';
import { fmtLen as renderFmtLen } from '../js/render.js';
import { fmtLen as pdfFmtLen, generatePDF } from '../js/pdfEngine.js';
import { fmtLen as bomFmtLen, generateBOMCSV } from '../js/bomExporter.js';
import { exportSVG } from '../js/svg.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';
import { evaluate } from '../js/codes.js';

const appJsContent = readFileSync(resolve('js/app.js'), 'utf8');
const htmlContent = readFileSync(resolve('index.html'), 'utf8');

test('parseDistanceInInches parses architectural mixed fractions and sub-inch fractions', () => {
  // Mixed feet, inches, and fractions
  assert.equal(parseDistanceInInches('10\' 6 1/2"'), 126.5);
  assert.equal(parseDistanceInInches('10\'-6 1/2"'), 126.5);
  assert.equal(parseDistanceInInches('10\' 6-1/2"'), 126.5);
  assert.equal(parseDistanceInInches('10\'-6-1/2"'), 126.5);
  assert.equal(parseDistanceInInches('10ft 6 1/2in'), 126.5);
  assert.equal(parseDistanceInInches('10 feet 6 1/2 inches'), 126.5);
  assert.equal(parseDistanceInInches("10' 6 1/2"), 126.5);

  // Feet with pure fractional inches (no whole inches)
  assert.equal(parseDistanceInInches('10\' 1/16"'), 120.0625);
  assert.equal(parseDistanceInInches('10\' 3/8"'), 120.375);
  assert.equal(parseDistanceInInches('0\' 6 1/8"'), 6.125);

  // Sub-foot mixed and simple fractions
  assert.equal(parseDistanceInInches('6 1/4"'), 6.25);
  assert.equal(parseDistanceInInches('6-1/4"'), 6.25);
  assert.equal(parseDistanceInInches('6 1/4 in'), 6.25);
  assert.equal(parseDistanceInInches('6 1/4'), 6.25);
  assert.equal(parseDistanceInInches('6 1/8"'), 6.125);
  assert.equal(parseDistanceInInches('1/16"'), 0.0625);
  assert.equal(parseDistanceInInches('1/16 in'), 0.0625);
  assert.equal(parseDistanceInInches('1/16'), 0.0625);
  assert.equal(parseDistanceInInches('1/4'), 0.25);
  assert.equal(parseDistanceInInches('15/16"'), 0.9375);

  // Fractional feet
  assert.equal(parseDistanceInInches("10 1/2'"), 126);
  assert.equal(parseDistanceInInches('10 1/2 ft'), 126);

  // Curly / prime quotes
  assert.equal(parseDistanceInInches('10’ 6 1/2”'), 126.5);
  assert.equal(parseDistanceInInches('10′ 6 1/4″'), 126.25);
});

test('parseDistanceInInches rejects invalid strings and handles unit options', () => {
  assert.equal(parseDistanceInInches(''), null);
  assert.equal(parseDistanceInInches('   '), null);
  assert.equal(parseDistanceInInches(null), null);
  assert.equal(parseDistanceInInches(undefined), null);
  assert.equal(parseDistanceInInches('abc'), null);
  assert.equal(parseDistanceInInches('random'), null);
  assert.equal(parseDistanceInInches('-10'), null);
  assert.equal(parseDistanceInInches('-6 1/4"'), null);
  assert.equal(parseDistanceInInches('1/0"'), null);
  assert.equal(parseDistanceInInches('6 1/0"'), null);
  assert.equal(parseDistanceInInches('10\' abc"'), null);
  assert.equal(parseDistanceInInches('12abc'), null);

  // Unit & coordinate options used by room dimension dialogs
  assert.equal(parseDistanceInInches('36', { defaultUnit: 'in' }), 36);
  assert.equal(parseDistanceInInches('12', { defaultUnit: 'ft' }), 144);
  assert.equal(parseDistanceInInches('0', { defaultUnit: 'in', allowZero: true }), 0);
  assert.equal(
    parseDistanceInInches('-2\' 6 1/2"', {
      defaultUnit: 'in',
      allowZero: true,
      allowNegative: true,
    }),
    -30.5
  );
  assert.equal(parseElevationInInches('-8\' 6 1/2"'), -102.5);
});

test('dimension formatters render simplified 1/16th fractions and omit integer artifacts', () => {
  for (const fn of [renderFmtLen, pdfFmtLen, bomFmtLen, formatDistanceInInches]) {
    // Exact integers omit fractional suffixes
    assert.equal(fn(0), '0"');
    assert.equal(fn(6), '6"');
    assert.equal(fn(144), "12'");
    assert.equal(fn(150), '12\' 6"');

    // Simplified fractions across 1/16, 1/8, 1/4, 1/2
    assert.equal(fn(0.0625), '1/16"');
    assert.equal(fn(0.125), '1/8"');
    assert.equal(fn(0.25), '1/4"');
    assert.equal(fn(0.5), '1/2"');
    assert.equal(fn(6.125), '6 1/8"');
    assert.equal(fn(6.25), '6 1/4"');
    assert.equal(fn(6.9375), '6 15/16"');
    assert.equal(fn(126.5), '10\' 6 1/2"');
    assert.equal(fn(120.0625), '10\' 1/16"');

    // Nearest 1/16th rounding and carry-over across 16/16" -> +1" and 12" -> +1'
    assert.equal(fn(6 + 1 / 32), '6 1/16"');
    assert.equal(fn(6 + 0.01), '6"');
    assert.equal(fn(5.99), '6"');
    assert.equal(fn(11.99), "1'");
    assert.equal(fn(143.99), "12'");
    assert.equal(fn(125.99), '10\' 6"');
  }

  // Elevation badge formatting with fractions
  assert.equal(formatElevationBadge(102.5), '+8\' 6 1/2"');
  assert.equal(formatElevationBadge(-102.125), '-8\' 6 1/8"');
  assert.equal(formatElevationBadge(107.99), '+9\' 0"');
});

test('round-trip consistency between formatDistanceInInches and parseDistanceInInches', () => {
  for (let sixteenths = 1; sixteenths <= 400; sixteenths++) {
    const inches = sixteenths / 16;
    const formatted = renderFmtLen(inches);
    const parsed = parseDistanceInInches(formatted);
    assert.equal(parsed, inches, `Round-trip failed for ${inches}" -> "${formatted}" -> ${parsed}`);
  }
});

test('BOM, SVG, PDF, and ComplianceOverlay render fractional room dimensions accurately', () => {
  const state = newState();
  // WT is 4.5", so outer 155" x 126.625" -> interior 150.5" (12' 6 1/2") x 122.125" (10' 2 1/8")
  const room = createRoom(state, 'living', 0, 0, 155, 126.625, { level: 0 });
  room.name = 'Precision Studio';

  const csv = generateBOMCSV(state);
  assert.ok(csv.includes('12\' 6 1/2"'), 'BOM CSV must include 12\' 6 1/2" interior width');
  assert.ok(csv.includes('10\' 2 1/8"'), 'BOM CSV must include 10\' 2 1/8" interior depth');

  const svg = exportSVG(state, { sheetSize: 'tabloid', scale: '1/4' });
  assert.ok(
    svg.includes('12&apos; 6 1/2&quot;') || svg.includes('12\' 6 1/2"'),
    'SVG export must include fractional room width'
  );

  const pdf = generatePDF(state, { pageSize: 'Letter', includeRoomSchedule: true });
  assert.ok(pdf.output('arraybuffer').byteLength > 1000);

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });
  const dimLabels = scene.getNodesByType('dimensionLabel');
  assert.equal(dimLabels.length, 1);
  assert.equal(dimLabels[0].data.dimensionText, '12\' 11" × 10\' 6 5/8"');
});

test('app.js and index.html wire Add Room Dims and Inspector inputs through parseDistanceInInches', () => {
  assert.match(
    htmlContent,
    /<input id="room-dims-width" type="text"/,
    '#room-dims-width must use type="text" to allow fractional imperial input'
  );
  assert.match(
    htmlContent,
    /<input id="room-dims-depth" type="text"/,
    '#room-dims-depth must use type="text" to allow fractional imperial input'
  );
  assert.match(
    appJsContent,
    /const w = M\.parseDistanceInInches\(rawW/,
    'setupAddRoomDimsModal must parse width with M.parseDistanceInInches'
  );
  assert.match(
    appJsContent,
    /const h = M\.parseDistanceInInches\(rawH/,
    'setupAddRoomDimsModal must parse depth with M.parseDistanceInInches'
  );
  assert.match(
    appJsContent,
    /const x = M\.parseDistanceInInches\(rawX/,
    'setupAddRoomDimsModal must parse X position with M.parseDistanceInInches'
  );
  assert.match(
    appJsContent,
    /const y = M\.parseDistanceInInches\(rawY/,
    'setupAddRoomDimsModal must parse Y position with M.parseDistanceInInches'
  );
});
