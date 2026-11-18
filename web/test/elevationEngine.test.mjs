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

function createSyntheticGeoTIFF({
  littleEndian = true,
  width = 2,
  height = 2,
  bitsPerSample = 8,
  sampleFormat = null,
  noData = null,
  noDataIncludeNull = true,
  noDataCountOverride = null,
  noDataOffsetOverride = null,
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
  if (sampleFormat !== null) {
    entries.push({ tag: 339, type: 3, count: 1, val: sampleFormat });
  }

  let noDataBytes = null;
  let noDataCount = 0;
  if (noData !== null) {
    const str = String(noData);
    const len = str.length + (noDataIncludeNull ? 1 : 0);
    noDataBytes = new Uint8Array(len);
    for (let i = 0; i < str.length; i++) {
      noDataBytes[i] = str.charCodeAt(i);
    }
    if (noDataIncludeNull) {
      noDataBytes[str.length] = 0;
    }
    noDataCount = noDataCountOverride ?? noDataBytes.length;
  }

  const extraEntries =
    (pixelScale ? 1 : 0) +
    (tiepoint ? 1 : 0) +
    (transformation ? 1 : 0) +
    (noDataBytes ? 1 : 0) +
    1; // StripOffsets

  let currentOffset = 8 + 2 + (entries.length + extraEntries) * 12 + 4;
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

  let noDataOffset = 0;
  if (noDataBytes) {
    if (noDataCount <= 4 && noDataOffsetOverride === null) {
      entries.push({ tag: 42113, type: 2, count: noDataCount, val: 0, inlineBytes: noDataBytes });
    } else {
      noDataOffset = currentOffset;
      entries.push({
        tag: 42113,
        type: 2,
        count: noDataCount,
        val: noDataOffsetOverride ?? noDataOffset,
      });
      currentOffset += Math.ceil(noDataBytes.length / 8) * 8;
    }
  }

  const stripOffset = currentOffset;
  entries.push({ tag: 273, type: 4, count: 1, val: stripOffset });

  const bytesPerSample =
    bitsPerSample === 64 ? 8 : bitsPerSample === 32 ? 4 : bitsPerSample === 16 ? 2 : 1;
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
    if (e.inlineBytes) {
      for (let j = 0; j < Math.min(4, e.inlineBytes.length); j++) {
        view.setUint8(entryOffset + 8 + j, e.inlineBytes[j]);
      }
    } else {
      view.setUint32(entryOffset + 8, e.val, littleEndian);
    }
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
  if (noDataBytes && noDataOffset > 0) {
    for (let i = 0; i < noDataBytes.length; i++) {
      view.setUint8(noDataOffset + i, noDataBytes[i]);
    }
  }

  const pixels = pixelData || new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    if (bytesPerSample === 8) {
      view.setFloat64(stripOffset + i * 8, pixels[i], littleEndian);
    } else if (bytesPerSample === 4) {
      if (sampleFormat === 3 || pixels instanceof Float32Array || pixels instanceof Float64Array) {
        view.setFloat32(stripOffset + i * 4, pixels[i], littleEndian);
      } else if (sampleFormat === 2 || pixels instanceof Int32Array) {
        view.setInt32(stripOffset + i * 4, pixels[i], littleEndian);
      } else {
        view.setUint32(stripOffset + i * 4, pixels[i], littleEndian);
      }
    } else if (bytesPerSample === 2) {
      if (sampleFormat === 2 || pixels instanceof Int16Array) {
        view.setInt16(stripOffset + i * 2, pixels[i], littleEndian);
      } else {
        view.setUint16(stripOffset + i * 2, pixels[i], littleEndian);
      }
    } else if (sampleFormat === 2 || pixels instanceof Int8Array) {
      view.setInt8(stripOffset + i, pixels[i]);
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

test('parseGeoTIFFWithFallback parses GDAL_NODATA tag 42113 for uint16 65535 sentinels and prevents runaway isoline loops', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 3,
    height: 3,
    bitsPerSample: 16,
    noData: '65535',
    pixelData: new Uint16Array([100, 105, 110, 102, 65535, 108, 65535, 106, 112]),
  });

  const grid = await parseGeoTIFFWithFallback(buffer, {
    minElevation: 0,
    maxElevation: 65535,
    contourInterval: 2.0,
  });

  assert.equal(grid.minElevation, 100);
  assert.equal(grid.maxElevation, 112);
  // Void pixels (indices 4 and 6) are substituted with baseline minElevation (100)
  assert.equal(grid.data[4], 100);
  assert.equal(grid.data[6], 100);

  const contours = computeMarchingSquares(grid);
  assert.ok(contours.length > 0 && contours.length <= 7);
  assert.ok(contours.every((c) => c.elevation >= 100 && c.elevation <= 112));
});

test('parseGeoTIFFWithFallback filters -9999 GDAL_NODATA sentinels in signed Int16 and Float32 rasters', async () => {
  const int16Buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 3,
    height: 2,
    bitsPerSample: 16,
    sampleFormat: 2,
    noData: '-9999',
    pixelData: new Int16Array([240, 245, -9999, 242, 250, -9999]),
  });

  const int16Grid = await parseGeoTIFFWithFallback(int16Buffer, { contourInterval: 2.0 });
  assert.equal(int16Grid.minElevation, 240);
  assert.equal(int16Grid.maxElevation, 250);
  assert.equal(int16Grid.data[2], 240);
  assert.equal(int16Grid.data[5], 240);

  const int16Contours = computeMarchingSquares(int16Grid);
  assert.ok(int16Contours.length > 0 && int16Contours.length <= 6);
  assert.ok(int16Contours.every((c) => c.elevation >= 240 && c.elevation <= 250));

  const float32Buffer = createSyntheticGeoTIFF({
    littleEndian: false,
    width: 2,
    height: 2,
    bitsPerSample: 32,
    sampleFormat: 3,
    noData: '-9999.0',
    pixelData: new Float32Array([15.5, -9999.0, 18.5, 21.5]),
  });

  const float32Grid = await parseGeoTIFFWithFallback(float32Buffer, { contourInterval: 1.0 });
  assert.equal(float32Grid.minElevation, 15.5);
  assert.equal(float32Grid.maxElevation, 21.5);
  assert.equal(float32Grid.data[1], 15.5);

  const floatContours = computeMarchingSquares(float32Grid);
  assert.ok(floatContours.length <= 6);
});

test('parseGeoTIFFWithFallback decodes inline (<= 4 byte) ASCII tag 42113 entries', async () => {
  // 4-byte inline ASCII ("255\0", count = 4)
  const inline4Buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
    bitsPerSample: 8,
    noData: '255',
    noDataIncludeNull: true,
    pixelData: new Uint8Array([51, 102, 153, 255]),
  });

  const grid4 = await parseGeoTIFFWithFallback(inline4Buffer, {
    minElevation: 0,
    maxElevation: 100,
  });
  assert.equal(Math.round(grid4.minElevation), 20);
  assert.equal(Math.round(grid4.maxElevation), 60);
  assert.equal(Math.round(grid4.data[3]), 20);

  // 3-byte inline ASCII ("-9\0", count = 3) in Big-Endian signed raster
  const inline3Buffer = createSyntheticGeoTIFF({
    littleEndian: false,
    width: 2,
    height: 2,
    bitsPerSample: 16,
    sampleFormat: 2,
    noData: '-9',
    noDataIncludeNull: true,
    pixelData: new Int16Array([-9, 12, 16, 20]),
  });

  const grid3 = await parseGeoTIFFWithFallback(inline3Buffer);
  assert.equal(grid3.minElevation, 12);
  assert.equal(grid3.maxElevation, 20);
  assert.equal(grid3.data[0], 12);
});

test('parseGeoTIFFWithFallback supports options.noDataValue, options.noDataReplacement, and options.filterStandardSentinels', async () => {
  const buffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
    bitsPerSample: 16,
    noData: '65535',
    pixelData: new Uint16Array([1000, 2000, 9999, 65535]),
  });

  // Override tag 42113 via options.noDataValue and customize replacement via options.noDataReplacement
  const overriddenGrid = await parseGeoTIFFWithFallback(buffer, {
    minElevation: 0,
    maxElevation: 65535,
    noDataValue: 9999,
    noDataReplacement: 500,
  });
  assert.equal(overriddenGrid.minElevation, 1000);
  assert.equal(overriddenGrid.maxElevation, 65535);
  assert.equal(overriddenGrid.data[2], 500);

  // Standard uint16 sentinel filtering when tag 42113 is absent
  const untaggedBuffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
    bitsPerSample: 16,
    pixelData: new Uint16Array([500, 1000, 1500, 65535]),
  });
  const sentinelGrid = await parseGeoTIFFWithFallback(untaggedBuffer, {
    minElevation: 0,
    maxElevation: 65535,
    filterStandardSentinels: true,
  });
  assert.equal(sentinelGrid.minElevation, 500);
  assert.equal(sentinelGrid.maxElevation, 1500);
  assert.equal(sentinelGrid.data[3], 500);
});

test('parseGeoTIFFWithFallback handles all-NoData rasters and corrupt tag 42113 strings gracefully', async () => {
  // All pixels match GDAL_NODATA -> falls back to default elevation range [0, 10]
  const allVoidBuffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
    bitsPerSample: 16,
    sampleFormat: 2,
    noData: '-9999',
    pixelData: new Int16Array([-9999, -9999, -9999, -9999]),
  });

  const allVoidGrid = await parseGeoTIFFWithFallback(allVoidBuffer);
  assert.equal(allVoidGrid.minElevation, 0);
  assert.equal(allVoidGrid.maxElevation, 10);
  assert.deepEqual(Array.from(allVoidGrid.data), [0, 0, 0, 0]);
  assert.deepEqual(computeMarchingSquares(allVoidGrid), []);

  // Corrupt non-numeric ASCII string in tag 42113 -> ignored without failing decode
  const corruptTagBuffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
    bitsPerSample: 8,
    noData: 'NOT_A_NUMBER',
    pixelData: new Uint8Array([0, 51, 102, 255]),
  });

  const corruptTagGrid = await parseGeoTIFFWithFallback(corruptTagBuffer, {
    minElevation: 0,
    maxElevation: 100,
  });
  assert.equal(Math.round(corruptTagGrid.minElevation), 0);
  assert.equal(Math.round(corruptTagGrid.maxElevation), 100);

  // Corrupt out-of-bounds ASCII offset in tag 42113 -> ignored safely
  const badOffsetBuffer = createSyntheticGeoTIFF({
    littleEndian: true,
    width: 2,
    height: 2,
    bitsPerSample: 8,
    noData: '-99999',
    noDataOffsetOverride: 999999,
    pixelData: new Uint8Array([0, 128, 255, 255]),
  });
  const badOffsetGrid = await parseGeoTIFFWithFallback(badOffsetBuffer, {
    minElevation: 0,
    maxElevation: 100,
  });
  assert.equal(Math.round(badOffsetGrid.minElevation), 0);
  assert.equal(Math.round(badOffsetGrid.maxElevation), 100);
});
