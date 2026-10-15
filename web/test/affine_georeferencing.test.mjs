import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import {
  parseWorldfile,
  solveAffineTransform,
  computeGeoBounds,
  worldfileToAffineMatrix,
  reproject,
} from '../js/geometry.js';

test('parseWorldfile and worldfileToAffineMatrix parse ESRI worldfile strings, arrays, and objects', () => {
  const tfwString = `0.5\n0.1\n-0.1\n-0.5\n500000.0\n4000000.0`;
  const parsed = parseWorldfile(tfwString);
  assert.deepEqual(parsed, [0.5, 0.1, -0.1, -0.5, 500000.0, 4000000.0]);

  const arr = [1.2, 0.0, 0.0, -1.2, 100, 200];
  assert.deepEqual(parseWorldfile(arr), arr);

  const obj = { A: 2.0, D: 0.1, B: -0.1, E: -2.0, C: 50.0, F: 60.0 };
  assert.deepEqual(parseWorldfile(obj), [2.0, 0.1, -0.1, -2.0, 50.0, 60.0]);

  assert.equal(parseWorldfile('invalid string'), null);
  assert.equal(parseWorldfile(null), null);

  const aff = worldfileToAffineMatrix(arr, 'PLAN', 'PLAN');
  assert.deepEqual(aff, arr);
});

test('solveAffineTransform computes 2x3 affine matrix from 3 control points', () => {
  const src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ];
  const dst = [
    { x: 50, y: 100 },
    { x: 250, y: 100 }, // dx = 200 => a = 2.0
    { x: 50, y: 400 }, // dy = 300 => d = 3.0
  ];

  const matrix = solveAffineTransform(src, dst);
  assert.equal(matrix.length, 6);
  assert.ok(Math.abs(matrix[0] - 2.0) < 1e-6, 'a should be 2.0');
  assert.ok(Math.abs(matrix[1] - 0.0) < 1e-6, 'b should be 0.0');
  assert.ok(Math.abs(matrix[2] - 0.0) < 1e-6, 'c should be 0.0');
  assert.ok(Math.abs(matrix[3] - 3.0) < 1e-6, 'd should be 3.0');
  assert.ok(Math.abs(matrix[4] - 50.0) < 1e-6, 'e should be 50.0');
  assert.ok(Math.abs(matrix[5] - 100.0) < 1e-6, 'f should be 100.0');
});

test('solveAffineTransform detects collinear control points and throws error', () => {
  const srcCollinear = [
    { x: 10, y: 10 },
    { x: 20, y: 20 },
    { x: 30, y: 30 },
  ];
  const dst = [
    { x: 100, y: 100 },
    { x: 200, y: 200 },
    { x: 300, y: 300 },
  ];

  assert.throws(() => solveAffineTransform(srcCollinear, dst), /Collinear control points detected/);
});

test('computeGeoBounds computes valid bounding box in EPSG:4326', () => {
  const matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
  const bounds = computeGeoBounds(matrix, 200, 200, 'PLAN');

  assert.ok(typeof bounds.minLon === 'number');
  assert.ok(typeof bounds.minLat === 'number');
  assert.ok(typeof bounds.maxLon === 'number');
  assert.ok(typeof bounds.maxLat === 'number');
  assert.ok(bounds.maxLon >= bounds.minLon);
  assert.ok(bounds.maxLat >= bounds.minLat);
});

test('plan state serialization round-trips affineMatrix and geoBounds without data loss', () => {
  const s = m.newState();
  s.background = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    x: 50,
    y: 100,
    scale: 1.5,
    affineMatrix: [1.5, 0.2, -0.2, 1.5, 50, 100],
    geoBounds: {
      minLon: -122.42,
      minLat: 37.77,
      maxLon: -122.41,
      maxLat: 37.78,
      west: -122.42,
      south: 37.77,
      east: -122.41,
      north: 37.78,
    },
    opacity: 0.6,
    visible: true,
    locked: false,
    width: 800,
    height: 600,
  };

  const json = m.serialize(s);
  const loaded = m.deserialize(json);

  assert.deepEqual(loaded.background.affineMatrix, s.background.affineMatrix);
  assert.deepEqual(loaded.background.geoBounds, s.background.geoBounds);
});

test('rotated blueprint reprojection maintains alignment error < 0.05% under EPSG:4326, EPSG:3857, and EPSG:2227', () => {
  const angleRad = (15 * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const scale = 0.5;

  // 2x3 affine matrix for 15-degree rotated blueprint with scale 0.5
  const a = scale * cosA;
  const b = scale * sinA;
  const c = -scale * sinA;
  const d = scale * cosA;
  const e = 120; // 10 ft offset
  const f = 240; // 20 ft offset
  const matrix = [a, b, c, d, e, f];
  assert.equal(matrix.length, 6);

  const w = 1000;
  const h = 800;

  const testCRSs = ['EPSG:4326', 'EPSG:3857', 'EPSG:2227'];

  for (const crs of testCRSs) {
    // Transform image center (w/2, h/2) using matrix
    const px = w / 2;
    const py = h / 2;
    const expectedX = a * px + c * py + e;
    const expectedY = b * px + d * py + f;

    // Reproject through target CRS and back to PLAN
    const projected = reproject([expectedX, expectedY], 'PLAN', crs);
    const roundtrip = reproject(projected, crs, 'PLAN');

    const errX = Math.abs(roundtrip[0] - expectedX);
    const errY = Math.abs(roundtrip[1] - expectedY);
    const dist = Math.hypot(errX, errY);
    const maxDimension = Math.hypot(w * scale, h * scale);
    const relativeError = dist / maxDimension;

    assert.ok(
      relativeError < 0.0005,
      `Alignment relative error under ${crs} (${(relativeError * 100).toFixed(6)}%) exceeds 0.05% threshold`
    );
  }
});
