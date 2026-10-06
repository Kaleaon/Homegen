import test from 'node:test';
import assert from 'node:assert/strict';
import { drawGrid, draw } from '../js/render.js';

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
