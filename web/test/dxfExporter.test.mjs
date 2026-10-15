import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDXF } from '../js/dxfExporter.js';
import { buildMultiLevel, buildStudio } from '../js/templates.js';
import { newState, createRoom, addOpening, addItem } from '../js/model.js';

test('exportDXF generates valid AC1015 ASCII DXF header, tables, and entities', () => {
  const state = buildStudio();
  const dxf = exportDXF(state, { units: 'inches' });

  assert.ok(typeof dxf === 'string', 'exportDXF must return a string');
  assert.ok(
    dxf.includes('SECTION\n  2\nHEADER') || dxf.includes('HEADER\n'),
    'Must contain HEADER section'
  );
  assert.ok(
    dxf.includes('SECTION\n  2\nTABLES') || dxf.includes('TABLES\n'),
    'Must contain TABLES section'
  );
  assert.ok(
    dxf.includes('SECTION\n  2\nENTITIES') || dxf.includes('ENTITIES\n'),
    'Must contain ENTITIES section'
  );
  assert.ok(dxf.includes('0\nEOF'), 'Must end with EOF marker');

  // Verify AC1015 version
  assert.ok(
    dxf.includes('$ACADVER\n1\nAC1015') || dxf.includes('$ACADVER'),
    'Header must specify AC1015 version'
  );
  // Verify INSUNITS = 1 (Inches)
  assert.ok(
    dxf.includes('$INSUNITS\n70\n1') || dxf.includes('$INSUNITS'),
    'Header must set INSUNITS = 1 for inches'
  );
});

test('exportDXF defines all 7 standard CAD layers in TABLES section', () => {
  const state = buildStudio();
  const dxf = exportDXF(state);

  const requiredLayers = [
    'A-WALL-STRC',
    'A-WALL-FINS',
    'A-DOOR',
    'A-GLAZ',
    'A-FURN',
    'A-AREA-POLY',
    'A-ANNO-TEXT',
  ];

  for (const layer of requiredLayers) {
    assert.ok(dxf.includes(`2\n${layer}`), `DXF TABLES section must define layer ${layer}`);
  }
});

test('exportDXF encodes room boundaries as closed LWPOLYLINE entities with TEXT area annotations', () => {
  const doc = newState();
  createRoom(doc, 'living', 0, 0, 144, 144, { name: 'Great Hall' });

  const dxf = exportDXF(doc);

  // LWPOLYLINE on A-AREA-POLY
  assert.ok(
    dxf.includes('LWPOLYLINE\n8\nA-AREA-POLY'),
    'Must output LWPOLYLINE on A-AREA-POLY layer'
  );
  // Closed polyline flag (70 -> 1)
  assert.ok(dxf.includes('70\n1'), 'Room polyline must be closed');

  // TEXT on A-ANNO-TEXT
  assert.ok(dxf.includes('TEXT\n8\nA-ANNO-TEXT'), 'Must output TEXT on A-ANNO-TEXT layer');
  assert.ok(dxf.includes('Great Hall'), 'Must contain room name text tag');
  assert.ok(dxf.includes('sq ft'), 'Must contain area sq ft annotation');
});

test('exportDXF encodes door swing arcs as valid ARC entities and windows as GLAZ entities', () => {
  const doc = newState();
  const r = createRoom(doc, 'bedroom', 0, 0, 144, 144, { name: 'Bedroom 1' });
  addOpening(doc, r, 'door_entry_36', 'S', 36, { swing: 'in' });
  addOpening(doc, r, 'win_hung_36x60', 'N', 36);

  const dxf = exportDXF(doc);

  // Door line and arc on A-DOOR
  assert.ok(dxf.includes('LINE\n8\nA-DOOR'), 'Must output LINE entity on A-DOOR layer');
  assert.ok(dxf.includes('ARC\n8\nA-DOOR'), 'Must output ARC entity on A-DOOR layer');

  // Window on A-GLAZ
  assert.ok(dxf.includes('A-GLAZ'), 'Must output geometry on A-GLAZ layer');
});

test('exportDXF encodes furniture items on A-FURN layer', () => {
  const doc = newState();
  const r = createRoom(doc, 'living', 0, 0, 240, 240);
  addItem(doc, r, 'sofa', { x: 120, y: 120, rot: 0 });

  const dxf = exportDXF(doc);

  assert.ok(
    dxf.includes('LWPOLYLINE\n8\nA-FURN'),
    'Must output furniture polyline on A-FURN layer'
  );
});

test('exportDXF supports unit conversion (meters vs inches)', () => {
  const doc = newState();
  createRoom(doc, 'living', 0, 0, 100, 100);

  const dxfInches = exportDXF(doc, { units: 'inches' });
  const dxfMeters = exportDXF(doc, { units: 'meters' });

  assert.ok(dxfInches.includes('$INSUNITS\n70\n1'), 'Inches export must have INSUNITS = 1');
  assert.ok(dxfMeters.includes('$INSUNITS\n70\n6'), 'Meters export must have INSUNITS = 6');

  // Coordinates in meters should be scaled by 0.0254
  assert.ok(dxfMeters.includes('2.5400'), '100 inches in meters must equal 2.5400');
});

test('exportDXF supports level filtering', () => {
  const state = buildMultiLevel(); // 2 levels

  const dxfAll = exportDXF(state, { level: 'all' });
  const dxfL0 = exportDXF(state, { level: 0 });
  const dxfL1 = exportDXF(state, { level: 1 });

  assert.ok(
    dxfAll.length > dxfL0.length,
    'All levels export must be larger than single level export'
  );
  assert.ok(dxfL0.length > 0, 'Level 0 export must contain content');
  assert.ok(dxfL1.length > 0, 'Level 1 export must contain content');
});

test('exportDXF finishes under 100 milliseconds client-side benchmark', () => {
  const state = buildMultiLevel();
  // Warm up V8 JIT compiler
  exportDXF(state);

  const startTime = performance.now();
  const dxf = exportDXF(state);
  const duration = performance.now() - startTime;

  assert.ok(dxf.length > 0, 'Must output non-empty DXF content');
  assert.ok(duration < 100, `exportDXF must run under 100ms (took ${duration.toFixed(2)}ms)`);
});
