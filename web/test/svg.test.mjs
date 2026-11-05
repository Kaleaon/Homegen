import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSVG } from '../js/svg.js';
import * as M from '../js/model.js';
import { ElevationGrid } from '../js/elevationEngine.js';

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

test('exportSVG includes standardized geospatial CRS metadata and root attributes when doc.crs is present', () => {
  const doc = M.newState();
  doc.crs = {
    epsg: 'EPSG:2227',
    proj4:
      '+proj=lcc +lat_0=36.5 +lon_0=-120.5 +lat_1=38.43333333333333 +lat_2=37.06666666666667 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
    wkt: 'PROJCS["NAD83 / California zone 3 (ftUS)"]',
    origin: { longitude: -122.4194, latitude: 37.7749 },
    units: 'us-ft',
  };

  const svg = exportSVG(doc);

  // Root attributes check
  assert.match(svg, /xmlns:geo="http:\/\/www\.w3\.org\/2003\/01\/geo\/wgs84_pos#"/);
  assert.match(svg, /data-epsg="EPSG:2227"/);
  assert.match(svg, /data-origin-longitude="-122\.4194"/);
  assert.match(svg, /data-origin-latitude="37\.7749"/);

  // Metadata block check
  assert.ok(
    svg.includes('<metadata id="geospatial-crs">'),
    'contains geospatial-crs metadata element'
  );
  assert.ok(svg.includes('epsg="EPSG:2227"'));
  assert.ok(svg.includes('+proj=lcc'));
  assert.ok(svg.includes('California zone 3'));
  assert.ok(svg.includes('units="us-ft"'));
  assert.ok(svg.includes('longitude="-122.4194"'));
  assert.ok(svg.includes('latitude="37.7749"'));
  assert.ok(svg.includes('</metadata>'));
});

test('exportSVG renders elevation contours with major/minor styling hierarchy and elevation labels', () => {
  const doc = M.newState();
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

  const svg = exportSVG(doc);

  // Group placement: elevation-contours must appear immediately before floors
  const contoursIndex = svg.indexOf('id="elevation-contours"');
  const floorsIndex = svg.indexOf('id="floors"');
  assert.ok(contoursIndex > 0, 'elevation-contours group should be present');
  assert.ok(
    floorsIndex > contoursIndex,
    'elevation-contours must be immediately prior to floors group'
  );

  // CSS classes and stroke styles
  assert.ok(
    svg.includes(
      '.contour-major { stroke: var(--ktheme-border, #44403c); stroke-width: 1.0; fill: none; }'
    )
  );
  assert.ok(
    svg.includes(
      '.contour-minor { stroke: var(--ktheme-text-muted, #78716c); stroke-width: 0.5; stroke-dasharray: 4,2; fill: none; }'
    )
  );
  assert.ok(svg.includes('.contour-label'));

  // Major and minor contours rendered
  assert.ok(svg.includes('class="contour-major"'), 'should render contour-major paths');
  assert.ok(svg.includes('class="contour-minor"'), 'should render contour-minor paths');
  assert.ok(
    svg.includes('stroke-dasharray="4,2"'),
    'minor contours should have dashed stroke style'
  );
  assert.ok(
    svg.includes('class="contour-label"'),
    'major contours should feature inline elevation labels'
  );
  assert.ok(svg.includes('5.0m'), 'elevation label text should be present on major index contour');
});

test('exportSVG uses doc._cachedContours avoiding redundant Marching Squares computations', () => {
  const doc = M.newState();
  doc.elevationGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 0, 0, 0],
    minElevation: 0,
    maxElevation: 0,
    visible: true,
  });

  // Provide pre-computed cached contours
  doc._cachedContours = [
    {
      elevation: 10,
      lines: [{ x1: 10, y1: 10, x2: 50, y2: 50 }],
    },
  ];

  const svg = exportSVG(doc);
  assert.ok(svg.includes('data-elevation="10"'), 'renders cached contour elevation');
  assert.ok(svg.includes('10.0m'), 'renders cached contour label');
});

test('Title block metadata displays active EPSG code and geographic origin coordinates', () => {
  const doc = M.newState();
  doc.crs = {
    epsg: 'EPSG:4326',
    origin: { longitude: -122.4194, latitude: 37.7749 },
  };

  const svg = exportSVG(doc);
  const titleBlockStart = svg.indexOf('id="title-block"');
  assert.ok(titleBlockStart > 0, 'title block group exists');
  const titleBlockSub = svg.slice(titleBlockStart);

  assert.ok(titleBlockSub.includes('EPSG:4326'), 'title block contains active EPSG code');
  assert.ok(
    titleBlockSub.includes('Origin: -122.4194, 37.7749'),
    'title block contains origin coordinates'
  );
});

test('Plan bounding box accommodates elevation grid bounds when auto-scaling with scale: fit', () => {
  const docWithoutGrid = M.newState();
  M.createRoom(docWithoutGrid, 'living', 0, 0, 100, 100);
  const svgWithout = exportSVG(docWithoutGrid, { scale: 'fit' });

  const docWithGrid = M.newState();
  M.createRoom(docWithGrid, 'living', 0, 0, 100, 100);
  docWithGrid.elevationGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 5, 0, 5],
    bounds: { minX: -500, maxX: 500, minY: -500, maxY: 500 },
    visible: true,
  });
  const svgWith = exportSVG(docWithGrid, { scale: 'fit' });

  // With a 1000x1000 terrain grid, the scale ratio will be much smaller (more feet per inch)
  const matchWithout = svgWithout.match(/1(?:&quot;|") ≈ ([\d.]+)(?:&apos;|')/);
  const matchWith = svgWith.match(/1(?:&quot;|") ≈ ([\d.]+)(?:&apos;|')/);
  assert.ok(matchWithout && matchWith, 'both exports generate scale ratio text');
  const ftPerInchWithout = parseFloat(matchWithout[1]);
  const ftPerInchWith = parseFloat(matchWith[1]);
  assert.ok(
    ftPerInchWith > ftPerInchWithout,
    `Terrain bounds should scale down view (more ft/inch): ${ftPerInchWith} > ${ftPerInchWithout}`
  );

  // If includeTerrainBounds: false is passed, it ignores terrain bounds
  const svgIgnored = exportSVG(docWithGrid, { scale: 'fit', includeTerrainBounds: false });
  const matchIgnored = svgIgnored.match(/1(?:&quot;|") ≈ ([\d.]+)(?:&apos;|')/);
  assert.equal(
    parseFloat(matchIgnored[1]),
    ftPerInchWithout,
    'includeTerrainBounds: false ignores elevation bounds'
  );
});

test('exportSVG executes cleanly without CRS or contours when doc.crs or elevationGrid are null/undefined or hidden', () => {
  const doc = M.newState();
  doc.crs = null;
  doc.elevationGrid = null;

  const svg = exportSVG(doc);
  assert.ok(!svg.includes('id="geospatial-crs"'), 'no geospatial metadata when doc.crs is null');
  assert.ok(!svg.includes('xmlns:geo'), 'no xmlns:geo root attribute when doc.crs is null');
  assert.ok(!svg.includes('data-epsg'), 'no data-epsg root attribute when doc.crs is null');
  assert.ok(
    !svg.includes('id="elevation-contours"'),
    'no elevation contours when elevationGrid is null'
  );

  // When elevationGrid is visible === false
  const docHidden = M.newState();
  docHidden.elevationGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 5, 0, 5],
    visible: false,
  });
  const svgHidden = exportSVG(docHidden);
  assert.ok(
    !svgHidden.includes('id="elevation-contours"'),
    'no elevation contours when elevationGrid.visible is false'
  );
});
