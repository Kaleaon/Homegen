import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  escapeCSVField,
  formatCSVRow,
  fmtLen,
  roundCurrency,
  formatCurrency,
  generateBOMCSV,
} from '../js/bomExporter.js';
import {
  ITEMS,
  ITEM_BY_ID,
  OPENINGS,
  OPENING_BY_ID,
  WALL_FINISHES,
  WALL_BY_ID,
  FLOOR_FINISHES,
  FLOOR_BY_ID,
  openingMetrics,
} from '../js/catalog.js';
import { polygonPerimeter, interiorPolygon, floorAreaSqFt } from '../js/geometry.js';
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
  assert.equal(fmtLen(undefined), '');
  assert.equal(fmtLen(Number.NaN), '');
  assert.equal(fmtLen(14.5), '1\' 2 1/2"');
  assert.equal(fmtLen(0.375), '3/8"');
  assert.equal(fmtLen(11.99), "1'");
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
  assert.match(
    htmlContent,
    /<label class="toggle" for="csv-inc-pricing"><input type="checkbox" id="csv-inc-pricing" checked>/
  );
  assert.match(htmlContent, /id="csv-generate"/);
});

test('app.js registers export-csv command in COMMAND_REGISTRY and binds event listeners', () => {
  assert.match(
    appJsContent,
    /id:\s*'export-csv'/,
    'COMMAND_REGISTRY in app.js must define export-csv command'
  );
  assert.match(appJsContent, /generateBOMCSV/, 'app.js must import and call generateBOMCSV');
  assert.match(
    appJsContent,
    /includePricing:\s*\$\('#csv-inc-pricing'\)\?\.checked\s*!==\s*false/,
    'app.js #csv-generate handler must pass includePricing from #csv-inc-pricing'
  );
});

test('polygonPerimeter computes accurate Euclidean perimeter for 2D polygons', () => {
  assert.equal(polygonPerimeter(null), 0);
  assert.equal(polygonPerimeter([]), 0);
  assert.equal(polygonPerimeter([{ x: 10, y: 10 }]), 0);

  // Rectangle 100 x 50
  const rect = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];
  assert.equal(polygonPerimeter(rect), 300);

  // Array format coordinates [x, y]
  const rectArr = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ];
  assert.equal(polygonPerimeter(rectArr), 300);

  // L-shaped polygon (6 vertices)
  const lShape = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 60 },
    { x: 60, y: 60 },
    { x: 60, y: 120 },
    { x: 0, y: 120 },
  ];
  // 120 + 60 + 60 + 60 + 60 + 120 = 480
  assert.equal(polygonPerimeter(lShape), 480);
});

test('generateBOMCSV calculates wall finish area from actual polygon perimeter for non-rectangular rooms', () => {
  // U-shaped room where bounding box perimeter differs drastically from actual polygon perimeter
  const uShapedRoom = {
    id: 'room_u',
    name: 'U-Shaped Courtyard Room',
    type: 'living',
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 200, y: 300 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 300 },
      { x: 0, y: 300 },
    ],
    wallFinish: 'wallpaper_damask',
    ceilingHeight: 96,
  };

  const docState = {
    name: 'Non-Rectangular Room Test',
    levels: 1,
    rooms: [uShapedRoom],
  };

  const csv = generateBOMCSV(docState);

  // Calculate expected wall finish area using polygonPerimeter(interiorPolygon(r))
  const innerPoly = interiorPolygon(uShapedRoom);
  const actualPerimeter = polygonPerimeter(innerPoly);
  const expectedGrossSqIn = actualPerimeter * 96;
  const expectedNetSqFt = (expectedGrossSqIn / 144).toFixed(2);

  // Bounding box perimeter would be 2 * (295.5 + 295.5) = 1182 in -> 788.00 sq ft
  // True polygon perimeter is ~1582 in -> ~1054.67 sq ft
  assert.ok(csv.includes(`wallpaper_damask`), 'CSV must contain the wall finish item ID');
  assert.ok(
    csv.includes(expectedNetSqFt),
    `CSV wall finish coverage area must equal actual polygon perimeter area (${expectedNetSqFt} sq ft)`
  );
});

test('catalog definitions in catalog.js define positive default unitPrice values', () => {
  for (const item of ITEMS) {
    assert.equal(typeof item.unitPrice, 'number', `Item ${item.id} must have numeric unitPrice`);
    assert.ok(item.unitPrice > 0, `Item ${item.id} must have positive default unitPrice`);
  }
  for (const opening of OPENINGS) {
    assert.equal(
      typeof opening.unitPrice,
      'number',
      `Opening ${opening.id} must have numeric unitPrice`
    );
    assert.ok(opening.unitPrice > 0, `Opening ${opening.id} must have positive default unitPrice`);
  }
  for (const wall of WALL_FINISHES) {
    assert.equal(
      typeof wall.unitPrice,
      'number',
      `Wall finish ${wall.id} must have numeric unitPrice`
    );
    assert.ok(wall.unitPrice > 0, `Wall finish ${wall.id} must have positive default unitPrice`);
  }
  for (const floor of FLOOR_FINISHES) {
    assert.equal(
      typeof floor.unitPrice,
      'number',
      `Floor finish ${floor.id} must have numeric unitPrice`
    );
    assert.ok(floor.unitPrice > 0, `Floor finish ${floor.id} must have positive default unitPrice`);
  }
});

test('roundCurrency and formatCurrency normalize missing/invalid values and preserve RFC 4180 CRLF formatting', () => {
  assert.equal(roundCurrency(null), 0);
  assert.equal(roundCurrency(undefined), 0);
  assert.equal(roundCurrency(''), 0);
  assert.equal(roundCurrency(NaN), 0);
  assert.equal(roundCurrency(-25), 0);
  assert.equal(roundCurrency(19.995), 20);

  assert.equal(formatCurrency(null), '0.00');
  assert.equal(formatCurrency(undefined), '0.00');
  assert.equal(formatCurrency('invalid'), '0.00');
  assert.equal(formatCurrency(-5), '0.00');
  assert.equal(formatCurrency(0), '0.00');
  assert.equal(formatCurrency(420), '420.00');
  assert.equal(formatCurrency(3.25), '3.25');

  // RFC 4180 escaping & CRLF line endings on currency values (including formatted strings with commas)
  assert.equal(
    formatCSVRow(['Total Estimated Cost (USD)', '$1,250.00']),
    'Total Estimated Cost (USD),"$1,250.00"\r\n'
  );
  assert.equal(
    formatCSVRow(['Total Estimated Cost (USD)', formatCurrency(1250.5)]),
    'Total Estimated Cost (USD),1250.50\r\n'
  );
});

test('generateBOMCSV calculates accurate line-item prices, section subtotals, and BOM cost summary rollup', () => {
  const room = {
    id: 'r1',
    name: 'Primary Bedroom',
    type: 'bedroom',
    x: 0,
    y: 0,
    w: 144,
    h: 144,
    level: 0,
    ceilingHeight: 96,
    floor: 'floor_oak',
    wallFinish: 'paint_white',
    items: [{ type: 'bed_queen' }, { type: 'nightstand' }, { type: 'nightstand' }],
    openings: [{ type: 'door_interior_32' }, { type: 'win_hung_36x60' }],
  };

  const docState = {
    name: 'Pricing Verification Plan',
    levels: 1,
    rooms: [room],
  };

  const csv = generateBOMCSV(docState, { includePricing: true });

  // Every line must use CRLF line endings
  const lines = csv.split('\r\n');
  assert.ok(lines.length > 15, 'CSV must split cleanly on CRLF');
  assert.ok(!csv.replace(/\r\n/g, '').includes('\n'), 'CSV must not contain bare LF line endings');

  // Verify pricing headers
  assert.ok(
    csv.includes(
      'Item ID,Name,Category,Quantity,Width (in),Depth (in),Height (in),Rooms,Unit Price (USD),Total Cost (USD)\r\n'
    ),
    'Furniture schedule must include Unit Price and Total Cost headers'
  );
  assert.ok(
    csv.includes(
      'Opening ID,Name,Kind,Quantity,Width (in),Height (in),Sill Height (in),Glazed Area (sq ft),Operable Area (sq ft),Rooms,Unit Price (USD),Total Cost (USD)\r\n'
    ),
    'Openings schedule must include Unit Price and Total Cost headers'
  );
  assert.ok(
    csv.includes(
      'Finish Scope,Finish ID,Name,Pattern,Moisture Rated,Coverage Area (sq ft),Unit Price (USD/sq ft),Total Cost (USD)\r\n'
    ),
    'Finishes schedule must include Unit Price (USD/sq ft) and Total Cost headers'
  );

  // Expected Furniture math
  const bedPrice = ITEM_BY_ID.bed_queen.unitPrice;
  const nsPrice = ITEM_BY_ID.nightstand.unitPrice;
  const expectedFurnitureSubtotal = roundCurrency(bedPrice * 1 + nsPrice * 2);
  assert.ok(
    csv.includes(
      `bed_queen,Queen bed,bedroom,1,60,80,24,Primary Bedroom,${formatCurrency(bedPrice)},${formatCurrency(bedPrice)}\r\n`
    )
  );
  assert.ok(
    csv.includes(
      `nightstand,Nightstand,bedroom,2,18,16,24,Primary Bedroom,${formatCurrency(nsPrice)},${formatCurrency(nsPrice * 2)}\r\n`
    )
  );
  assert.ok(
    csv.includes(
      `Furniture & Fixtures Subtotal,,,,,,,,${formatCurrency(expectedFurnitureSubtotal)}\r\n`
    ) ||
      csv.includes(
        `Furniture & Fixtures Subtotal,,,,,,,,,${formatCurrency(expectedFurnitureSubtotal)}\r\n`
      )
  );

  // Expected Openings math
  const doorPrice = OPENING_BY_ID.door_interior_32.unitPrice;
  const winPrice = OPENING_BY_ID.win_hung_36x60.unitPrice;
  const expectedOpeningsSubtotal = roundCurrency(doorPrice + winPrice);
  assert.ok(
    csv.includes(
      `Doors & Windows Subtotal,,,,,,,,,,,${formatCurrency(expectedOpeningsSubtotal)}\r\n`
    )
  );

  // Expected Finishes math
  const floorSqFt = floorAreaSqFt(room);
  const floorCost = roundCurrency(floorSqFt * FLOOR_BY_ID.floor_oak.unitPrice);
  const perimIn = polygonPerimeter(interiorPolygon(room));
  const openingsSqIn =
    OPENING_BY_ID.door_interior_32.w * OPENING_BY_ID.door_interior_32.h +
    OPENING_BY_ID.win_hung_36x60.w * OPENING_BY_ID.win_hung_36x60.h;
  const wallSqFt = Math.max(0, perimIn * 96 - openingsSqIn) / 144;
  const wallCost = roundCurrency(wallSqFt * WALL_BY_ID.paint_white.unitPrice);
  const expectedFinishesSubtotal = roundCurrency(floorCost + wallCost);
  assert.ok(
    csv.includes(`Finishes Subtotal,,,,,,,${formatCurrency(expectedFinishesSubtotal)}\r\n`)
  );

  // Expected BOM Cost Summary Rollup
  const expectedGrandTotal = roundCurrency(
    expectedFurnitureSubtotal + expectedOpeningsSubtotal + expectedFinishesSubtotal
  );
  const expectedCostPerSqFt = roundCurrency(expectedGrandTotal / floorSqFt);

  assert.ok(csv.includes('=== BOM COST SUMMARY ===\r\n'));
  assert.ok(
    csv.includes(`Furniture & Fixtures,${formatCurrency(expectedFurnitureSubtotal)}\r\n`),
    'Summary must report Furniture & Fixtures subtotal'
  );
  assert.ok(
    csv.includes(`Doors & Windows,${formatCurrency(expectedOpeningsSubtotal)}\r\n`),
    'Summary must report Doors & Windows subtotal'
  );
  assert.ok(
    csv.includes(`Finishes (Floors & Walls),${formatCurrency(expectedFinishesSubtotal)}\r\n`),
    'Summary must report Finishes subtotal'
  );
  assert.ok(
    csv.includes(`Total Estimated Cost (USD),${formatCurrency(expectedGrandTotal)}\r\n`),
    'Summary must report accurate grand total'
  );
  assert.ok(
    csv.includes(`Estimated Cost per Sq Ft (USD),${formatCurrency(expectedCostPerSqFt)}\r\n`),
    'Summary must report accurate estimated cost per sq ft'
  );
});

test('generateBOMCSV omits pricing columns and cost summary when includePricing is false', () => {
  const state = buildMultiLevel();
  const csvNoPricing = generateBOMCSV(state, { includePricing: false });

  assert.ok(
    !csvNoPricing.includes('Unit Price'),
    'Must not include Unit Price headers when includePricing is false'
  );
  assert.ok(
    !csvNoPricing.includes('Total Cost'),
    'Must not include Total Cost headers when includePricing is false'
  );
  assert.ok(
    !csvNoPricing.includes('=== BOM COST SUMMARY ==='),
    'Must not include BOM Cost Summary section when includePricing is false'
  );
  assert.ok(
    !csvNoPricing.includes('Subtotal'),
    'Must not include section subtotal rows when includePricing is false'
  );

  // Existing legacy header rows remain completely unchanged
  assert.ok(
    csvNoPricing.includes(
      'Item ID,Name,Category,Quantity,Width (in),Depth (in),Height (in),Rooms\r\n'
    )
  );
  assert.ok(
    csvNoPricing.includes(
      'Opening ID,Name,Kind,Quantity,Width (in),Height (in),Sill Height (in),Glazed Area (sq ft),Operable Area (sq ft),Rooms\r\n'
    )
  );
  assert.ok(
    csvNoPricing.includes(
      'Finish Scope,Finish ID,Name,Pattern,Moisture Rated,Coverage Area (sq ft)\r\n'
    )
  );
});

test('generateBOMCSV handles custom or unknown items, openings, and finishes with missing unit prices as 0.00', () => {
  const docState = {
    name: 'Missing Unit Price Edge Case',
    levels: 1,
    rooms: [
      {
        id: 'r_custom',
        name: 'Custom Studio, "Suite A"',
        type: 'living',
        x: 0,
        y: 0,
        w: 120,
        h: 120,
        floor: 'custom_unpriced_floor',
        wallFinish: 'custom_unpriced_wall',
        items: [{ id: 'custom_unpriced_sculpture', name: 'Bespoke "Art", Piece' }],
        openings: [{ id: 'custom_unpriced_archway' }],
      },
    ],
  };

  const csv = generateBOMCSV(docState, { includePricing: true });

  // Custom item with quotes/commas in name & room name escapes properly and outputs 0.00
  assert.ok(
    csv.includes(
      'custom_unpriced_sculpture,"Bespoke ""Art"", Piece",other,1,,,,"Custom Studio, ""Suite A""",0.00,0.00\r\n'
    ),
    'Unpriced custom item must output 0.00 unit price and 0.00 total cost with RFC 4180 escaping'
  );
  assert.ok(
    csv.includes('0.00,0.00\r\n'),
    'Unpriced openings and finishes must output 0.00 unit price and 0.00 total cost'
  );
  assert.ok(
    csv.includes('Total Estimated Cost (USD),0.00\r\n'),
    'Grand total for all-unpriced items must equal 0.00'
  );
  assert.ok(
    csv.includes('Estimated Cost per Sq Ft (USD),0.00\r\n'),
    'Cost per sq ft for all-unpriced items must equal 0.00'
  );
});

test('generateBOMCSV cost summary only rolls up enabled schedule sections', () => {
  const state = buildMultiLevel();
  const csvFurnitureOnly = generateBOMCSV(state, {
    includeMetadata: false,
    includeFurniture: true,
    includeOpenings: false,
    includeFinishes: false,
    includeRooms: false,
    includePricing: true,
  });

  assert.ok(csvFurnitureOnly.includes('=== FURNITURE & FIXTURES ==='));
  assert.ok(csvFurnitureOnly.includes('=== BOM COST SUMMARY ==='));
  assert.ok(csvFurnitureOnly.includes('Furniture & Fixtures,'));
  assert.ok(!csvFurnitureOnly.includes('Doors & Windows,'));
  assert.ok(!csvFurnitureOnly.includes('Finishes (Floors & Walls),'));

  const furnitureMatch = csvFurnitureOnly.match(/Furniture & Fixtures,(\d+\.\d{2})\r\n/);
  const totalMatch = csvFurnitureOnly.match(/Total Estimated Cost \(USD\),(\d+\.\d{2})\r\n/);
  assert.ok(furnitureMatch && totalMatch, 'Must find furniture subtotal and grand total rows');
  assert.equal(
    totalMatch[1],
    furnitureMatch[1],
    'Grand total must equal Furniture subtotal when Openings and Finishes are excluded'
  );
});

test('generateBOMCSV exports net glazed area in sq ft for window and door schedules', () => {
  const docState = {
    name: 'Net Glazing BOM Test',
    levels: 1,
    rooms: [
      {
        id: 'r1',
        name: 'Living Room',
        type: 'living',
        x: 0,
        y: 0,
        w: 192,
        h: 168,
        openings: [
          { id: 'o1', type: 'win_hung_36x60', wall: 'N', offset: 24, width: 36 },
          { id: 'o2', type: 'door_patio_slider', wall: 'S', offset: 24, width: 72 },
        ],
      },
    ],
  };

  const csv = generateBOMCSV(docState, {
    includeMetadata: false,
    includeFurniture: false,
    includeOpenings: true,
    includeFinishes: false,
    includeRooms: false,
  });

  const expectedWinGlazeSqFt = (openingMetrics(OPENING_BY_ID.win_hung_36x60).glaze / 144).toFixed(
    2
  );
  const grossWinSqFt = ((36 * 60) / 144).toFixed(2);
  assert.notEqual(expectedWinGlazeSqFt, grossWinSqFt);
  assert.ok(
    csv.includes(`win_hung_36x60,Double-hung 36×60,Window,1,36,60,24,${expectedWinGlazeSqFt},`),
    `Expected BOM window row to contain net glazed area ${expectedWinGlazeSqFt} sq ft`
  );

  const expectedDoorGlazeSqFt = (
    openingMetrics(OPENING_BY_ID.door_patio_slider).glaze / 144
  ).toFixed(2);
  assert.ok(
    csv.includes(`door_patio_slider,"Patio slider 72""",Door,1,72,80,0,${expectedDoorGlazeSqFt},`),
    `Expected BOM door row to contain glazed area ${expectedDoorGlazeSqFt} sq ft`
  );
});
