import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCadWorkerMessage } from '../js/cadWorker.js';
import { CadWorkerClient } from '../js/cadWorkerClient.js';
import { SnappingBridge } from '../js/snapping-bridge.js';
import { ElevationGrid, computeContoursAsync } from '../js/elevationEngine.js';
import { InteractionLayer } from '../../designer3d/tools/index.mjs';

test('cadWorker direct message handler processes COMPUTE_SNAP with Float32Array transferable payload', () => {
  const rooms = [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }];
  const settings = {
    unitSize: 6,
    magneticThreshold: 14,
    edgeThreshold: 14,
    midpointThreshold: 14,
    perpendicularThreshold: 14,
  };
  const snapModes = { grid: false, edge: false, midpoint: true, perpendicular: false };

  // Sync scene state
  handleCadWorkerMessage({
    data: {
      type: 'SYNC_SCENE_DIFF',
      reqId: 1,
      payload: { rooms, settings, snapModes },
    },
  });

  // Transferable point buffer [px, py, ax, ay] = [60, 0.2, 60, 0.2]
  const pointBuffer = new Float32Array([60, 0.2, 60, 0.2]);
  const res = handleCadWorkerMessage({
    data: {
      type: 'COMPUTE_SNAP',
      reqId: 2,
      payload: { pointBuffer, rooms, settings, snapModes },
    },
  });

  assert.equal(res.type, 'SNAP_RESULT');
  assert.equal(res.reqId, 2);
  assert.ok(res.snap);
  assert.equal(res.snap.type, 'midpoint');
  assert.equal(res.point.x, 60);
  assert.equal(res.point.y, 0);
  assert.ok(res.outBuffer instanceof Float32Array);
});

test('cadWorker direct message handler processes VALIDATE_COLLISION with transferable candidate polygon', () => {
  const existingRooms = [
    [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
  ];
  const candidateCoords = new Float32Array([150, 150, 250, 150, 250, 250, 150, 250]);

  const res = handleCadWorkerMessage({
    data: {
      type: 'VALIDATE_COLLISION',
      reqId: 3,
      payload: {
        polyBuffer: candidateCoords,
        existingPolygons: existingRooms,
      },
    },
  });

  assert.equal(res.type, 'COLLISION_RESULT');
  assert.equal(res.validation.valid, true);
  assert.equal(res.feedback.invalid, false);
});

test('CadWorkerClient async methods execute off-thread or via sync fallback seamlessly', async () => {
  const client = new CadWorkerClient({ useWorker: false }); // Test sync fallback pipeline
  const rooms = [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }];
  const settings = { unitSize: 6, magneticThreshold: 14, edgeThreshold: 14, midpointThreshold: 14 };
  const snapModes = { grid: true, edge: true, midpoint: false, perpendicular: false };

  client.syncSceneDiff({ rooms, settings, snapModes });

  const snapRes = await client.computeSnapAsync({ x: 6.1, y: 11.9 }, { x: 6.1, y: 11.9 });
  assert.ok(snapRes);
  assert.equal(snapRes.type, 'SNAP_RESULT');
  assert.equal(snapRes.point.x, 6);
  assert.equal(snapRes.point.y, 12);

  const candidatePoly = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 50, y: 50 },
    { x: 10, y: 50 },
  ];
  const collisionRes = await client.validateCollisionAsync(candidatePoly, [
    [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
  ]);
  assert.ok(collisionRes);
  assert.equal(collisionRes.type, 'COLLISION_RESULT');
  assert.equal(collisionRes.validation.valid, false); // Overlaps with room at 0,0,120,120
});

test('SnappingBridge uses worker client and provides optimistic UI updates without blocking', async () => {
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 14, edgeThreshold: 14, midpointThreshold: 14 },
    snapModes: { grid: true, edge: false, midpoint: false, perpendicular: false },
  });

  const bridge = new SnappingBridge({
    interaction,
    getRooms: () => [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }],
  });

  // Main thread call returns immediately
  const snap = bridge.computeSnap({ x: 12.1, y: 5.9 });
  assert.ok(snap);
  assert.equal(snap.point.x, 12);
  assert.equal(snap.point.y, 6);
});

test('computeContoursAsync delegates isoline Marching Squares calculation to CadWorkerClient', async () => {
  const grid = new ElevationGrid({
    width: 3,
    height: 3,
    data: new Float32Array([0, 2, 4, 2, 5, 2, 0, 2, 0]),
    minElevation: 0,
    maxElevation: 5,
    contourInterval: 2,
  });

  const contours = await computeContoursAsync(grid, 2);
  assert.ok(Array.isArray(contours));
  assert.ok(contours.length > 0);
  assert.equal(contours[0].elevation, 2);
});
