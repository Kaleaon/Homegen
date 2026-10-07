import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ElevationGrid,
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
