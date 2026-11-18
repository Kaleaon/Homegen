import test from 'node:test';
import assert from 'node:assert/strict';
import { drawGrid, draw, drawSpatialReferenceOverlay } from '../js/render.js';
import { quantize } from '../../designer3d/tools/gridSettings.mjs';

function createMockCtx(width = 800, height = 600) {
  const calls = [];
  let currentStrokeStyle = null;
  return {
    canvas: { width, height },
    set strokeStyle(val) {
      currentStrokeStyle = val;
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    lineWidth: 1,
    fillStyle: '',
    setTransform() {},
    save() {},
    restore() {},
    fillRect() {},
    beginPath() {
      calls.push({ type: 'beginPath' });
    },
    moveTo(x, y) {
      calls.push({ type: 'moveTo', x, y, strokeStyle: currentStrokeStyle });
    },
    lineTo(x, y) {
      calls.push({ type: 'lineTo', x, y, strokeStyle: currentStrokeStyle });
    },
    stroke() {
      calls.push({ type: 'stroke', strokeStyle: currentStrokeStyle });
    },
    calls,
  };
}

test('drawGrid defaults to 6-inch sub-grid and renders 3-tier colors', () => {
  const ctx = createMockCtx(120, 120);
  const view = { ox: 0, oy: 0, scale: 1 };
  drawGrid(ctx, view, 120, 120);

  const subGridMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.strokeStyle === '#f0ede6');
  const minorGridMoves = ctx.calls.filter(
    (c) => c.type === 'moveTo' && c.strokeStyle === '#ebe7de'
  );
  const majorGridMoves = ctx.calls.filter(
    (c) => c.type === 'moveTo' && c.strokeStyle === '#dcd6c8'
  );

  // Verify sub-grid lines (#f0ede6) exist and are spaced by default unitSize = 6
  assert.ok(subGridMoves.length > 0);
  const subGridX = [...new Set(subGridMoves.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(subGridX[1] - subGridX[0], 6);

  // Verify minor grid lines (#ebe7de) are spaced by 12
  assert.ok(minorGridMoves.length > 0);
  const minorGridX = [...new Set(minorGridMoves.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(minorGridX[1] - minorGridX[0], 12);

  // Verify major grid lines (#dcd6c8) are spaced by 60
  assert.ok(majorGridMoves.length > 0);
  const majorGridX = [...new Set(majorGridMoves.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(majorGridX[1] - majorGridX[0], 60);
});

test('drawGrid extracts unitSize from gridSettings or unitSize option', () => {
  const ctx = createMockCtx(120, 120);
  const view = { ox: 0, oy: 0, scale: 1 };

  // Pass gridSettings with unitSize = 8 (8 * 1 = 8 >= 6)
  drawGrid(ctx, view, 120, 120, { gridSettings: { unitSize: 8 } });

  const subGridMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.strokeStyle === '#f0ede6');
  assert.ok(subGridMoves.length > 0);
  const subGridX = [...new Set(subGridMoves.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(subGridX[1] - subGridX[0], 8);
});

test('drawGrid suppresses fine sub-grid lines when zoom-out scale culling is triggered', () => {
  const ctx = createMockCtx(120, 120);
  // view.scale = 0.5 -> subGrid (6 * 0.5 = 3 < 6) should be culled
  // minorGrid (12 * 0.5 = 6 >= 6) should NOT be culled
  // majorGrid (60 * 0.5 = 30 >= 6) should NOT be culled
  const view = { ox: 0, oy: 0, scale: 0.5 };
  drawGrid(ctx, view, 120, 120, { gridSettings: { unitSize: 6 } });

  const subGridMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.strokeStyle === '#f0ede6');
  const minorGridMoves = ctx.calls.filter(
    (c) => c.type === 'moveTo' && c.strokeStyle === '#ebe7de'
  );
  const majorGridMoves = ctx.calls.filter(
    (c) => c.type === 'moveTo' && c.strokeStyle === '#dcd6c8'
  );

  assert.equal(subGridMoves.length, 0, 'sub-grid lines should be culled when step * scale < 6');
  assert.ok(minorGridMoves.length > 0, 'minor grid lines should be preserved');
  assert.ok(majorGridMoves.length > 0, 'major grid lines should be preserved');
});

test('draw pipeline propagates gridSettings to drawGrid', () => {
  const ctx = createMockCtx(120, 120);
  const view = { ox: 0, oy: 0, scale: 1 };
  const state = { rooms: [] };

  draw(ctx, state, view, { gridSettings: { unitSize: 8 } });

  const subGridMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.strokeStyle === '#f0ede6');
  assert.ok(subGridMoves.length > 0);
  const subGridX = [...new Set(subGridMoves.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(subGridX[1] - subGridX[0], 8);
});

test('drawGrid deduplicates step tiers and avoids redundant stroke operations', () => {
  const ctx = createMockCtx(120, 120);
  const view = { ox: 0, oy: 0, scale: 1 };

  // Default configuration: subGrid (6), minorGrid (12), majorGrid (60), theme 12, theme 60.
  // Deduplicated should result in exactly 3 stroke operations for 6, 12, and 60.
  drawGrid(ctx, view, 120, 120);

  const strokes = ctx.calls.filter((c) => c.type === 'stroke');
  assert.equal(
    strokes.length,
    3,
    'Default grid rendering should execute exactly 3 stroke operations'
  );

  // Overlapping custom configuration where unitSize matches minorGrid
  const ctx2 = createMockCtx(120, 120);
  drawGrid(ctx2, view, 120, 120, {
    gridSettings: { unitSize: 12, minorGrid: 12, majorGrid: 60 },
  });
  const strokes2 = ctx2.calls.filter((c) => c.type === 'stroke');
  assert.equal(
    strokes2.length,
    2,
    'Overlapping tiers should deduplicate down to 2 stroke operations'
  );
});

test('drawGrid coordinates maintain exact mathematical alignment with quantize() under extreme pan and zoom', () => {
  const ctx = createMockCtx(500, 400);
  // Non-integer extreme pan and scale
  const view = { ox: -7391.43, oy: 12485.67, scale: 2.375 };
  const step = 6;
  const x0 = -view.ox / view.scale;
  const y0 = -view.oy / view.scale;

  drawGrid(ctx, view, 500, 400, { gridSettings: { unitSize: step } });

  const subGridMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.strokeStyle === '#f0ede6');
  assert.ok(subGridMoves.length > 0, 'Sub-grid lines should be rendered');

  for (const call of subGridMoves) {
    const isVertical = Math.abs(call.y - y0) < 1e-9;
    const isHorizontal = Math.abs(call.x - x0) < 1e-9;
    assert.ok(isVertical || isHorizontal, 'MoveTo should start at viewport boundary');

    const coord = isVertical ? call.x : call.y;
    const expected = quantize(coord, step);
    assert.ok(
      Math.abs(coord - expected) < 1e-9,
      `Rendered coordinate ${coord} must match quantize output ${expected}`
    );

    // Verify it is an integer multiple of step (no fractional drift)
    const index = Math.round(coord / step);
    assert.ok(
      Math.abs(index * step - coord) < 1e-9,
      `Rendered coordinate ${coord} must equal i * step (${index} * ${step})`
    );
  }
});

function createSpatialOverlayMockCtx(width = 800, height = 600) {
  const calls = [];
  const textCalls = [];
  const rectCalls = [];
  const transforms = [];
  let currentStrokeStyle = null;
  let currentFillStyle = '';
  let currentTransform = [1, 0, 0, 1, 0, 0];
  const stateStack = [];

  return {
    canvas: { width, height },
    set strokeStyle(val) {
      currentStrokeStyle = val;
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set fillStyle(val) {
      currentFillStyle = val;
    },
    get fillStyle() {
      return currentFillStyle;
    },
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    setTransform(a, b, c, d, e, f) {
      currentTransform = [a, b, c, d, e, f];
      transforms.push([...currentTransform]);
    },
    save() {
      stateStack.push({
        strokeStyle: currentStrokeStyle,
        fillStyle: currentFillStyle,
        transform: [...currentTransform],
      });
    },
    restore() {
      const prev = stateStack.pop();
      if (prev) {
        currentStrokeStyle = prev.strokeStyle;
        currentFillStyle = prev.fillStyle;
        currentTransform = prev.transform;
      }
    },
    setLineDash() {},
    translate() {},
    rotate() {},
    fillRect(x, y, w, h) {
      rectCalls.push({ type: 'fillRect', x, y, w, h, fillStyle: currentFillStyle });
    },
    strokeRect(x, y, w, h) {
      rectCalls.push({ type: 'strokeRect', x, y, w, h, strokeStyle: currentStrokeStyle });
    },
    roundRect(x, y, w, h, r) {
      rectCalls.push({ type: 'roundRect', x, y, w, h, r, fillStyle: currentFillStyle });
    },
    beginPath() {
      calls.push({ type: 'beginPath' });
    },
    closePath() {
      calls.push({ type: 'closePath' });
    },
    moveTo(x, y) {
      calls.push({ type: 'moveTo', x, y, strokeStyle: currentStrokeStyle });
    },
    lineTo(x, y) {
      calls.push({ type: 'lineTo', x, y, strokeStyle: currentStrokeStyle });
    },
    arc(x, y, r, s, e) {
      calls.push({ type: 'arc', x, y, r, s, e, strokeStyle: currentStrokeStyle });
    },
    fill() {
      calls.push({ type: 'fill', fillStyle: currentFillStyle });
    },
    stroke() {
      calls.push({ type: 'stroke', strokeStyle: currentStrokeStyle });
    },
    measureText(txt) {
      return { width: String(txt).length * 6.5 };
    },
    fillText(txt, x, y) {
      textCalls.push({ txt: String(txt), x, y, fillStyle: currentFillStyle });
    },
    createPattern() {
      return {};
    },
    get currentTransform() {
      return currentTransform;
    },
    calls,
    textCalls,
    rectCalls,
    transforms,
  };
}

test('drawSpatialReferenceOverlay renders origin crosshairs, projected margin ticks, and active CRS badge', () => {
  const ctx = createSpatialOverlayMockCtx(800, 600);
  const view = { ox: 200, oy: 150, scale: 1.5 };
  const state = {
    rooms: [],
    crs: {
      epsg: 'EPSG:2227',
      origin: { longitude: -122.4194, latitude: 37.7749 },
    },
  };

  drawSpatialReferenceOverlay(ctx, state, view);

  // 1. Origin (0,0) crosshair at (ox, oy) = (200, 150)
  const horizOriginMove = ctx.calls.find((c) => c.type === 'moveTo' && c.x === 190 && c.y === 150);
  const vertOriginMove = ctx.calls.find((c) => c.type === 'moveTo' && c.x === 200 && c.y === 140);
  assert.ok(horizOriginMove, 'Should draw horizontal origin crosshair arm at (0,0)');
  assert.ok(vertOriginMove, 'Should draw vertical origin crosshair arm at (0,0)');

  // 2. Screen-space margin tick marks along top (y=0) and left (x=0)
  const topTicks = ctx.calls.filter((c) => c.type === 'moveTo' && c.y === 0 && c.x >= 0);
  const leftTicks = ctx.calls.filter((c) => c.type === 'moveTo' && c.x === 0 && c.y >= 0);
  assert.ok(topTicks.length > 0, 'Should render projected coordinate tick marks on top margin');
  assert.ok(leftTicks.length > 0, 'Should render projected coordinate tick marks on left margin');

  // 3. Projected coordinate tick labels and active CRS badge
  const badgeCall = ctx.textCalls.find((t) => t.txt.includes('CRS: EPSG:2227'));
  assert.ok(badgeCall, 'Should render active CRS badge containing EPSG:2227');
  assert.ok(badgeCall.txt.includes('Origin'), 'CRS badge should display formatted origin');
  assert.ok(ctx.textCalls.length > 1, 'Should render projected coordinate tick labels');
  assert.ok(ctx.rectCalls.length > 0, 'Should render rounded CRS badge background container');
});

test('drawSpatialReferenceOverlay omits projected ticks for non-georeferenced PLAN mode while preserving origin crosshairs', () => {
  const ctx = createSpatialOverlayMockCtx(800, 600);
  const view = { ox: 180, oy: 160, scale: 1 };
  const state = {
    rooms: [],
    crs: { epsg: 'PLAN' },
  };

  drawSpatialReferenceOverlay(ctx, state, view);

  // Origin crosshair at (180, 160) should be preserved
  const horizOriginMove = ctx.calls.find((c) => c.type === 'moveTo' && c.x === 170 && c.y === 160);
  assert.ok(horizOriginMove, 'Origin crosshair must still render in PLAN mode');

  // Projected margin ticks should be omitted
  const topTicks = ctx.calls.filter((c) => c.type === 'moveTo' && c.y === 0);
  const leftTicks = ctx.calls.filter((c) => c.type === 'moveTo' && c.x === 0);
  assert.equal(topTicks.length, 0, 'Top margin projected ticks must be omitted in PLAN mode');
  assert.equal(leftTicks.length, 0, 'Left margin projected ticks must be omitted in PLAN mode');

  // Badge indicates local PLAN mode and no tick labels are emitted
  assert.equal(ctx.textCalls.length, 1, 'Only the badge label should be drawn in PLAN mode');
  assert.ok(ctx.textCalls[0].txt.includes('CRS: PLAN'), 'Badge should indicate PLAN mode');
});

test('drawSpatialReferenceOverlay defaults invalid or missing CRS definitions safely to EPSG:4326', () => {
  for (const badCrs of [null, undefined, {}, { epsg: 'INVALID_CRS' }, 'EPSG:99999']) {
    const ctx = createSpatialOverlayMockCtx(600, 400);
    const view = { ox: 100, oy: 100, scale: 1 };

    assert.doesNotThrow(() => {
      drawSpatialReferenceOverlay(ctx, { rooms: [], crs: badCrs }, view);
    });

    const badgeCall = ctx.textCalls.find((t) => t.txt.includes('CRS: EPSG:4326'));
    assert.ok(
      badgeCall,
      `Invalid/missing CRS (${JSON.stringify(badCrs)}) must default to EPSG:4326`
    );
  }
});

test('draw integrates drawSpatialReferenceOverlay when state.crs or opts.showSpatialOverlay is active without distorting plan layers', () => {
  // Minimal mock context (without fillText/roundRect) must also succeed without errors
  const minimalCtx = createMockCtx(240, 240);
  assert.doesNotThrow(() => {
    draw(minimalCtx, { rooms: [] }, { ox: 60, oy: 60, scale: 1 }, { showSpatialOverlay: true });
  });

  // Full mock context with room geometry + active CRS
  const ctx = createSpatialOverlayMockCtx(800, 600);
  const view = { ox: 120, oy: 120, scale: 1 };
  const state = {
    rooms: [
      {
        id: 'r1',
        type: 'living',
        name: 'Living Room',
        x: 0,
        y: 0,
        w: 144,
        h: 120,
        ceiling: 96,
        floor: null,
        walls: { N: 'none', E: 'none', S: 'none', W: 'none' },
        openings: [],
        items: [],
      },
    ],
    crs: {
      epsg: 'EPSG:3857',
      origin: { longitude: -122.4194, latitude: 37.7749 },
    },
  };

  draw(ctx, state, view, { gridSettings: { unitSize: 6 } });

  // Verify standard architectural grid tiers remain intact and undistorted
  const subGridMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.strokeStyle === '#f0ede6');
  assert.ok(subGridMoves.length > 0, 'Architectural sub-grid must still render');
  const subGridX = [...new Set(subGridMoves.map((m) => m.x))].sort((a, b) => a - b);
  assert.equal(subGridX[1] - subGridX[0], 6, 'Sub-grid spacing must remain 6 inches');

  // Verify room label and active CRS spatial overlay both rendered cleanly
  assert.ok(
    ctx.textCalls.some((t) => t.txt === 'Living Room'),
    'Room label must render without disruption'
  );
  assert.ok(
    ctx.textCalls.some((t) => t.txt.includes('CRS: EPSG:3857')),
    'Spatial reference overlay CRS badge must render during draw()'
  );
  assert.deepEqual(
    ctx.currentTransform,
    [1, 0, 0, 1, 0, 0],
    'Canvas transform must reset cleanly to identity at end of draw()'
  );
});
