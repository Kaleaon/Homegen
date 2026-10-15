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

test('SnappingBridge generates primary angle guide lines and secondary reference edge guide lines for angle snaps', () => {
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, angleSnapDegrees: 15, magneticThreshold: 20 },
    snapModes: { grid: false, edge: false, midpoint: false, perpendicular: false, angle: true },
  });

  const anchor = { x: 50, y: 50 };

  // 1. Global cardinal angle snap (no reference edge)
  const bridge = new SnappingBridge({ interaction, getRooms: () => [] });
  const snapGlobal = bridge.computeSnap({ x: 100, y: 51 }, anchor);

  assert.ok(snapGlobal);
  assert.equal(snapGlobal.snap?.type, 'angle');
  assert.equal(snapGlobal.snap?.edgeIndex, undefined);
  assert.equal(snapGlobal.guideLines.length, 1);
  assert.equal(snapGlobal.guideLines[0].type, 'angle');
  assert.equal(snapGlobal.guideLines[0].start.x, anchor.x);
  assert.equal(snapGlobal.guideLines[0].start.y, anchor.y);

  // 2. Relative edge angle snap against angled wall (with primary angle + secondary angle_reference guide line)
  const wallAngle = 23.5 * (Math.PI / 180); // ~23.5° angled wall
  const wallLen = 100;
  const angledRoom = {
    id: 'r_angled',
    points: [
      { x: 0, y: 0 },
      { x: wallLen * Math.cos(wallAngle), y: wallLen * Math.sin(wallAngle) },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };

  bridge.setGetRooms(() => [angledRoom]);

  const dist = 50;
  const pointRelative = {
    x: anchor.x + dist * Math.cos(wallAngle + 0.01),
    y: anchor.y + dist * Math.sin(wallAngle + 0.01),
  };

  const snapRelative = bridge.computeSnap(pointRelative, anchor);

  assert.ok(snapRelative);
  assert.equal(snapRelative.snap?.type, 'angle');
  assert.equal(snapRelative.snap?.edgeIndex, 0); // Snapped to edge 0 of angledRoom
  assert.equal(snapRelative.guideLines.length, 2);
  assert.equal(snapRelative.guideLines[0].type, 'angle');
  assert.equal(snapRelative.guideLines[1].type, 'angle_reference');
  assert.equal(snapRelative.guideLines[1].start.x, 0);
  assert.equal(snapRelative.guideLines[1].start.y, 0);
});
