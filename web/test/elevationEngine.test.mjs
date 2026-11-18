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

function referenceMultiPassMarchingSquares(grid, intervalOverride = null) {
  if (!grid || !grid.data || grid.width < 2 || grid.height < 2) return [];
  const lookup = [
    [],
    [[3, 2]],
    [[2, 1]],
    [[3, 1]],
    [[1, 0]],
    [
      [3, 0],
      [2, 1],
    ],
    [[2, 0]],
    [[3, 0]],
    [[0, 3]],
    [[0, 2]],
    [
      [0, 1],
      [3, 2],
    ],
    [[0, 1]],
    [[1, 3]],
    [[1, 2]],
    [[2, 3]],
    [],
  ];
  const edgePt = (x, y, edge, v0, v1, v2, v3, z, width, height, bounds) => {
    let cx1 = x,
      cy1 = y,
      cx2 = x,
      cy2 = y,
      val1 = v0,
      val2 = v1;
    if (edge === 0) {
      cx2 = x + 1;
      val2 = v1;
    } else if (edge === 1) {
      cx1 = x + 1;
      cx2 = x + 1;
      cy2 = y + 1;
      val1 = v1;
      val2 = v2;
    } else if (edge === 2) {
      cy1 = y + 1;
      cx2 = x + 1;
      cy2 = y + 1;
      val1 = v3;
      val2 = v2;
    } else if (edge === 3) {
      cy2 = y + 1;
      val1 = v0;
      val2 = v3;
    }
    let t = 0.5;
    if (Math.abs(val2 - val1) > 1e-6) {
      t = Math.max(0, Math.min(1, (z - val1) / (val2 - val1)));
    }
    const gx = cx1 + t * (cx2 - cx1);
    const gy = cy1 + t * (cy2 - cy1);
    return {
      x: bounds.minX + (gx / (width - 1)) * (bounds.maxX - bounds.minX),
      y: bounds.minY + (gy / (height - 1)) * (bounds.maxY - bounds.minY),
    };
  };

  const interval = intervalOverride || grid.contourInterval || 1.0;
  const startLevel = Math.ceil(grid.minElevation / interval) * interval;
  const levels = [];
  for (let z = startLevel; z <= grid.maxElevation; z += interval) {
    levels.push(Number(z.toFixed(2)));
  }
  const { width, height, data, bounds } = grid;
  const contours = [];
  for (const z of levels) {
    const lines = [];
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const v0 = data[y * width + x];
        const v1 = data[y * width + x + 1];
        const v2 = data[(y + 1) * width + x + 1];
        const v3 = data[(y + 1) * width + x];
        let idx = 0;
        if (v0 >= z) idx |= 8;
        if (v1 >= z) idx |= 4;
        if (v2 >= z) idx |= 2;
        if (v3 >= z) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        for (const [eA, eB] of lookup[idx]) {
          const pA = edgePt(x, y, eA, v0, v1, v2, v3, z, width, height, bounds);
          const pB = edgePt(x, y, eB, v0, v1, v2, v3, z, width, height, bounds);
          lines.push({ x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
        }
      }
    }
    if (lines.length > 0) contours.push({ elevation: z, lines });
  }
  return contours;
}

test('computeMarchingSquares returns empty array for flat grids even when elevation equals a contour level', () => {
  const flatGrid = new ElevationGrid({
    width: 6,
    height: 6,
    data: new Float32Array(36).fill(5.0),
    minElevation: 0,
    maxElevation: 10,
    contourInterval: 5.0,
  });

  assert.deepEqual(computeMarchingSquares(flatGrid), []);

  const exactFlatGrid = new ElevationGrid({
    width: 4,
    height: 4,
    data: new Float32Array(16).fill(4.0),
    minElevation: 4.0,
    maxElevation: 4.0,
    contourInterval: 1.0,
  });

  assert.deepEqual(computeMarchingSquares(exactFlatGrid), []);
});

test('computeMarchingSquares buckets cells spanning multiple contour intervals accurately', () => {
  const cliffGrid = new ElevationGrid({
    width: 2,
    height: 2,
    data: [0, 25, 0, 25],
    minElevation: 0,
    maxElevation: 25,
    contourInterval: 2.0,
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
  });

  const actual = computeMarchingSquares(cliffGrid);
  const expected = referenceMultiPassMarchingSquares(cliffGrid);

  assert.equal(actual.length, 12); // Levels 2, 4, ..., 24 (0 has index 15, 26 > 25)
  assert.deepEqual(actual, expected);
});

test('computeMarchingSquares produces identical output to multi-pass reference on uniform and complex heightmaps', () => {
  // Uniform diagonal gradient grid
  const uw = 20;
  const uh = 16;
  const uniformData = new Float32Array(uw * uh);
  for (let y = 0; y < uh; y++) {
    for (let x = 0; x < uw; x++) {
      uniformData[y * uw + x] = x * 1.25 + y * 0.75;
    }
  }
  const uniformGrid = new ElevationGrid({
    width: uw,
    height: uh,
    data: uniformData,
    minElevation: 0,
    maxElevation: 36,
    contourInterval: 2.5,
    bounds: { minX: -200, maxX: 200, minY: -150, maxY: 150 },
  });

  assert.deepEqual(
    computeMarchingSquares(uniformGrid),
    referenceMultiPassMarchingSquares(uniformGrid)
  );

  // Complex procedural terrain with peaks, valleys, flat terraces, and saddle points
  const cw = 40;
  const ch = 40;
  const complexData = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (x >= 5 && x <= 10 && y >= 5 && y <= 10) {
        complexData[y * cw + x] = 12.0; // Flat terrace at an exact contour level
      } else {
        const dx1 = (x - 15) / 6;
        const dy1 = (y - 18) / 6;
        const dx2 = (x - 28) / 5;
        const dy2 = (y - 24) / 5;
        complexData[y * cw + x] =
          20 * Math.exp(-(dx1 * dx1 + dy1 * dy1)) -
          12 * Math.exp(-(dx2 * dx2 + dy2 * dy2)) +
          4 * Math.sin(x * 0.7) * Math.cos(y * 0.7);
      }
    }
  }
  const complexGrid = new ElevationGrid({
    width: cw,
    height: ch,
    data: complexData,
    minElevation: -15,
    maxElevation: 25,
    contourInterval: 1.5,
    bounds: { minX: -500, maxX: 500, minY: -500, maxY: 500 },
  });

  const complexActual = computeMarchingSquares(complexGrid);
  const complexExpected = referenceMultiPassMarchingSquares(complexGrid);
  assert.ok(complexActual.length > 15);
  assert.deepEqual(complexActual, complexExpected);
});

test('computeMarchingSquares handles floating-point interval boundaries and out-of-bounds cell elevations', () => {
  const w = 15;
  const h = 15;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Includes exact tenths like 0.3 where 0.3 / 0.1 === 2.9999999999999996 in IEEE-754
      data[y * w + x] = (x - 3) * 0.1 + Math.sin(y) * 0.33;
    }
  }
  // Explicitly inject extreme outlier elevations outside [minElevation, maxElevation]
  data[0] = -100.0;
  data[w * h - 1] = 250.0;

  for (const interval of [0.1, 0.15, 0.3, 0.33]) {
    const grid = new ElevationGrid({
      width: w,
      height: h,
      data,
      minElevation: -0.25,
      maxElevation: 1.25,
      contourInterval: interval,
    });

    assert.deepEqual(
      computeMarchingSquares(grid, interval),
      referenceMultiPassMarchingSquares(grid, interval),
      `Mismatch for floating-point interval ${interval}`
    );
  }

  // Degenerate inputs return empty array safely
  assert.deepEqual(computeMarchingSquares(null), []);
  assert.deepEqual(computeMarchingSquares({ width: 1, height: 5, data: [1, 2, 3, 4, 5] }), []);
  assert.deepEqual(
    computeMarchingSquares({
      width: 2,
      height: 2,
      data: [0, 1, 2, 3],
      minElevation: 0,
      maxElevation: 3,
      contourInterval: -1,
    }),
    []
  );
  assert.deepEqual(
    computeMarchingSquares({
      width: 2,
      height: 2,
      data: [0, 1, 2, 3],
      minElevation: 10,
      maxElevation: 5,
      contourInterval: 1,
    }),
    []
  );
});

test('computeMarchingSquares scans grid cells in a single O(W * H) pass independent of level count', () => {
  const width = 20;
  const height = 20;
  const raw = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw[y * width + x] = x + y;
    }
  }

  let elementReads = 0;
  const trackedData = new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && prop !== 'length' && !Number.isNaN(Number(prop))) {
        elementReads++;
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const grid = {
    width,
    height,
    data: trackedData,
    minElevation: 0,
    maxElevation: 50,
    contourInterval: 0.5, // 101 contour levels
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
  };

  const contours = computeMarchingSquares(grid);
  assert.ok(contours.length > 30);

  const cellCount = (width - 1) * (height - 1);
  // Single pass reads 4 corners per cell once (1,444 reads), whereas O(L*W*H) would perform 145,844 reads
  assert.equal(elementReads, cellCount * 4);
});
