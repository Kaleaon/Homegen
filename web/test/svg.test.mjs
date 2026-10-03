import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSVG } from '../js/svg.js';
import * as M from '../js/model.js';

test('exportSVG produces valid XML with required structured groups', () => {
  const doc = M.newState();
  doc.name = 'Test Residence';
  M.createRoom(doc, 'living', 0, 0, 180, 140, { level: 0 });
  M.createRoom(doc, 'bedroom', 180, 0, 140, 140, { level: 0 });

  const svg = exportSVG(doc, { sheetSize: 'letter', scale: '1/4' });

  // Basic XML check
  assert.match(svg, /^<\?xml version="1\.0"/);
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);

  // Required Group IDs
  assert.ok(svg.includes('id="floors"'), 'contains floors group');
  assert.ok(svg.includes('id="walls"'), 'contains walls group');
  assert.ok(svg.includes('id="openings"'), 'contains openings group');
  assert.ok(svg.includes('id="furniture"'), 'contains furniture group');
  assert.ok(svg.includes('id="labels"'), 'contains labels group');
  assert.ok(svg.includes('id="title-block"'), 'contains title-block group');
  assert.ok(svg.includes('id="room-schedule"'), 'contains room-schedule group');
});

test('SVG schedule block displays room names, dimensions, and floor area metrics', () => {
  const doc = M.newState();
  doc.name = 'Schedule Test';
  const r1 = M.createRoom(doc, 'living', 0, 0, 240, 140, { level: 0 }); // 20' x 11.66'
  r1.name = 'Great Room';

  const svg = exportSVG(doc, { sheetSize: 'tabloid', scale: '1/4' });

  // Room Schedule table check
  assert.ok(svg.includes('Great Room'), 'includes room name Great Room');
  assert.ok(svg.includes('ROOM NAME'), 'includes schedule header ROOM NAME');
  assert.ok(svg.includes('TOTAL (1 ROOMS)'), 'includes total summary row');
  assert.match(svg, /\d+\s*sf/, 'includes square feet metric');
});

test('Graphic scale bar accurately displays feet and inches in viewbox units', () => {
  const doc = M.newState();
  const svg = exportSVG(doc, { sheetSize: 'letter', scale: '1/4' }); // 1/4" = 1'-0" => 1.5 pt per inch

  // At 1/4" = 1'-0" scale (1.5 pt/inch), 1 foot (12 inches) = 18 pt in SVG viewbox units.
  // The scale bar labels 0', 2', 4', 8'
  assert.ok(svg.includes('GRAPHIC SCALE'), 'contains graphic scale header');
  assert.ok(svg.includes("0'"), "contains 0' label");
  assert.ok(svg.includes("8'"), "contains 8' label");
});

test('SVG uses standard system fonts', () => {
  const doc = M.newState();
  const svg = exportSVG(doc);
  assert.ok(
    svg.includes('font-family: Arial, Helvetica, sans-serif;'),
    'uses standard system fonts'
  );
});
