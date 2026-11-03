import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionLayer, SNAP_MODES } from '../../designer3d/tools/index.mjs';
import { SnappingBridge } from '../js/snapping-bridge.js';
import { drawSnapGuides } from '../js/render.js';
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

  const view = { scale: 1 };

  // 1. Null snap with indicator
  const nullSnapWithIndicator = {
    snap: null,
    indicator: { x: 50, y: 60 },
    guideLines: [],
  };
  drawSnapGuides(ctx, nullSnapWithIndicator, view);
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
  drawSnapGuides(ctx, nullSnapWithGuides, view);
  assert.ok(calls.includes('moveTo(0,0)'));
  assert.ok(calls.includes('lineTo(100,0)'));

  // 3. Grid snap renders indicator with --ktheme-success
  calls.length = 0;
  const gridSnap = {
    snap: { type: 'grid', point: { x: 24, y: 48 } },
    indicator: { x: 24, y: 48 },
    guideLines: [],
  };
  drawSnapGuides(ctx, gridSnap, view);
  assert.equal(ctx.strokeStyle, getToken('--ktheme-success', '#10b981'));
  assert.equal(ctx.fillStyle, getToken('--ktheme-success', '#10b981'));

  // 4. Midpoint snap renders indicator with --ktheme-info
  calls.length = 0;
  const midpointSnap = {
    snap: { type: 'midpoint', point: { x: 60, y: 0 } },
    indicator: { x: 60, y: 0 },
    guideLines: [],
  };
  drawSnapGuides(ctx, midpointSnap, view);
  assert.equal(ctx.strokeStyle, getToken('--ktheme-info', '#a855f7'));
  assert.equal(ctx.fillStyle, getToken('--ktheme-info', '#a855f7'));

  // 5. Perpendicular snap renders indicator with --ktheme-warning
  calls.length = 0;
  const perpSnap = {
    snap: { type: 'perpendicular', point: { x: 50, y: 50 } },
    indicator: { x: 50, y: 50 },
    guideLines: [],
  };
  drawSnapGuides(ctx, perpSnap, view);
  assert.equal(ctx.strokeStyle, getToken('--ktheme-warning', '#f59e0b'));
  assert.equal(ctx.fillStyle, getToken('--ktheme-warning', '#f59e0b'));
});
