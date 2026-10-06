import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeCSVField, formatCSVRow, fmtLen, generateBOMCSV } from '../js/bomExporter.js';
import { buildMultiLevel } from '../js/templates.js';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('RFC 4180 CSV escaping handles plain text, commas, double quotes, and line breaks', () => {
  assert.equal(escapeCSVField('Simple text'), 'Simple text');
  assert.equal(escapeCSVField('Text, with comma'), '"Text, with comma"');
  assert.equal(escapeCSVField('Text "with quotes"'), '"Text ""with quotes"""');
  assert.equal(escapeCSVField('Text with\nnewline'), '"Text with\nnewline"');
  assert.equal(
    escapeCSVField('Complex "text", with \r\n newline & comma'),
    '"Complex ""text"", with \r\n newline & comma"'
  );
  assert.equal(escapeCSVField(null), '');
  assert.equal(escapeCSVField(undefined), '');
  assert.equal(escapeCSVField(42), '42');
});

test('formatCSVRow formats fields with CRLF (\\r\\n) line endings', () => {
  const row = formatCSVRow(['Item A', '10', '5,000']);
  assert.equal(row, 'Item A,10,"5,000"\r\n');
});

test('fmtLen converts inches to feet and inches format', () => {
  assert.equal(fmtLen(144), "12'");
  assert.equal(fmtLen(150), '12\' 6"');
  assert.equal(fmtLen(6), '6"');
  assert.equal(fmtLen(0), '0"');
  assert.equal(fmtLen(null), '');
});

test('generateBOMCSV generates complete RFC 4180 CSV for multi-room home', () => {
  const state = buildMultiLevel();
  state.name = 'Luxury "Sample" Villa, Level 1 & 2';

  const startTime = performance.now();
  const csv = generateBOMCSV(state);
  const duration = performance.now() - startTime;

  // Metric: Export runs in under 100ms client-side
  assert.ok(
    duration < 100,
    `BOM export must complete in under 100ms (took ${duration.toFixed(2)}ms)`
  );

  // Line endings check (CRLF)
  assert.ok(csv.includes('\r\n'), 'CSV output must use CRLF line endings');

  // Quoting check
  assert.ok(
    csv.includes('"Luxury ""Sample"" Villa, Level 1 & 2"'),
    'Project name with quotes and commas must be escaped per RFC 4180'
  );

  // Section Headers
  assert.ok(csv.includes('=== PROJECT METADATA ==='), 'Must contain Project Metadata section');
  assert.ok(
    csv.includes('=== FURNITURE & FIXTURES ==='),
    'Must contain Furniture & Fixtures section'
  );
  assert.ok(csv.includes('=== DOORS & WINDOWS ==='), 'Must contain Doors & Windows section');
  assert.ok(csv.includes('=== FINISHES SCHEDULE ==='), 'Must contain Finishes section');
  assert.ok(csv.includes('=== ROOM AREA SUMMARY ==='), 'Must contain Room Area Summary section');

  // Furniture checks
  assert.ok(csv.includes('bed_queen'), 'Must list furniture items like bed_queen');
  assert.ok(csv.includes('sofa'), 'Must list furniture items like sofa');

  // Openings checks
  assert.ok(csv.includes('win_hung_36x60'), 'Must list window openings');
  assert.ok(csv.includes('door_interior_32'), 'Must list door openings');

  // Finishes checks
  assert.ok(csv.includes('Floor,'), 'Must contain Floor finishes');
  assert.ok(csv.includes('Wall,'), 'Must contain Wall finishes');

  // Room schedule checks
  assert.ok(csv.includes('Level 1'), 'Must display room level');
  assert.ok(csv.includes('Total Net Floor Area'), 'Must sum total net floor area');
});

test('generateBOMCSV respects section toggle options', () => {
  const state = buildMultiLevel();

  const csvNoFurniture = generateBOMCSV(state, { includeFurniture: false });
  assert.ok(
    !csvNoFurniture.includes('=== FURNITURE & FIXTURES ==='),
    'Should omit furniture section when includeFurniture = false'
  );
  assert.ok(csvNoFurniture.includes('=== PROJECT METADATA ==='), 'Should retain metadata section');

  const csvOnlyRooms = generateBOMCSV(state, {
    includeMetadata: false,
    includeFurniture: false,
    includeOpenings: false,
    includeFinishes: false,
    includeRooms: true,
  });
  assert.ok(!csvOnlyRooms.includes('=== PROJECT METADATA ==='));
  assert.ok(!csvOnlyRooms.includes('=== FURNITURE & FIXTURES ==='));
  assert.ok(!csvOnlyRooms.includes('=== DOORS & WINDOWS ==='));
  assert.ok(!csvOnlyRooms.includes('=== FINISHES SCHEDULE ==='));
  assert.ok(csvOnlyRooms.includes('=== ROOM AREA SUMMARY ==='));
});

test('generateBOMCSV maintains state immutability', () => {
  const state = buildMultiLevel();
  const snapshotBefore = JSON.stringify(state);

  generateBOMCSV(state);

  const snapshotAfter = JSON.stringify(state);
  assert.equal(
    snapshotAfter,
    snapshotBefore,
    'docState must remain unaltered after CSV generation'
  );
});

test('index.html contains #export-csv toolbar button and #csv-export modal with required accessibility attributes', () => {
  // Toolbar button
  assert.match(htmlContent, /<k-button id="export-csv"[^>]*>Export CSV<\/k-button>/);

  // Modal dialog
  assert.match(
    htmlContent,
    /<dialog id="csv-export" aria-labelledby="csv-export-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="csv-export-title">Export Bill of Materials \(CSV\)<\/h2>/);
  assert.match(
    htmlContent,
    /<button value="close" aria-label="Close CSV export modal"><span aria-hidden="true">✕<\/span><\/button>/
  );

  // Modal checkboxes
  assert.match(htmlContent, /id="csv-sec-meta"/);
  assert.match(htmlContent, /id="csv-sec-furniture"/);
  assert.match(htmlContent, /id="csv-sec-openings"/);
  assert.match(htmlContent, /id="csv-sec-finishes"/);
  assert.match(htmlContent, /id="csv-sec-rooms"/);
  assert.match(htmlContent, /id="csv-generate"/);
});

test('app.js registers export-csv command in COMMAND_REGISTRY and binds event listeners', () => {
  assert.match(
    appJsContent,
    /id:\s*'export-csv'/,
    'COMMAND_REGISTRY in app.js must define export-csv command'
  );
  assert.match(appJsContent, /generateBOMCSV/, 'app.js must import and call generateBOMCSV');
});
