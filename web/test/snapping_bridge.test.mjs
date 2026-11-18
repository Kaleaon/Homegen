import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionLayer, SNAP_MODES } from '../../designer3d/tools/index.mjs';
import { SnappingBridge } from '../js/snapping-bridge.js';
import { draw } from '../js/render.js';
import { getToken } from '../js/kthemeTokens.js';

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

test('buildToggleViewModel includes token declarations for UI snap toggles', async () => {
  const { buildToggleViewModel } = await import('../../designer3d/tools/index.mjs');
  const interaction = new InteractionLayer();
  const vms = buildToggleViewModel(interaction);

  assert.equal(vms.length, 4);
  for (const vm of vms) {
    assert.equal(vm.token, '--ktheme-accent');
    assert.equal(vm.tokenHover, '--ktheme-accent-hover');
  }
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

test('SnappingBridge computeSnap returns grid-aligned coordinates whenever no magnetic target exists', () => {
  // Test with default unitSize (6) and magnetic snap enabled but no edge nearby
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 14, edgeThreshold: 14, midpointThreshold: 14 },
    snapModes: { grid: false, edge: true, midpoint: true, perpendicular: false },
  });

  const rooms = [{ id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 0 }];
  const bridge = new SnappingBridge({ interaction, getRooms: () => rooms });

  // Point far away from any edge or midpoint: (400.2, 500.8)
  // Grid unitSize is 6: 400.2 / 6 = 66.7 -> 67 * 6 = 402; 500.8 / 6 = 83.46 -> 83 * 6 = 498
  const snapRes = bridge.computeSnap({ x: 400.2, y: 500.8 });

  assert.ok(snapRes);
  assert.deepEqual(snapRes.point, { x: 402, y: 498 });
  assert.deepEqual(snapRes.snap, { type: 'grid', point: { x: 402, y: 498 } });
  assert.deepEqual(snapRes.indicator, { x: 402, y: 498 });

  const active = bridge.getActiveSnap();
  assert.ok(active);
  assert.deepEqual(active.point, { x: 402, y: 498 });
  assert.deepEqual(active.snap, { type: 'grid', point: { x: 402, y: 498 } });
  assert.deepEqual(active.indicator, { x: 402, y: 498 });

  // Test configured unitSize (12)
  const interaction12 = new InteractionLayer({
    gridSettings: { unitSize: 12, magneticThreshold: 14 },
    snapModes: { grid: false, edge: false, midpoint: false },
  });
  const bridge12 = new SnappingBridge({ interaction: interaction12, getRooms: () => [] });
  const snapRes12 = bridge12.computeSnap({ x: 14.1, y: 25.9 });
  // 14.1 / 12 = 1.175 -> 12; 25.9 / 12 = 2.158 -> 24
  assert.deepEqual(snapRes12.point, { x: 12, y: 24 });
  assert.deepEqual(snapRes12.snap, { type: 'grid', point: { x: 12, y: 24 } });
  assert.deepEqual(snapRes12.indicator, { x: 12, y: 24 });
});

test('SnappingBridge computeMultiSnap calculates group anchor snapping during multi-item dragging', () => {
  const interaction = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 14 },
    snapModes: { grid: true, edge: false, midpoint: false },
  });

  const bridge = new SnappingBridge({ interaction, getRooms: () => [] });

  const point = { x: 23.9, y: 41.8 };
  const anchor = { x: 10, y: 20 };
  const itemsInitial = new Map([
    ['item1', { cx: 50, cy: 60 }],
    ['item2', { cx: 80, cy: 90 }],
  ]);

  const multiRes = bridge.computeMultiSnap(point, anchor, itemsInitial);

  assert.ok(multiRes);
  // Grid snapped: 23.9 -> 24, 41.8 -> 42
  assert.deepEqual(multiRes.point, { x: 24, y: 42 });
  assert.deepEqual(multiRes.anchor, { x: 10, y: 20 });
  // delta: dx = 24 - 10 = 14, dy = 42 - 20 = 22
  assert.deepEqual(multiRes.delta, { x: 14, y: 22, dx: 14, dy: 22 });
  assert.equal(multiRes.dx, 14);
  assert.equal(multiRes.dy, 22);
  assert.deepEqual(multiRes.indicator, { x: 24, y: 42 });
  assert.equal(multiRes.items, itemsInitial);
});

test('drawSnapGuides does not abort when snapResult.snap is null and renders semantic tokens', () => {
  const calls = [];
  const ctx = {
    canvas: { width: 0, height: 0 },
    setTransform() {},
    fillRect() {},
    save() {
      calls.push('save');
    },
    restore() {
      calls.push('restore');
    },
    beginPath() {
      calls.push('beginPath');
    },
    moveTo(x, y) {
      calls.push(`moveTo(${x},${y})`);
    },
    lineTo(x, y) {
      calls.push(`lineTo(${x},${y})`);
    },
    arc(x, y, r) {
      calls.push(`arc(${x},${y},${r})`);
    },
    stroke() {
      calls.push('stroke');
    },
    fill() {
      calls.push('fill');
    },
    setLineDash(d) {
      calls.push(`setLineDash(${JSON.stringify(d)})`);
    },
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
  };

  const state = { rooms: [] };
  const view = { scale: 1, ox: 0, oy: 0 };

  // 1. Null snap with indicator
  const nullSnapWithIndicator = {
    snap: null,
    indicator: { x: 50, y: 60 },
    guideLines: [],
  };
  draw(ctx, state, view, { snapResult: nullSnapWithIndicator });
  assert.ok(calls.includes('beginPath'));
  assert.ok(calls.includes('arc(50,60,8)'));
  assert.ok(calls.includes('arc(50,60,3.5)'));

  // 2. Null snap with guideLines
  calls.length = 0;
  const nullSnapWithGuides = {
    snap: null,
    indicator: null,
    guideLines: [{ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, type: 'angle' }],
  };
  draw(ctx, state, view, { snapResult: nullSnapWithGuides });
  assert.ok(calls.includes('moveTo(0,0)'));
  assert.ok(calls.includes('lineTo(100,0)'));

  // 3. Grid snap renders indicator with --ktheme-success
  calls.length = 0;
  const gridSnap = {
    snap: { type: 'grid', point: { x: 24, y: 48 } },
    indicator: { x: 24, y: 48 },
    guideLines: [],
  };
  draw(ctx, state, view, { snapResult: gridSnap });
  assert.equal(ctx.strokeStyle, getToken('--ktheme-success', '#10b981'));
  assert.equal(ctx.fillStyle, getToken('--ktheme-success', '#10b981'));

  // 4. Midpoint snap renders indicator with --ktheme-info
  calls.length = 0;
  const midpointSnap = {
    snap: { type: 'midpoint', point: { x: 60, y: 0 } },
    indicator: { x: 60, y: 0 },
    guideLines: [],
  };
  draw(ctx, state, view, { snapResult: midpointSnap });
  assert.equal(ctx.strokeStyle, getToken('--ktheme-info', '#a855f7'));
  assert.equal(ctx.fillStyle, getToken('--ktheme-info', '#a855f7'));

  // 5. Perpendicular snap renders indicator with --ktheme-warning
  calls.length = 0;
  const perpSnap = {
    snap: { type: 'perpendicular', point: { x: 50, y: 50 } },
    indicator: { x: 50, y: 50 },
    guideLines: [],
  };
  draw(ctx, state, view, { snapResult: perpSnap });
  assert.equal(ctx.strokeStyle, getToken('--ktheme-warning', '#f59e0b'));
  assert.equal(ctx.fillStyle, getToken('--ktheme-warning', '#f59e0b'));
});

test('Bidirectional conversions between arc radius, sagitta, and bulge factor', async () => {
  const { sagittaFromBulge, bulgeFromSagitta, radiusFromBulge, bulgeFromRadius, getArcParameters } =
    await import('../js/geometry.js');

  const chordLen = 120;

  // Semicircle: bulge = 1 => sagitta = 60, radius = 60
  assert.ok(Math.abs(sagittaFromBulge(chordLen, 1) - 60) < 1e-9);
  assert.ok(Math.abs(bulgeFromSagitta(chordLen, 60) - 1) < 1e-9);
  assert.ok(Math.abs(radiusFromBulge(chordLen, 1) - 60) < 1e-9);
  const semiRes = bulgeFromRadius(chordLen, 60);
  assert.equal(semiRes.ok, true);
  assert.ok(Math.abs(semiRes.bulge - 1) < 1e-9);

  // Quarter-arc / shallow curve: bulge = 0.5 => sagitta = 30, radius = 75
  const b = 0.5;
  const s = sagittaFromBulge(chordLen, b);
  const r = radiusFromBulge(chordLen, b);
  assert.ok(Math.abs(s - 30) < 1e-9);
  assert.ok(Math.abs(r - 75) < 1e-9);

  const fromSagitta = bulgeFromSagitta(chordLen, s);
  assert.ok(Math.abs(fromSagitta - b) < 1e-9);

  const fromRadius = bulgeFromRadius(chordLen, r);
  assert.equal(fromRadius.ok, true);
  assert.equal(fromRadius.isLinear, false);
  assert.ok(Math.abs(fromRadius.bulge - b) < 1e-9);
  assert.ok(Math.abs(fromRadius.sagitta - s) < 1e-9);

  // Verify consistency with getArcParameters
  const arc = getArcParameters({ x: 0, y: 0 }, { x: chordLen, y: 0 }, fromRadius.bulge);
  assert.ok(Math.abs(arc.radius - r) < 1e-9);
  assert.ok(Math.abs(arc.sagitta - s) < 1e-9);
});

test('Curve conversion edge cases: infinite radius linear fallback, negative concavity inversion, and L > 2R error feedback', async () => {
  const {
    sagittaFromBulge,
    bulgeFromSagitta,
    radiusFromBulge,
    bulgeFromRadius,
    parseCurveHudInput,
    pointOnArc,
  } = await import('../js/geometry.js');

  const chordLen = 100;

  // 1. Zero-bulge linear wall fallback when radius approaches infinity
  assert.equal(radiusFromBulge(chordLen, 0), Infinity);
  assert.equal(sagittaFromBulge(chordLen, 0), 0);

  for (const infInput of [Infinity, -Infinity, 1e9, 1e12, 'Infinity', '∞', 'inf', '']) {
    const res = parseCurveHudInput('radius', infInput, chordLen, 0.4);
    assert.equal(res.ok, true, `Expected linear fallback ok for ${String(infInput)}`);
    assert.equal(res.isLinear, true);
    assert.equal(res.bulge, 0);
    assert.equal(res.sagitta, 0);
    assert.equal(res.radius, Infinity);
    assert.equal(res.error, null);
  }

  // 2. Invert curve concavity for negative bulge factors
  const negBulge = -0.5; // chord 100 => radius = 62.5, sagitta = -25
  const negSagitta = sagittaFromBulge(chordLen, negBulge);
  assert.ok(Math.abs(negSagitta - -25) < 1e-9);
  assert.ok(Math.abs(bulgeFromSagitta(chordLen, -25) - negBulge) < 1e-9);

  // Midpoint concavity flips across the chord for positive vs negative bulge
  const posMid = pointOnArc({ x: 0, y: 0 }, { x: chordLen, y: 0 }, 0.5, 0.5);
  const negMid = pointOnArc({ x: 0, y: 0 }, { x: chordLen, y: 0 }, -0.5, 0.5);
  assert.ok(posMid.y > 0);
  assert.ok(negMid.y < 0);
  assert.ok(Math.abs(posMid.y + negMid.y) < 1e-9);

  // Negative radius or negative currentBulge preserves inverted concavity
  const fromNegRadius = bulgeFromRadius(chordLen, -62.5);
  assert.equal(fromNegRadius.ok, true);
  assert.ok(Math.abs(fromNegRadius.bulge - -0.5) < 1e-9);

  const preservedConcavity = parseCurveHudInput('radius', '62.5', chordLen, -0.25);
  assert.equal(preservedConcavity.ok, true);
  assert.ok(Math.abs(preservedConcavity.bulge - -0.5) < 1e-9);
  assert.ok(Math.abs(preservedConcavity.sagitta - -25) < 1e-9);

  // 3. Error feedback when chord length exceeds twice the entered arc radius (L > 2R)
  const tooSmallRadius = bulgeFromRadius(chordLen, 40); // 100 > 2 * 40 = 80
  assert.equal(tooSmallRadius.ok, false);
  assert.equal(tooSmallRadius.isValid, false);
  assert.equal(tooSmallRadius.bulge, null);
  assert.match(tooSmallRadius.error, /exceeds twice/i);

  const hudTooSmall = parseCurveHudInput('radius', '49.9', chordLen, 0);
  assert.equal(hudTooSmall.ok, false);
  assert.match(hudTooSmall.error, /exceeds twice/i);

  const zeroRadius = bulgeFromRadius(chordLen, 0);
  assert.equal(zeroRadius.ok, false);
  assert.match(zeroRadius.error, /exceeds twice/i);
});

test('InteractionLayer delegates setEdgeBulge and SnappingBridge snaps accurately to curved room walls', async () => {
  const { parseCurveHudInput } = await import('../js/geometry.js');
  const M = await import('../js/model.js');

  const interaction = new InteractionLayer({
    gridSettings: {
      unitSize: 6,
      magneticThreshold: 14,
      edgeThreshold: 14,
      midpointThreshold: 14,
    },
    snapModes: { grid: false, edge: true, midpoint: true, perpendicular: false },
  });

  // Draft a 4-corner room and apply parametric radius via HUD parser -> setEdgeBulge
  interaction.addRoomCorner({ x: 0, y: 0 });
  interaction.addRoomCorner({ x: 120, y: 0 });
  interaction.addRoomCorner({ x: 120, y: 120 });
  interaction.addRoomCorner({ x: 0, y: 120 });

  const parsed = parseCurveHudInput('radius', '75', 120, 0);
  assert.equal(parsed.ok, true);
  assert.ok(Math.abs(parsed.bulge - 0.5) < 1e-9);

  interaction.setEdgeBulge(0, parsed.bulge);
  assert.ok(Math.abs(interaction.getEdgeBulge(0) - 0.5) < 1e-9);

  const closed = interaction.closeRoom({ existingRooms: [] });
  assert.equal(closed.ok, true);
  assert.ok(Math.abs(closed.room.bulges[0] - 0.5) < 1e-9);

  // Persist into plan model and verify SnappingBridge snaps to curved North wall apex (60, 30)
  const state = M.newState();
  const room = M.addRoom(state, 0, 0, 120, 120, 'living', {
    points: closed.room.corners,
    bulges: closed.room.bulges,
  });
  assert.ok(Math.abs(M.getWallBulge(room, 'N') - 0.5) < 1e-9);

  const bridge = new SnappingBridge({
    interaction,
    getRooms: () => state.rooms,
  });

  // 1. Edge snap along curved North wall (chord (0,0)->(120,0), bulge +0.5 => center (60,-45), R=75)
  const edgeSnap = bridge.computeSnap({ x: 60, y: 31.5 });
  assert.equal(edgeSnap.snap?.type, 'edge');
  assert.ok(Math.abs(edgeSnap.point.x - 60) < 1e-6);
  assert.ok(Math.abs(edgeSnap.point.y - 30) < 1e-6);

  // 2. Midpoint snap at curved North wall apex (60, 30) when midpoint mode is isolated
  interaction.toggleSnapMode(SNAP_MODES.EDGE, false);
  const midSnap = bridge.computeSnap({ x: 60.4, y: 29.6 });
  assert.equal(midSnap.snap?.type, 'midpoint');
  assert.ok(Math.abs(midSnap.point.x - 60) < 1e-6);
  assert.ok(Math.abs(midSnap.point.y - 30) < 1e-6);

  // 3. Invert concavity via model helper setWallBulge -> apex flips to (60, -30)
  M.setWallBulge(room, 'N', -0.5, state);
  const invertedSnap = bridge.computeSnap({ x: 59.7, y: -29.8 });
  assert.equal(invertedSnap.snap?.type, 'midpoint');
  assert.ok(Math.abs(invertedSnap.point.x - 60) < 1e-6);
  assert.ok(Math.abs(invertedSnap.point.y - -30) < 1e-6);
});
