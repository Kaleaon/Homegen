import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InteractionLayer,
  getSnappedPoint,
  validatePlacement,
  createPlacementFeedback,
  buildToggleViewModel,
  SNAP_TOGGLE_DEFINITIONS,
} from '../../designer3d/tools/index.mjs';
import { extractRoomEdges, roomToPolygon, snap } from '../js/geometry.js';

test('InteractionLayer instantiates and manages snap modes and gizmos', () => {
  const layer = new InteractionLayer({
    gridSettings: { unitSize: 6 },
    snapModes: { grid: true, edge: true, midpoint: false, perpendicular: false },
  });

  assert.equal(layer.gridSettings.unitSize, 6);
  assert.equal(layer.getSnapModeState().grid, true);
  assert.equal(layer.getSnapModeState().edge, true);
  assert.equal(layer.getSnapModeState().midpoint, false);

  layer.toggleSnapMode('midpoint', true);
  assert.equal(layer.getSnapModeState().midpoint, true);
});

test('Multi-mode snapping uses getSnappedPoint for grid, edge, and midpoint snapping', () => {
  const layer = new InteractionLayer({
    gridSettings: {
      unitSize: 6,
      magneticThreshold: 14,
      edgeThreshold: 14,
      midpointThreshold: 14,
      perpendicularThreshold: 14,
    },
    snapModes: { grid: true, edge: true, midpoint: true, perpendicular: false },
  });

  const rooms = [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }];
  const edges = extractRoomEdges(rooms);

  // Near midpoint (60, 0) on North wall segment with midpoint mode active
  const nearMidpoint = { x: 60, y: 0.1 };
  const snapped = getSnappedPoint({
    point: nearMidpoint,
    edges,
    settings: layer.gridSettings,
    snapModes: new layer.snapModes.constructor({
      grid: false,
      edge: false,
      midpoint: true,
      perpendicular: false,
    }),
  });

  assert.ok(snapped.snap);
  assert.equal(snapped.snap.type, 'midpoint');
  assert.equal(snapped.point.x, 60);
  assert.equal(snapped.point.y, 0);
});

test('validatePlacement and createPlacementFeedback return ghost preview and valid status', () => {
  const existingRooms = [roomToPolygon({ x: 0, y: 0, w: 120, h: 120 })];

  // Candidate non-overlapping room
  const nonOverlappingCandidate = roomToPolygon({ x: 130, y: 0, w: 120, h: 120 });
  const validRes = validatePlacement(nonOverlappingCandidate, existingRooms);
  const validFeedback = createPlacementFeedback(nonOverlappingCandidate, validRes);

  assert.equal(validRes.valid, true);
  assert.equal(validFeedback.invalid, false);
  assert.equal(validFeedback.style.color, '#2f8f5b');

  // Candidate overlapping room
  const overlappingCandidate = roomToPolygon({ x: 50, y: 50, w: 120, h: 120 });
  const invalidRes = validatePlacement(overlappingCandidate, existingRooms);
  const invalidFeedback = createPlacementFeedback(overlappingCandidate, invalidRes);

  assert.equal(invalidRes.valid, false);
  assert.equal(invalidFeedback.invalid, true);
  assert.equal(invalidFeedback.style.color, '#e84040');
});

test('buildToggleViewModel generates toggle items with token bindings from SNAP_TOGGLE_DEFINITIONS', () => {
  const layer = new InteractionLayer();
  const toggles = buildToggleViewModel(layer);

  assert.equal(toggles.length, SNAP_TOGGLE_DEFINITIONS.length);
  const gridToggle = toggles.find((t) => t.id === 'grid');
  assert.ok(gridToggle);
  assert.equal(gridToggle.token, '--ktheme-accent');
  assert.equal(gridToggle.tokenHover, '--ktheme-accent-hover');
  assert.equal(typeof gridToggle.onToggle, 'function');

  gridToggle.onToggle(false);
  assert.equal(layer.getSnapModeState().grid, false);
});

test('geometry helpers extract edges and convert shapes to polygons', () => {
  const room = { id: 'r1', x: 0, y: 0, w: 100, h: 100 };
  const poly = roomToPolygon(room);
  assert.equal(poly.length, 4);
  assert.deepEqual(poly[0], { x: 0, y: 0 });
  assert.deepEqual(poly[2], { x: 100, y: 100 });

  const edges = extractRoomEdges([room]);
  assert.equal(edges.length, 4);

  assert.equal(snap(12.3, 6), 12);
});
