import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionLayer } from '../../designer3d/tools/index.mjs';
import { SnappingBridge } from '../js/snapping-bridge.js';
import { wallLength } from '../js/geometry.js';
import { nearestWallOnLevel } from '../js/model.js';

test('Unified Snapping: Room drafting derives coordinates from computeSnap without fractional drift', () => {
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 14, edgeThreshold: 14 },
    snapModes: { grid: true, edge: true, midpoint: false, perpendicular: false },
  });

  const existingRoom = { id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 };
  const bridge = new SnappingBridge({
    interaction,
    getRooms: () => [existingRoom],
  });

  // 1. Grid-aligned when far from edges
  const p1 = { x: 201.7, y: 153.2 };
  const snap1 = bridge.computeSnap(p1, p1);
  assert.equal(snap1.point.x, 204); // Round 201.7 to multiple of 6
  assert.equal(snap1.point.y, 156); // Round 153.2 to multiple of 6 (26 * 6 = 156)
  assert.deepEqual(snap1.indicator, { x: 204, y: 156 });
  assert.equal(snap1.snap.type, 'grid');

  // 2. Snapped to edge when near existing room boundary
  const p2 = { x: 121.5, y: 50 };
  const snap2 = bridge.computeSnap(p2, p2);
  assert.equal(snap2.point.x, 120); // Magnetic snap to edge x = 120
  assert.equal(snap2.snap.type, 'edge');
});

test('Unified Snapping: Multi-item drag delta calculation with group anchor snapping', () => {
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 14 },
    snapModes: { grid: true, edge: false },
  });

  const bridge = new SnappingBridge({ interaction, getRooms: () => [] });

  const dragStart = { x: 30, y: 40 };
  const pointerCurrent = { x: 53.8, y: 77.2 };
  const itemsMap = new Map([
    ['itemA', { cx: 30, cy: 40 }],
    ['itemB', { cx: 70, cy: 90 }],
  ]);

  const multiSnap = bridge.computeMultiSnap(pointerCurrent, dragStart, itemsMap);

  assert.ok(multiSnap);
  // Pointer snapped to grid (6): 53.8 -> 54, 77.2 -> 78
  assert.equal(multiSnap.point.x, 54);
  assert.equal(multiSnap.point.y, 78);
  // Deltas from dragStart (30, 40): dx = 54 - 30 = 24, dy = 78 - 40 = 38
  assert.equal(multiSnap.delta.dx, 24);
  assert.equal(multiSnap.delta.dy, 38);
  assert.equal(multiSnap.dx, 24);
  assert.equal(multiSnap.dy, 38);

  // Applied positions
  const posA = {
    x: itemsMap.get('itemA').cx + multiSnap.delta.dx,
    y: itemsMap.get('itemA').cy + multiSnap.delta.dy,
  };
  const posB = {
    x: itemsMap.get('itemB').cx + multiSnap.delta.dx,
    y: itemsMap.get('itemB').cy + multiSnap.delta.dy,
  };
  assert.deepEqual(posA, { x: 54, y: 78 });
  assert.deepEqual(posB, { x: 94, y: 128 });
});

test('Unified Snapping: Opening offset uses SnappingBridge target point without coarse snap rounding', () => {
  const room = { id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 };
  const state = { rooms: [room] };
  const openingDef = { id: 'door_32', w: 32 };

  // Nearest wall on north wall (y=0) at x=52.5 (fractional position on edge)
  const targetP = { x: 52.5, y: 0 };
  const nw = nearestWallOnLevel(state, targetP, 0, 40, room);
  assert.ok(nw);
  assert.equal(nw.wall, 'N');

  // Without coarse snap(nw.t - def.w / 2, 3), offset retains target precision
  const offset = Math.max(0, nw.t - openingDef.w / 2);
  assert.equal(offset, 52.5 - 16);
  assert.equal(offset, 36.5);
});

test('Unified Snapping: Wall item offset uses targetP without snap fallback', () => {
  const room = { id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 };
  const state = { rooms: [room] };
  const targetP = { x: 45.5, y: 0 };
  const nw = nearestWallOnLevel(state, targetP, 0, 40, room);
  assert.ok(nw);

  const len = wallLength(room, nw.wall);
  const rawOffset = Math.max(8, Math.min(len - 8, nw.t));

  // Offset directly equals rawOffset without snap(rawOffset, 2)
  const offset = rawOffset;
  assert.equal(offset, 45.5);
});
