import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionLayer, SNAP_MODES } from '../../designer3d/tools/index.mjs';
import { SnappingBridge } from '../js/snapping-bridge.js';

test('SnappingBridge computes snap points and guide lines during pointer move', () => {
  const interaction = new InteractionLayer({
    gridSettings: {
      unitSize: 6,
      magneticThreshold: 14,
      edgeThreshold: 14,
      midpointThreshold: 14,
      perpendicularThreshold: 14,
    },
    snapModes: { grid: false, edge: false, midpoint: true, perpendicular: false },
  });

  const rooms = [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }];

  const bridge = new SnappingBridge({
    interaction,
    getRooms: () => rooms,
  });

  // Pointer near midpoint (60, 0)
  const snapRes = bridge.computeSnap({ x: 60, y: 0.2 });

  assert.ok(snapRes);
  assert.ok(snapRes.snap);
  assert.equal(snapRes.snap.type, 'midpoint');
  assert.equal(snapRes.point.x, 60);
  assert.equal(snapRes.point.y, 0);
  assert.equal(snapRes.guideLines.length, 1);
  assert.equal(snapRes.indicator.x, 60);
  assert.equal(snapRes.indicator.y, 0);
});

test('SnappingBridge attaches and detaches event listeners cleanly', () => {
  let listenersAdded = 0;
  let listenersRemoved = 0;

  const fakeCanvas = {
    addEventListener: (_type, _handler) => {
      listenersAdded++;
    },
    removeEventListener: (_type, _handler) => {
      listenersRemoved++;
    },
  };

  const bridge = new SnappingBridge();
  bridge.attach(fakeCanvas);

  assert.equal(listenersAdded, 4);
  assert.equal(bridge.attached, true);

  bridge.detach();
  assert.equal(listenersRemoved, 4);
  assert.equal(bridge.attached, false);
  assert.equal(bridge.getActiveSnap(), null);
});

test('SnappingBridge responds to toolbar snap mode toggles', () => {
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 14, edgeThreshold: 14, midpointThreshold: 14 },
    snapModes: { grid: true, edge: false, midpoint: false, perpendicular: false },
  });

  const rooms = [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }];
  const bridge = new SnappingBridge({ interaction, getRooms: () => rooms });

  // Initially midpoint is disabled
  let snapRes = bridge.computeSnap({ x: 60, y: 0.2 });
  assert.equal(snapRes.snap?.type, 'grid');

  // Toggle grid mode OFF, midpoint mode ON
  interaction.toggleSnapMode(SNAP_MODES.GRID, false);
  interaction.toggleSnapMode(SNAP_MODES.MIDPOINT, true);
  snapRes = bridge.computeSnap({ x: 60, y: 0.2 });
  assert.equal(snapRes.snap?.type, 'midpoint');
});

test('Direct consumption of SnappingBridge active snap points for room moves and resizes', () => {
  const interaction = new InteractionLayer({
    gridSettings: {
      unitSize: 6,
      magneticThreshold: 14,
      edgeThreshold: 14,
      midpointThreshold: 14,
      perpendicularThreshold: 14,
    },
    snapModes: { grid: false, edge: true, midpoint: true, perpendicular: false },
  });

  const room1 = { id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 };
  const room2 = { id: 'r2', x: 130, y: 0, w: 120, h: 120, level: 0 };

  const bridge = new SnappingBridge({
    interaction,
    getRooms: () => [room1, room2],
  });

  // Moving room2 near room1's right edge (120, 0)
  const rawTarget = { x: 121.2, y: 0.1 };
  const snapRes = bridge.computeSnap(rawTarget, rawTarget, [room1]);

  assert.ok(snapRes.snap);
  assert.equal(snapRes.snap.type, 'edge');
  assert.equal(snapRes.point.x, 120);
  assert.equal(snapRes.point.y, 0.1);
  assert.equal(bridge.getActiveSnap().point.x, 120);

  // Resizing room1 corner near room2's left edge (130, 0)
  const cornerRaw = { x: 129.5, y: 0 };
  const resizeSnap = bridge.computeSnap(cornerRaw, cornerRaw, [room2]);
  assert.ok(resizeSnap.snap);
  assert.equal(resizeSnap.point.x, 130);
  assert.equal(bridge.getActiveSnap().point.x, 130);
});

test('Direct consumption of SnappingBridge active snap points for item and opening placement', () => {
  const interaction = new InteractionLayer({
    gridSettings: {
      unitSize: 6,
      magneticThreshold: 14,
      edgeThreshold: 14,
      midpointThreshold: 14,
      perpendicularThreshold: 14,
    },
    snapModes: { grid: false, edge: false, midpoint: true, perpendicular: false },
  });

  const room1 = { id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 };
  const bridge = new SnappingBridge({
    interaction,
    getRooms: () => [room1],
  });

  // Pointer near top wall midpoint (60, 0)
  const pointerRaw = { x: 59.8, y: 0.3 };
  const snapRes = bridge.computeSnap(pointerRaw, pointerRaw);

  assert.ok(snapRes.snap);
  assert.equal(snapRes.snap.type, 'midpoint');
  assert.equal(snapRes.point.x, 60);
  assert.equal(snapRes.point.y, 0);

  // Confirm activeSnap matches snap indicator
  const active = bridge.getActiveSnap();
  assert.deepEqual(active.point, { x: 60, y: 0 });
  assert.deepEqual(active.indicator, { x: 60, y: 0 });
});

