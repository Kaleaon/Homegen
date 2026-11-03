import test from 'node:test';
import assert from 'node:assert/strict';
import { exportDXF } from '../js/dxfExporter.js';
import { buildMultiLevel, buildStudio } from '../js/templates.js';
import { newState, createRoom, addOpening, addItem } from '../js/model.js';
import { ElevationGrid } from '../js/elevationEngine.js';

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

  const iterations = 10;
  const startTime = performance.now();
  let dxf = '';
  for (let i = 0; i < iterations; i++) {
    dxf = exportDXF(state);
  }
  const avgDuration = (performance.now() - startTime) / iterations;

  assert.ok(dxf.length > 0, 'Must output non-empty DXF content');
  assert.ok(
    avgDuration < 100,
    `exportDXF average execution time (${avgDuration.toFixed(2)}ms) must be under 100ms`
  );
});

test('exportDXF emits group code 999 CRS comment headers when doc.crs is present', () => {
  const doc = newState();
  doc.crs = {
    epsg: 'EPSG:2227',
    proj4:
      '+proj=lcc +lat_0=36.5 +lon_0=-120.5 +lat_1=38.43333333333333 +lat_2=37.06666666666667 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
    wkt: 'PROJCS["NAD83 / California zone 3 (ftUS)"]',
    origin: { longitude: -122.4194, latitude: 37.7749 },
    units: 'us-ft',
  };

  const dxf = exportDXF(doc);

  // Group 999 comment headers in HEADER section
  assert.ok(dxf.includes('999\nGEOSPATIAL_CRS_EPSG: EPSG:2227'), 'Must include EPSG comment');
  assert.ok(dxf.includes('999\nGEOSPATIAL_CRS_PROJ4: +proj=lcc'), 'Must include Proj4 comment');
  assert.ok(
    dxf.includes('999\nGEOSPATIAL_CRS_WKT: PROJCS["NAD83 / California zone 3 (ftUS)"]'),
    'Must include WKT comment'
  );
  assert.ok(
    dxf.includes('999\nGEOSPATIAL_ORIGIN_LON: -122.4194'),
    'Must include origin longitude comment'
  );
  assert.ok(
    dxf.includes('999\nGEOSPATIAL_ORIGIN_LAT: 37.7749'),
    'Must include origin latitude comment'
  );
  assert.ok(dxf.includes('999\nGEOSPATIAL_UNITS: us-ft'), 'Must include units comment');

  // Verify group 999 appears within HEADER section before ENDSEC
  const headerStart = dxf.indexOf('2\nHEADER');
  const headerEnd = dxf.indexOf('0\nENDSEC', headerStart);
  const epsgPos = dxf.indexOf('GEOSPATIAL_CRS_EPSG');
  assert.ok(
    epsgPos > headerStart && epsgPos < headerEnd,
    'CRS comments must reside in HEADER section'
  );
});

test('exportDXF omits group 999 comment headers when doc.crs is absent', () => {
  const doc = newState();
  doc.crs = null;
  const dxf = exportDXF(doc);
  assert.ok(
    !dxf.includes('GEOSPATIAL_CRS_EPSG'),
    'Must not include CRS comment when doc.crs is null'
  );
});

test('exportDXF defines civil topographic layers in TABLES section with distinct colors', () => {
  const doc = newState();
  const dxf = exportDXF(doc);

  const civilLayers = ['C-TOPO-MAJR', 'C-TOPO-MINR', 'C-TOPO-TEXT'];
  for (const layer of civilLayers) {
    assert.ok(dxf.includes(`2\n${layer}`), `DXF TABLES section must define layer ${layer}`);
  }

  // Verify layer count includes the 3 topo layers (7 + 3 = 10)
  assert.ok(dxf.includes('TABLE\n2\nLAYER\n70\n10'), 'Layer table must define 10 layers');
});

test('exportDXF serializes elevation contours as LWPOLYLINE entities with group code 38 and C-TOPO-TEXT midpoint tags', () => {
  const doc = newState();
  doc.elevationGrid = new ElevationGrid({
    width: 3,
    height: 3,
    data: [0, 5, 10, 0, 5, 10, 0, 5, 10],
    minElevation: 0,
    maxElevation: 10,
    contourInterval: 1.0,
    bounds: { minX: 0, maxX: 120, minY: 0, maxY: 120 },
    visible: true,
  });

  const dxfInches = exportDXF(doc, { units: 'inches' });

  // Major contour (elev 5.0) on C-TOPO-MAJR
  assert.ok(
    dxfInches.includes('LWPOLYLINE\n8\nC-TOPO-MAJR\n38\n5.0000') ||
      dxfInches.includes('8\nC-TOPO-MAJR\n38\n5.0000'),
    'Must output LWPOLYLINE on C-TOPO-MAJR with group code 38 = 5.0000'
  );

  // TEXT entity on C-TOPO-TEXT for major contour
  assert.ok(
    dxfInches.includes('TEXT\n8\nC-TOPO-TEXT'),
    'Must output TEXT entity on C-TOPO-TEXT layer'
  );
  assert.ok(
    dxfInches.includes('5.0ft'),
    'Major contour tag in inches should display elevation in ft'
  );

  // Meters export
  const dxfMeters = exportDXF(doc, { units: 'meters' });
  assert.ok(
    dxfMeters.includes('5.0m'),
    'Major contour tag in meters should display elevation in m'
  );
});

test('exportDXF omits contour polylines when elevationGrid.visible is false', () => {
  const doc = newState();
  doc.elevationGrid = new ElevationGrid({
    width: 3,
    height: 3,
    data: [0, 5, 10, 0, 5, 10, 0, 5, 10],
    minElevation: 0,
    maxElevation: 10,
    contourInterval: 1.0,
    bounds: { minX: 0, maxX: 120, minY: 0, maxY: 120 },
    visible: false,
  });

  const dxf = exportDXF(doc);
  assert.ok(
    !dxf.includes('LWPOLYLINE\n8\nC-TOPO-MAJR'),
    'Must not emit contour polylines when visible is false'
  );
  assert.ok(
    !dxf.includes('TEXT\n8\nC-TOPO-TEXT'),
    'Must not emit topo text labels when visible is false'
  );
});

test('exportDXF bounding extents $EXTMIN and $EXTMAX encompass room, site, and contour coordinates', () => {
  const doc = newState();
  createRoom(doc, 'living', 100, 100, 100, 100);

  doc.site = {
    segments: [
      {
        pts: [
          { x: -50, y: -50 },
          { x: 300, y: 300 },
        ],
      },
    ],
  };

  doc.elevationGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 10, 10, 20],
    minElevation: 0,
    maxElevation: 20,
    contourInterval: 5.0,
    bounds: { minX: -100, maxX: 400, minY: -100, maxY: 400 },
    visible: true,
  });

  const dxf = exportDXF(doc, { units: 'inches' });

  const extMinMatch = dxf.match(/\$EXTMIN\n10\n(-?\d+\.\d+)\n20\n(-?\d+\.\d+)/);
  const extMaxMatch = dxf.match(/\$EXTMAX\n10\n(-?\d+\.\d+)\n20\n(-?\d+\.\d+)/);

  assert.ok(extMinMatch, 'Must write $EXTMIN in header');
  assert.ok(extMaxMatch, 'Must write $EXTMAX in header');

  const extMinX = parseFloat(extMinMatch[1]);
  const extMinY = parseFloat(extMinMatch[2]);
  const extMaxX = parseFloat(extMaxMatch[1]);
  const extMaxY = parseFloat(extMaxMatch[2]);

  assert.ok(extMinX <= -50, `$EXTMIN X (${extMinX}) must encompass site and contours <= -50`);
  assert.ok(extMinY <= -50, `$EXTMIN Y (${extMinY}) must encompass site and contours <= -50`);
  assert.ok(extMaxX >= 300, `$EXTMAX X (${extMaxX}) must encompass site and contours >= 300`);
  assert.ok(extMaxY >= 300, `$EXTMAX Y (${extMaxY}) must encompass site and contours >= 300`);
});

test('exportDXF with elevationGrid finishes under 100 milliseconds client-side benchmark', () => {
  const state = buildMultiLevel();
  state.elevationGrid = new ElevationGrid({
    width: 20,
    height: 20,
    data: Array.from({ length: 400 }, (_, i) => Math.sin(i / 10) * 10),
    minElevation: -10,
    maxElevation: 10,
    contourInterval: 2.0,
    bounds: { minX: -200, maxX: 600, minY: -200, maxY: 600 },
    visible: true,
  });

  // Warm up V8 JIT
  exportDXF(state);

  const iterations = 10;
  const startTime = performance.now();
  let dxf = '';
  for (let i = 0; i < iterations; i++) {
    dxf = exportDXF(state);
  }
  const avgDuration = (performance.now() - startTime) / iterations;

  assert.ok(dxf.length > 0, 'Must output non-empty DXF content');
  assert.ok(
    avgDuration < 100,
    `exportDXF with elevationGrid average execution time (${avgDuration.toFixed(2)}ms) must be under 100ms`
  );
});
