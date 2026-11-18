import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ElevationGrid,
  normalizeElevationUnit,
  parseGoogleElevationJson,
  parseImageHeightmap,
  parseGeoTIFFWithFallback,
  parseElevationRaster,
  computeMarchingSquares,
  computeContoursAsync,
  serializeElevationGrid,
  deserializeElevationGrid,
} from '../js/elevationEngine.js';
import { newState, serialize, deserialize } from '../js/model.js';
import { drawContours } from '../js/render.js';
import { createScene3D } from '../js/scene3d.js';

test('ElevationGrid initializes with default values and performs bilinear height interpolation', () => {
  const grid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 10, 20, 30],
    minElevation: 0,
    maxElevation: 30,
    contourInterval: 2.0,
  });

  assert.equal(grid.width, 2);
  assert.equal(grid.height, 2);
  assert.equal(grid.getElevationAt(0, 0), 0);
  assert.equal(grid.getElevationAt(1, 0), 10);
  assert.equal(grid.getElevationAt(0, 1), 20);
  assert.equal(grid.getElevationAt(1, 1), 30);
  assert.equal(grid.getElevationAt(0.5, 0.5), 15);
});

test('parseGoogleElevationJson converts Google Elevation API responses into ElevationGrid', () => {
  const sampleJson = {
    status: 'OK',
    results: [
      { elevation: 10.0, location: { lat: 37.7, lng: -122.4 } },
      { elevation: 15.0, location: { lat: 37.7, lng: -122.3 } },
      { elevation: 20.0, location: { lat: 37.6, lng: -122.4 } },
      { elevation: 25.0, location: { lat: 37.6, lng: -122.3 } },
    ],
  };

  const grid = parseGoogleElevationJson(JSON.stringify(sampleJson));

  assert.equal(grid.width, 2);
  assert.equal(grid.height, 2);
  assert.equal(grid.minElevation, 10.0);
  assert.equal(grid.maxElevation, 25.0);
  assert.equal(grid.data[0], 10.0);
  assert.equal(grid.data[3], 25.0);
});

test('parseGoogleElevationJson throws descriptive error on bad status or empty results', () => {
  assert.throws(
    () => parseGoogleElevationJson({ status: 'INVALID_REQUEST', results: [] }),
    /Google Maps Elevation API error status: INVALID_REQUEST/
  );

  assert.throws(
    () => parseGoogleElevationJson({ status: 'OK', results: [] }),
    /No elevation results found in payload/
  );
});

test('parseImageHeightmap extracts height values from ImageData', () => {
  // 2x2 pixels RGBA buffer
  // Black (0), Mid Gray (128), Full White (255), Full White (255)
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  ]);
  const imageData = { width: 2, height: 2, data: pixels };

  const grid = parseImageHeightmap(imageData, { minElevation: 0, maxElevation: 100 });

  assert.equal(grid.width, 2);
  assert.equal(grid.height, 2);
  assert.equal(Math.round(grid.data[0]), 0);
  assert.equal(Math.round(grid.data[1]), 50);
  assert.equal(Math.round(grid.data[2]), 100);
});

test('parseElevationRaster auto-routes JSON string and object inputs', async () => {
  const jsonInput = JSON.stringify({
    status: 'OK',
    results: [{ elevation: 5 }, { elevation: 10 }, { elevation: 15 }, { elevation: 20 }],
  });

  const grid = await parseElevationRaster(jsonInput);
  assert.ok(grid instanceof ElevationGrid);
  assert.equal(grid.minElevation, 5);
  assert.equal(grid.maxElevation, 20);
});

test('computeMarchingSquares computes topographic isolines with linear edge interpolation', () => {
  const grid = new ElevationGrid({
    width: 3,
    height: 3,
    data: [0, 5, 10, 0, 5, 10, 0, 5, 10],
    minElevation: 0,
    maxElevation: 10,
    contourInterval: 5.0,
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
  });

  const contours = computeMarchingSquares(grid);

  assert.ok(Array.isArray(contours));
  assert.ok(contours.length > 0);

  const level5 = contours.find((c) => c.elevation === 5);
  assert.ok(level5, 'Contour for elevation 5 should exist');
  assert.ok(level5.lines.length > 0);

  // Line segment x coordinates should be interpolated at x=50
  for (const line of level5.lines) {
    assert.equal(line.x1, 50);
    assert.equal(line.x2, 50);
  }
});

test('computeContoursAsync resolves asynchronously with contour levels', async () => {
  const grid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 10, 10, 20],
    minElevation: 0,
    maxElevation: 20,
    contourInterval: 5.0,
  });

  const contours = await computeContoursAsync(grid);
  assert.ok(Array.isArray(contours));
  assert.ok(contours.length > 0);
});

test('Plan state serializes and deserializes elevationGrid metadata maintaining persistence', () => {
  const state = newState();
  state.elevationGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [1, 2, 3, 4],
    minElevation: 1,
    maxElevation: 4,
    contourInterval: 1.0,
  });

  const serialized = serialize(state);
  assert.ok(serialized.includes('"elevationGrid"'));

  const loaded = deserialize(serialized);
  assert.ok(loaded.elevationGrid instanceof ElevationGrid);
  assert.equal(loaded.elevationGrid.width, 2);
  assert.equal(loaded.elevationGrid.height, 2);
  assert.equal(loaded.elevationGrid.data[0], 1);
  assert.equal(loaded.elevationGrid.data[3], 4);
});

test('drawContours renders isolines and altitude labels to 2D canvas context', () => {
  const grid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 10, 10, 20],
    minElevation: 0,
    maxElevation: 20,
    contourInterval: 5.0,
  });
  const state = { elevationGrid: grid };
  const contours = computeMarchingSquares(grid);

  const calls = [];
  const mockCtx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x, y) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x, y) => calls.push(`lineTo(${x},${y})`),
    stroke: () => calls.push('stroke'),
    strokeText: (t, x, y) => calls.push(`strokeText(${t},${x},${y})`),
    fillText: (t, x, y) => calls.push(`fillText(${t},${x},${y})`),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  };

  drawContours(mockCtx, state, { scale: 1 }, { contours });

  assert.ok(calls.includes('beginPath'));
  assert.ok(calls.includes('stroke'));
  assert.ok(calls.some((c) => c.startsWith('fillText')));
});

test('serializeElevationGrid and deserializeElevationGrid roundtrip Grid instances', () => {
  const grid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [5, 10, 15, 20],
    minElevation: 5,
    maxElevation: 20,
  });

  const serialized = serializeElevationGrid(grid);
  assert.equal(serialized.width, 2);
  assert.deepEqual(serialized.data, [5, 10, 15, 20]);

  const deserialized = deserializeElevationGrid(serialized);
  assert.ok(deserialized instanceof ElevationGrid);
  assert.equal(deserialized.getElevationAt(0, 0), 5);
  assert.equal(deserialized.getElevationAt(1, 1), 20);
});

test('parseGeoTIFFWithFallback handles corrupt buffer by falling back or throwing descriptive error', async () => {
  const dummyBuffer = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer;
  await assert.rejects(
    () => parseGeoTIFFWithFallback(dummyBuffer),
    /Failed to decode GeoTIFF binary data or fallback image heightmap/
  );
});

function createSyntheticGeoTIFF({
  littleEndian = true,
  width = 2,
  height = 2,
  bitsPerSample = 8,
  pixelScale = null,
  tiepoint = null,
  transformation = null,
  pixelData = null,
} = {}) {
  const entries = [
    { tag: 256, type: 4, count: 1, val: width },
    { tag: 257, type: 4, count: 1, val: height },
    { tag: 258, type: 3, count: 1, val: bitsPerSample },
  ];

  let currentOffset =
    8 +
    2 +
    (entries.length + (pixelScale ? 1 : 0) + (tiepoint ? 1 : 0) + (transformation ? 1 : 0) + 1) *
      12 +
    4;
  currentOffset = Math.ceil(currentOffset / 8) * 8;

  let pixelScaleOffset = 0;
  if (pixelScale) {
    entries.push({ tag: 33550, type: 12, count: pixelScale.length, val: currentOffset });
    pixelScaleOffset = currentOffset;
    currentOffset += pixelScale.length * 8;
  }

  let tiepointOffset = 0;
  if (tiepoint) {
    entries.push({ tag: 33922, type: 12, count: tiepoint.length, val: currentOffset });
    tiepointOffset = currentOffset;
    currentOffset += tiepoint.length * 8;
  }

  let transformationOffset = 0;
  if (transformation) {
    entries.push({ tag: 34264, type: 12, count: transformation.length, val: currentOffset });
    transformationOffset = currentOffset;
    currentOffset += transformation.length * 8;
  }

  const stripOffset = currentOffset;
  entries.push({ tag: 273, type: 4, count: 1, val: stripOffset });

  const bytesPerSample = bitsPerSample === 16 ? 2 : 1;
  const stripLength = width * height * bytesPerSample;
  const totalSize = stripOffset + stripLength;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);

  entries.sort((a, b) => a.tag - b.tag);

  view.setUint16(8, entries.length, littleEndian);
  entries.forEach((e, idx) => {
    const entryOffset = 8 + 2 + idx * 12;
    view.setUint16(entryOffset, e.tag, littleEndian);
    view.setUint16(entryOffset + 2, e.type, littleEndian);
    view.setUint32(entryOffset + 4, e.count, littleEndian);
    view.setUint32(entryOffset + 8, e.val, littleEndian);
  });
  view.setUint32(8 + 2 + entries.length * 12, 0, littleEndian);

  if (pixelScale) {
    pixelScale.forEach((v, idx) => {
      view.setFloat64(pixelScaleOffset + idx * 8, v, littleEndian);
    });
  }
  if (tiepoint) {
    tiepoint.forEach((v, idx) => {
      view.setFloat64(tiepointOffset + idx * 8, v, littleEndian);
    });
  }
  if (transformation) {
    transformation.forEach((v, idx) => {
      view.setFloat64(transformationOffset + idx * 8, v, littleEndian);
    });
  }

  const pixels = pixelData || new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    if (bytesPerSample === 2) {
      view.setUint16(stripOffset + i * 2, pixels[i], littleEndian);
    } else {
      view.setUint8(stripOffset + i, pixels[i]);
    }
  }

  return buffer;
}

test('parseGeoTIFFWithFallback extracts ModelPixelScaleTag and ModelTiepointTag to compute bounds', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 4,
    height: 4,
    pixelScale: [2.5, 5.0, 0.0],
    tiepoint: [0.0, 0.0, 0.0, 1000.0, 2000.0, 0.0],
    pixelData: new Uint8Array([
      0, 50, 100, 150, 50, 100, 150, 200, 100, 150, 200, 250, 150, 200, 250, 255,
    ]),
  });

  const grid = await parseGeoTIFFWithFallback(buffer, { minElevation: 0, maxElevation: 100 });
  assert.ok(grid instanceof ElevationGrid);
  assert.equal(grid.width, 4);
  assert.equal(grid.height, 4);
  assert.deepEqual(grid.bounds, {
    minX: 1000.0,
    maxX: 1010.0, // 1000 + 4 * 2.5
    minY: 1980.0, // 2000 - 4 * 5.0
    maxY: 2000.0,
  });
});

test('parseGeoTIFFWithFallback calculates bounds correctly with non-zero tiepoint indices and Big-Endian encoding', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: false, // "MM"
    width: 10,
    height: 5,
    pixelScale: [10.0, 20.0, 0.0],
    tiepoint: [2.0, 1.0, 0.0, 520.0, 1080.0, 0.0],
  });

  const grid = await parseGeoTIFFWithFallback(buffer);
  // xOrigin = 520 - 2 * 10 = 500
  // yOrigin = 1080 + 1 * 20 = 1100
  // minX = 500, maxX = 500 + 10 * 10 = 600
  // minY = 1100 - 5 * 20 = 1000, maxY = 1100
  assert.deepEqual(grid.bounds, {
    minX: 500.0,
    maxX: 600.0,
    minY: 1000.0,
    maxY: 1100.0,
  });
});

test('parseGeoTIFFWithFallback extracts ModelTransformationTag matrix when tiepoints are absent', async () => {
  const transformation = [
    2.0, 0.0, 0.0, 500.0, 0.0, -3.0, 0.0, 1500.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
  ];

  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 10,
    height: 10,
    transformation,
  });

  const grid = await parseGeoTIFFWithFallback(buffer);
  assert.deepEqual(grid.bounds, {
    minX: 500.0,
    maxX: 520.0,
    minY: 1470.0,
    maxY: 1500.0,
  });
});

test('options.bounds takes precedence over parsed GeoTIFF metadata when explicitly supplied', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 4,
    height: 4,
    pixelScale: [2.5, 5.0, 0.0],
    tiepoint: [0.0, 0.0, 0.0, 1000.0, 2000.0, 0.0],
  });

  const customBounds = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
  const grid = await parseGeoTIFFWithFallback(buffer, { bounds: customBounds });
  assert.deepEqual(grid.bounds, customBounds);
});

test('parseGeoTIFFWithFallback falls back to default bounds when georeferencing tags are absent', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
  });

  const grid = await parseGeoTIFFWithFallback(buffer);
  assert.deepEqual(grid.bounds, { minX: -600, maxX: 600, minY: -600, maxY: 600 });
});

test('parseGeoTIFFWithFallback performs IFD parsing in under 5 milliseconds', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 100,
    height: 100,
    pixelScale: [1.0, 1.0, 0.0],
    tiepoint: [0.0, 0.0, 0.0, 0.0, 100.0, 0.0],
  });

  const start = performance.now();
  await parseGeoTIFFWithFallback(buffer);
  const duration = performance.now() - start;

  assert.ok(duration < 5.0, `Parsing took ${duration.toFixed(3)}ms, expected < 5ms`);
});

test('ElevationGrid initializes elevationUnit to m by default, accepts ft, and falls back on unrecognized strings', () => {
  const defaultGrid = new ElevationGrid({ width: 2, height: 2, data: [0, 1, 2, 3] });
  assert.equal(defaultGrid.elevationUnit, 'm');

  const feetGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 10, 20, 30],
    elevationUnit: 'ft',
  });
  assert.equal(feetGrid.elevationUnit, 'ft');

  const unitAliasGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 10, 20, 30],
    unit: 'ft',
  });
  assert.equal(unitAliasGrid.elevationUnit, 'ft');

  const unknownUnitGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 1, 2, 3],
    elevationUnit: 'furlongs',
  });
  assert.equal(unknownUnitGrid.elevationUnit, 'm');
  assert.equal(normalizeElevationUnit(null), 'm');
  assert.equal(normalizeElevationUnit(''), 'm');
  assert.equal(normalizeElevationUnit('FT'), 'ft');
});

test('ElevationGrid serialization and deserialization roundtrip elevationUnit and preserve legacy defaults', () => {
  const ftGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [10, 20, 30, 40],
    minElevation: 10,
    maxElevation: 40,
    elevationUnit: 'ft',
  });

  const jsonObj = ftGrid.toJSON();
  assert.equal(jsonObj.elevationUnit, 'ft');

  const serialized = serializeElevationGrid(ftGrid);
  assert.equal(serialized.elevationUnit, 'ft');

  const restored = deserializeElevationGrid(serialized);
  assert.equal(restored.elevationUnit, 'ft');

  // Full plan state roundtrip
  const state = newState();
  state.elevationGrid = ftGrid;
  const loadedState = deserialize(serialize(state));
  assert.equal(loadedState.elevationGrid.elevationUnit, 'ft');

  // Legacy payload without elevationUnit defaults safely to 'm'
  const legacyPayload = {
    width: 2,
    height: 2,
    data: [1, 2, 3, 4],
    minElevation: 1,
    maxElevation: 4,
    contourInterval: 1.0,
    verticalScale: 1.0,
  };
  const legacyGrid = deserializeElevationGrid(legacyPayload);
  assert.equal(legacyGrid.elevationUnit, 'm');

  // Corrupted/unknown unit in serialized payload defaults safely to 'm'
  const unknownPayload = { ...legacyPayload, elevationUnit: 'cubits' };
  assert.equal(deserializeElevationGrid(unknownPayload).elevationUnit, 'm');
});

test('Raster parsers pass through options.elevationUnit and options.unit while defaulting Google API to m', async () => {
  const googlePayload = {
    status: 'OK',
    results: [{ elevation: 10 }, { elevation: 20 }, { elevation: 30 }, { elevation: 40 }],
  };

  // Default Google API import -> 'm'
  const googleDefault = parseGoogleElevationJson(googlePayload);
  assert.equal(googleDefault.elevationUnit, 'm');

  // Explicit override on Google API import
  const googleFeet = parseGoogleElevationJson(googlePayload, { elevationUnit: 'ft' });
  assert.equal(googleFeet.elevationUnit, 'ft');

  const googleUnitAlias = await parseElevationRaster(JSON.stringify(googlePayload), { unit: 'ft' });
  assert.equal(googleUnitAlias.elevationUnit, 'ft');

  // Image heightmap parser
  const pixels = new Uint8ClampedArray(16).fill(128);
  const imageData = { width: 2, height: 2, data: pixels };
  assert.equal(parseImageHeightmap(imageData).elevationUnit, 'm');
  assert.equal(parseImageHeightmap(imageData, { elevationUnit: 'ft' }).elevationUnit, 'ft');
  assert.equal((await parseElevationRaster(imageData, { unit: 'ft' })).elevationUnit, 'ft');

  // GeoTIFF parser
  const tiffBuf = createSyntheticGeoTIFF({ width: 2, height: 2 });
  assert.equal((await parseGeoTIFFWithFallback(tiffBuf)).elevationUnit, 'm');
  assert.equal(
    (await parseGeoTIFFWithFallback(tiffBuf, { elevationUnit: 'ft' })).elevationUnit,
    'ft'
  );
  assert.equal((await parseElevationRaster(tiffBuf, { unit: 'ft' })).elevationUnit, 'ft');
  assert.equal(
    (await parseElevationRaster(tiffBuf, { elevationUnit: 'invalid_unit' })).elevationUnit,
    'm'
  );
});

test('drawContours formats 2D contour altitude labels according to grid.elevationUnit', () => {
  const collectLabels = (elevationUnit) => {
    const grid = new ElevationGrid({
      width: 2,
      height: 2,
      data: [0, 10, 10, 20],
      minElevation: 0,
      maxElevation: 20,
      contourInterval: 10.0,
      elevationUnit,
    });
    if (elevationUnit === 'corrupt_after_init') {
      grid.elevationUnit = 'corrupt_after_init';
    }
    const contours = computeMarchingSquares(grid);
    const labels = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      strokeText: () => {},
      fillText: (t) => labels.push(t),
    };
    drawContours(mockCtx, { elevationGrid: grid }, { scale: 1 }, { contours });
    return labels;
  };

  assert.ok(collectLabels('m').includes('10.0m'));
  assert.ok(collectLabels('ft').includes('10.0ft'));
  assert.ok(collectLabels('corrupt_after_init').includes('10.0m'));
});

test('3D terrain mesh scales heights by 3.28084 for meters, 1.0 for feet, and updates dynamically on unit switch', () => {
  const prevRAF = globalThis.requestAnimationFrame;
  const prevCAF = globalThis.cancelAnimationFrame;
  const prevWin = globalThis.window;
  const prevDoc = globalThis.document;
  const prevRO = globalThis.ResizeObserver;

  globalThis.cancelAnimationFrame = () => {};
  globalThis.requestAnimationFrame = () => 1;

  const baseCtx = {
    canvas: { width: 400, height: 300 },
    getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
    getExtension: () => null,
    getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
    checkFramebufferStatus: () => 36053,
    createFramebuffer: () => ({ id: 1 }),
    createRenderbuffer: () => ({ id: 2 }),
    createTexture: () => ({ id: 3 }),
    createBuffer: () => ({ id: 4 }),
    createProgram: () => ({ id: 5 }),
    createShader: () => ({ id: 6 }),
    createVertexArray: () => ({ id: 7 }),
    TRIANGLES: 4,
  };
  const mockCtx = new Proxy(baseCtx, {
    get(target, prop) {
      return prop in target ? target[prop] : () => {};
    },
  });
  const mock2d = {
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {},
    scale: () => {},
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    drawImage: () => {},
    translate: () => {},
    strokeRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  const mockDoc = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ width: 64, height: 64, getContext: () => mock2d }),
  };
  const mockCanvas = {
    width: 400,
    height: 300,
    ownerDocument: mockDoc,
    getRootNode: () => mockDoc,
    getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
    getContext: (type) => (type === '2d' ? mock2d : mockCtx),
  };

  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = mockDoc;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  try {
    const state = newState();
    state.elevationGrid = new ElevationGrid({
      width: 2,
      height: 2,
      data: [10, 10, 10, 10],
      minElevation: 10,
      maxElevation: 10,
      verticalScale: 1.5,
      elevationUnit: 'm',
    });
    const originalDataRef = state.elevationGrid.data;

    const api = createScene3D(
      mockCanvas,
      () => state,
      () => 0
    );
    api.show();

    const ground = api.scene.children.find((ch) => ch.userData && ch.userData.isGridTerrain);
    assert.ok(ground, '3D ground terrain mesh should exist');

    const zMeters = ground.geometry.attributes.position.getZ(0);
    assert.ok(
      Math.abs(zMeters - 10 * 1.5 * 3.28084) < 1e-3,
      `Expected meter-scaled vertex Z (~${(10 * 1.5 * 3.28084).toFixed(4)}), got ${zMeters}`
    );

    // Switch unit to feet in place without re-parsing raster buffer
    state.elevationGrid.elevationUnit = 'ft';
    api.update();

    const zFeet = ground.geometry.attributes.position.getZ(0);
    assert.ok(
      Math.abs(zFeet - 10 * 1.5) < 1e-3,
      `Expected feet-scaled vertex Z (15.0), got ${zFeet}`
    );
    assert.strictEqual(
      state.elevationGrid.data,
      originalDataRef,
      'Raw Float32Array raster buffer should remain untouched on unit switch'
    );

    api.destroy();
  } finally {
    globalThis.requestAnimationFrame = prevRAF;
    globalThis.cancelAnimationFrame = prevCAF;
    globalThis.window = prevWin;
    globalThis.document = prevDoc;
    globalThis.ResizeObserver = prevRO;
  }
});

test('Terrain dialog (#dlg-elevation) exposes accessible #elevation-unit selector wired in app.js', () => {
  const html = readFileSync(resolve('index.html'), 'utf8');
  const appJs = readFileSync(resolve('js/app.js'), 'utf8');

  assert.match(
    html,
    /<label for="elevation-unit">Elevation Unit<\/label>\s*<select id="elevation-unit">/
  );
  assert.match(html, /<option value="m"[^>]*>Meters \(m\)<\/option>/);
  assert.match(html, /<option value="ft"[^>]*>Feet \(ft\)<\/option>/);
  assert.ok(appJs.includes('doc.elevationGrid.elevationUnit = unit;'));
});
