import test from 'node:test';
import assert from 'node:assert/strict';
import { getSnappedPoint } from './snapping.mjs';
import { SnapModeState, SNAP_MODES } from './snapModes.mjs';
import { createGridSettings } from './gridSettings.mjs';

test('getSnappedPoint defaults scale to 1.0 when omitted', () => {
  const settings = createGridSettings({
    magneticThreshold: 14,
    edgeThreshold: 14,
  });
  const snapModes = new SnapModeState({
    [SNAP_MODES.GRID]: false,
    [SNAP_MODES.EDGE]: true,
    [SNAP_MODES.MIDPOINT]: false,
    [SNAP_MODES.PERPENDICULAR]: false,
    [SNAP_MODES.ANGLE]: false,
  });
  const edges = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, index: 0 }];

  // At distance 10 (within 14 world units / 1.0 scale)
  const resDefault = getSnappedPoint({
    point: { x: 50, y: 10 },
    edges,
    settings,
    snapModes,
  });
  assert.ok(resDefault.snap);
  assert.equal(resDefault.snap.type, 'edge');
  assert.equal(resDefault.point.y, 0);

  // At distance 15 (outside 14 world units / 1.0 scale)
  const resOutside = getSnappedPoint({
    point: { x: 50, y: 15 },
    edges,
    settings,
    snapModes,
  });
  assert.equal(resOutside.snap, null);
  assert.equal(resOutside.point.y, 15);
});

test('getSnappedPoint safely handles missing, non-finite, and zero scale fallbacks', () => {
  const settings = createGridSettings({
    magneticThreshold: 14,
    edgeThreshold: 14,
  });
  const snapModes = new SnapModeState({
    [SNAP_MODES.GRID]: false,
    [SNAP_MODES.EDGE]: true,
    [SNAP_MODES.MIDPOINT]: false,
    [SNAP_MODES.PERPENDICULAR]: false,
    [SNAP_MODES.ANGLE]: false,
  });
  const edges = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, index: 0 }];

  // null scale falls back to 1.0
  const resNull = getSnappedPoint({
    point: { x: 50, y: 10 },
    edges,
    settings,
    snapModes,
    scale: null,
  });
  assert.ok(resNull.snap);
  assert.equal(resNull.point.y, 0);

  // NaN scale falls back to 1.0
  const resNaN = getSnappedPoint({
    point: { x: 50, y: 10 },
    edges,
    settings,
    snapModes,
    scale: Number.NaN,
  });
  assert.ok(resNaN.snap);
  assert.equal(resNaN.point.y, 0);

  // zero scale clamps to 0.0001 without dividing by zero or throwing
  const resZero = getSnappedPoint({
    point: { x: 50, y: 10 },
    edges,
    settings,
    snapModes,
    scale: 0,
  });
  assert.ok(resZero.snap);
  assert.equal(resZero.point.y, 0);

  // negative scale clamps to 0.0001
  const resNeg = getSnappedPoint({
    point: { x: 50, y: 10 },
    edges,
    settings,
    snapModes,
    scale: -2,
  });
  assert.ok(resNeg.snap);
  assert.equal(resNeg.point.y, 0);
});

test('Edge snapping maintains constant 14-pixel screen radius at scale 0.1, 1.0, and 2.0', () => {
  const baseThreshold = 14;
  const settings = createGridSettings({
    magneticThreshold: baseThreshold,
    edgeThreshold: baseThreshold,
  });
  const snapModes = new SnapModeState({
    [SNAP_MODES.GRID]: false,
    [SNAP_MODES.EDGE]: true,
    [SNAP_MODES.MIDPOINT]: false,
    [SNAP_MODES.PERPENDICULAR]: false,
    [SNAP_MODES.ANGLE]: false,
  });
  const edges = [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, index: 0 }];

  // Scale 0.1: normalized threshold = 14 / 0.1 = 140 world units
  // 10 screen pixels away = 10 / 0.1 = 100 world units (should snap)
  const res01Inside = getSnappedPoint({
    point: { x: 200, y: 100 },
    edges,
    settings,
    snapModes,
    scale: 0.1,
  });
  assert.ok(res01Inside.snap, 'Should snap within 14-pixel screen radius at scale 0.1');
  assert.equal(res01Inside.snap.type, 'edge');
  assert.equal(res01Inside.point.y, 0);

  // 15 screen pixels away = 15 / 0.1 = 150 world units (should NOT snap)
  const res01Outside = getSnappedPoint({
    point: { x: 200, y: 150 },
    edges,
    settings,
    snapModes,
    scale: 0.1,
  });
  assert.equal(
    res01Outside.snap,
    null,
    'Should not snap beyond 14-pixel screen radius at scale 0.1'
  );

  // Scale 1.0: normalized threshold = 14 / 1.0 = 14 world units
  // 10 screen pixels away = 10 world units (should snap)
  const res1Inside = getSnappedPoint({
    point: { x: 200, y: 10 },
    edges,
    settings,
    snapModes,
    scale: 1.0,
  });
  assert.ok(res1Inside.snap, 'Should snap within 14-pixel screen radius at scale 1.0');
  assert.equal(res1Inside.snap.type, 'edge');
  assert.equal(res1Inside.point.y, 0);

  // 15 screen pixels away = 15 world units (should NOT snap)
  const res1Outside = getSnappedPoint({
    point: { x: 200, y: 15 },
    edges,
    settings,
    snapModes,
    scale: 1.0,
  });
  assert.equal(
    res1Outside.snap,
    null,
    'Should not snap beyond 14-pixel screen radius at scale 1.0'
  );

  // Scale 2.0: normalized threshold = 14 / 2.0 = 7 world units
  // 10 screen pixels away = 10 / 2.0 = 5 world units (should snap)
  const res2Inside = getSnappedPoint({
    point: { x: 200, y: 5 },
    edges,
    settings,
    snapModes,
    scale: 2.0,
  });
  assert.ok(res2Inside.snap, 'Should snap within 14-pixel screen radius at scale 2.0');
  assert.equal(res2Inside.snap.type, 'edge');
  assert.equal(res2Inside.point.y, 0);

  // 16 screen pixels away = 16 / 2.0 = 8 world units (should NOT snap)
  const res2Outside = getSnappedPoint({
    point: { x: 200, y: 8 },
    edges,
    settings,
    snapModes,
    scale: 2.0,
  });
  assert.equal(
    res2Outside.snap,
    null,
    'Should not snap beyond 14-pixel screen radius at scale 2.0'
  );
});

test('Midpoint snapping maintains constant screen radius across scale 0.1, 1.0, and 2.0', () => {
  const baseThreshold = 14;
  const settings = createGridSettings({
    magneticThreshold: baseThreshold,
    midpointThreshold: baseThreshold,
  });
  const snapModes = new SnapModeState({
    [SNAP_MODES.GRID]: false,
    [SNAP_MODES.EDGE]: false,
    [SNAP_MODES.MIDPOINT]: true,
    [SNAP_MODES.PERPENDICULAR]: false,
    [SNAP_MODES.ANGLE]: false,
  });
  // Midpoint is at (100, 0)
  const edges = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, index: 0 }];

  // Scale 0.1: threshold = 140 world units
  const res01 = getSnappedPoint({
    point: { x: 160, y: 0 }, // 60 world units away = 6 screen pixels <= 14 px
    edges,
    settings,
    snapModes,
    scale: 0.1,
  });
  assert.ok(res01.snap);
  assert.equal(res01.snap.type, 'midpoint');
  assert.equal(res01.point.x, 100);
  assert.equal(res01.point.y, 0);

  // Scale 1.0: threshold = 14 world units
  const res1 = getSnappedPoint({
    point: { x: 108, y: 0 }, // 8 world units away = 8 screen pixels <= 14 px
    edges,
    settings,
    snapModes,
    scale: 1.0,
  });
  assert.ok(res1.snap);
  assert.equal(res1.snap.type, 'midpoint');
  assert.equal(res1.point.x, 100);
  assert.equal(res1.point.y, 0);

  // Scale 2.0: threshold = 7 world units
  const res2 = getSnappedPoint({
    point: { x: 104, y: 0 }, // 4 world units away = 8 screen pixels <= 14 px
    edges,
    settings,
    snapModes,
    scale: 2.0,
  });
  assert.ok(res2.snap);
  assert.equal(res2.snap.type, 'midpoint');
  assert.equal(res2.point.x, 100);
  assert.equal(res2.point.y, 0);
});

test('Perpendicular snapping normalizes threshold by scale across 0.1, 1.0, and 2.0', () => {
  const baseThreshold = 14;
  const settings = createGridSettings({
    magneticThreshold: baseThreshold,
    perpendicularThreshold: baseThreshold,
  });
  const snapModes = new SnapModeState({
    [SNAP_MODES.GRID]: false,
    [SNAP_MODES.EDGE]: false,
    [SNAP_MODES.MIDPOINT]: false,
    [SNAP_MODES.PERPENDICULAR]: true,
    [SNAP_MODES.ANGLE]: false,
  });
  const edges = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, index: 0 }];
  const anchor = { x: 50, y: 50 };
  // Perpendicular from anchor (50, 50) to edge is line x = 50.

  // At scale 0.1, threshold = 140 world units. Query at x = 120 (distance 70 <= 140)
  const res01 = getSnappedPoint({
    point: { x: 120, y: 20 },
    anchor,
    edges,
    settings,
    snapModes,
    scale: 0.1,
  });
  assert.ok(res01.snap);
  assert.equal(res01.snap.type, 'perpendicular');
  assert.equal(res01.point.x, 50);

  // At scale 1.0, query at x = 58 (distance 8 <= 14)
  const res1 = getSnappedPoint({
    point: { x: 58, y: 20 },
    anchor,
    edges,
    settings,
    snapModes,
    scale: 1.0,
  });
  assert.ok(res1.snap);
  assert.equal(res1.snap.type, 'perpendicular');
  assert.equal(res1.point.x, 50);

  // At scale 2.0, threshold = 7 world units. Query at x = 54 (distance 4 <= 7)
  const res2 = getSnappedPoint({
    point: { x: 54, y: 20 },
    anchor,
    edges,
    settings,
    snapModes,
    scale: 2.0,
  });
  assert.ok(res2.snap);
  assert.equal(res2.snap.type, 'perpendicular');
  assert.equal(res2.point.x, 50);
});

test('Angle snapping normalizes magneticThreshold by scale across 0.1, 1.0, and 2.0', () => {
  const baseThreshold = 14;
  const settings = createGridSettings({
    angleSnapDegrees: 45,
    magneticThreshold: baseThreshold,
  });
  const snapModes = new SnapModeState({
    [SNAP_MODES.GRID]: false,
    [SNAP_MODES.EDGE]: false,
    [SNAP_MODES.MIDPOINT]: false,
    [SNAP_MODES.PERPENDICULAR]: false,
    [SNAP_MODES.ANGLE]: true,
  });
  const anchor = { x: 0, y: 0 };

  // 45 degrees vector with length 200: (141.42, 141.42)
  // At scale 0.1: threshold = 140. Slightly offset point (141.42, 180): distance ~38.58 <= 140
  const res01 = getSnappedPoint({
    point: { x: 141.42, y: 180 },
    anchor,
    edges: [],
    settings,
    snapModes,
    scale: 0.1,
  });
  assert.ok(res01.snap);
  assert.equal(res01.snap.type, 'angle');

  // At scale 1.0: offset point with distance 20 > 14 fails
  const res1Outside = getSnappedPoint({
    point: { x: 141.42, y: 161.42 },
    anchor,
    edges: [],
    settings,
    snapModes,
    scale: 1.0,
  });
  assert.equal(res1Outside.snap, null);

  // At scale 1.0: offset point with distance 6 <= 14 snaps
  const res1Inside = getSnappedPoint({
    point: { x: 141.42, y: 147.42 },
    anchor,
    edges: [],
    settings,
    snapModes,
    scale: 1.0,
  });
  assert.ok(res1Inside.snap);
  assert.equal(res1Inside.snap.type, 'angle');
});
