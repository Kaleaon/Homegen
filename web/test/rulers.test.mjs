import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  draw,
  drawGrid,
  drawRulers,
  RULER_SIZE,
  formatRulerCoord,
  computeRulerSteps,
} from '../js/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createRulerMockCtx(width = 800, height = 600) {
  const calls = [];
  let strokeStyle = '';
  let fillStyle = '';
  let lineDash = [];
  let transform = [1, 0, 0, 1, 0, 0];
  const stateStack = [];

  return {
    canvas: { width, height },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v) {
      strokeStyle = v;
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v) {
      fillStyle = v;
    },
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save() {
      stateStack.push({
        strokeStyle,
        fillStyle,
        lineDash: [...lineDash],
        transform: [...transform],
        lineWidth: this.lineWidth,
        globalAlpha: this.globalAlpha,
        font: this.font,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
      });
    },
    restore() {
      const prev = stateStack.pop();
      if (!prev) return;
      strokeStyle = prev.strokeStyle;
      fillStyle = prev.fillStyle;
      lineDash = prev.lineDash;
      transform = prev.transform;
      this.lineWidth = prev.lineWidth;
      this.globalAlpha = prev.globalAlpha;
      this.font = prev.font;
      this.textAlign = prev.textAlign;
      this.textBaseline = prev.textBaseline;
    },
    setTransform(a, b, c, d, e, f) {
      transform = [a, b, c, d, e, f];
      calls.push({ type: 'setTransform', matrix: [...transform] });
    },
    translate(tx, ty) {
      calls.push({ type: 'translate', tx, ty });
    },
    rotate(rad) {
      calls.push({ type: 'rotate', rad });
    },
    setLineDash(dash) {
      lineDash = [...dash];
      calls.push({ type: 'setLineDash', dash: [...dash] });
    },
    fillRect(x, y, w, h) {
      calls.push({ type: 'fillRect', x, y, w, h, fillStyle, transform: [...transform] });
    },
    strokeRect(x, y, w, h) {
      calls.push({ type: 'strokeRect', x, y, w, h, strokeStyle, transform: [...transform] });
    },
    beginPath() {
      calls.push({ type: 'beginPath' });
    },
    rect(x, y, w, h) {
      calls.push({ type: 'rect', x, y, w, h });
    },
    clip() {
      calls.push({ type: 'clip' });
    },
    moveTo(x, y) {
      calls.push({
        type: 'moveTo',
        x,
        y,
        strokeStyle,
        lineDash: [...lineDash],
        transform: [...transform],
      });
    },
    lineTo(x, y) {
      calls.push({
        type: 'lineTo',
        x,
        y,
        strokeStyle,
        lineDash: [...lineDash],
        transform: [...transform],
      });
    },
    stroke() {
      calls.push({ type: 'stroke', strokeStyle, lineDash: [...lineDash] });
    },
    measureText(txt) {
      return { width: String(txt).length * 5.8 };
    },
    fillText(txt, x, y) {
      calls.push({
        type: 'fillText',
        txt,
        x,
        y,
        fillStyle,
        font: this.font,
        transform: [...transform],
      });
    },
    calls,
  };
}

test('formatRulerCoord formats positive, zero, and negative architectural coordinates', () => {
  assert.equal(formatRulerCoord(0), "0'");
  assert.equal(formatRulerCoord(60), "5'");
  assert.equal(formatRulerCoord(-60), "-5'");
  assert.equal(formatRulerCoord(6), '6"');
  assert.equal(formatRulerCoord(-6), '-6"');
  assert.equal(formatRulerCoord(18), '1\' 6"');
  assert.equal(formatRulerCoord(-18), '-1\' 6"');
  assert.equal(formatRulerCoord(12), "1'");
});

test('computeRulerSteps scales intervals dynamically across zoom-out and high zoom-in levels', () => {
  // Default zoom (scale = 1.6): 6" sub, 12" minor, 60" (5') labeled major
  const normal = computeRulerSteps(1.6);
  assert.equal(normal.labelStep, 60);
  assert.equal(normal.minorStep, 12);
  assert.equal(normal.subStep, 6);

  // Zoomed out (scale = 0.5): 6" (3px < 6px) culled, 12" sub, 60" minor, 120" (10') labeled major
  const zoomedOut = computeRulerSteps(0.5);
  assert.equal(zoomedOut.labelStep, 120);
  assert.equal(zoomedOut.minorStep, 60);
  assert.equal(zoomedOut.subStep, 12);
  assert.ok(zoomedOut.subStep * 0.5 >= 6);
  assert.ok(zoomedOut.labelStep * 0.5 >= 48);

  // Extreme zoom-out (scale = 0.01): scales intervals up so labels and ticks never overcrowd
  const extremeOut = computeRulerSteps(0.01);
  assert.ok(extremeOut.labelStep * 0.01 >= 48);
  if (extremeOut.minorStep) assert.ok(extremeOut.minorStep * 0.01 >= 6);
  if (extremeOut.subStep) assert.ok(extremeOut.subStep * 0.01 >= 6);

  // High zoom-in (scale = 8): steps down to 6" labeled major with 3" and 1" graduations
  const highZoom = computeRulerSteps(8);
  assert.equal(highZoom.labelStep, 6);
  assert.equal(highZoom.minorStep, 3);
  assert.equal(highZoom.subStep, 1);
});

test('draw renders top and left rulers, corner unit box, and labels by default and respects showRulers: false', () => {
  const state = { rooms: [] };
  const view = { ox: 40, oy: 40, scale: 1.6 };

  const ctxWithRulers = createRulerMockCtx(800, 600);
  draw(ctxWithRulers, state, view);

  const fillRects = ctxWithRulers.calls.filter((c) => c.type === 'fillRect');
  // Top ruler bar, left ruler bar, and corner box
  assert.ok(
    fillRects.some(
      (r) => r.x === RULER_SIZE && r.y === 0 && r.w === 800 - RULER_SIZE && r.h === RULER_SIZE
    ),
    'Top perimeter ruler bar should be rendered'
  );
  assert.ok(
    fillRects.some(
      (r) => r.x === 0 && r.y === RULER_SIZE && r.w === RULER_SIZE && r.h === 600 - RULER_SIZE
    ),
    'Left perimeter ruler bar should be rendered'
  );
  assert.ok(
    fillRects.some((r) => r.x === 0 && r.y === 0 && r.w === RULER_SIZE && r.h === RULER_SIZE),
    'Top-left corner box should be rendered'
  );

  const textLabels = ctxWithRulers.calls.filter((c) => c.type === 'fillText').map((c) => c.txt);
  assert.ok(textLabels.includes('ft'), 'Corner box should render ft unit badge');
  assert.ok(textLabels.includes("0'"), "Origin 0' tick label should be rendered");
  assert.ok(textLabels.includes("5'"), "5' major tick label should be rendered");

  // Disable rulers via opts.showRulers = false
  const ctxNoRulers = createRulerMockCtx(800, 600);
  draw(ctxNoRulers, state, view, { showRulers: false });
  assert.equal(
    ctxNoRulers.calls.filter((c) => c.type === 'fillText').length,
    0,
    'No ruler labels should render when showRulers is false'
  );
});

test('drawRulers tick positions maintain exact screen-space alignment with drawGrid world steps under pan and zoom', () => {
  const view = { ox: 53.25, oy: -18.75, scale: 1.75 };
  const cw = 640;
  const ch = 480;

  const gridCtx = createRulerMockCtx(cw, ch);
  drawGrid(gridCtx, view, cw, ch);

  // Extract world X and Y coordinates rendered by drawGrid and project to screen space
  const x0 = -view.ox / view.scale;
  const y0 = -view.oy / view.scale;
  const gridScreenX = new Set(
    gridCtx.calls
      .filter((c) => c.type === 'moveTo' && Math.abs(c.y - y0) < 1e-9)
      .map((c) => (c.x * view.scale + view.ox).toFixed(6))
  );
  const gridScreenY = new Set(
    gridCtx.calls
      .filter((c) => c.type === 'moveTo' && Math.abs(c.x - x0) < 1e-9)
      .map((c) => (c.y * view.scale + view.oy).toFixed(6))
  );

  const rulerCtx = createRulerMockCtx(cw, ch);
  drawRulers(rulerCtx, view, cw, ch);

  // Top ruler ticks are vertical segments ending at y === RULER_SIZE with x in [RULER_SIZE, cw]
  const moves = rulerCtx.calls;
  let checkedTopTicks = 0;
  let checkedLeftTicks = 0;

  for (let i = 0; i < moves.length - 1; i++) {
    const a = moves[i];
    const b = moves[i + 1];
    if (a.type !== 'moveTo' || b.type !== 'lineTo') continue;

    // Top ruler tick segment (vertical line inside top ruler bar)
    if (Math.abs(a.x - b.x) < 1e-9 && a.y > 0 && Math.abs(b.y - RULER_SIZE) < 1e-9) {
      assert.ok(
        gridScreenX.has(a.x.toFixed(6)),
        `Top ruler tick at screen x=${a.x} must match a projected grid line`
      );
      checkedTopTicks++;
    }

    // Left ruler tick segment (horizontal line inside left ruler bar)
    if (Math.abs(a.y - b.y) < 1e-9 && a.x > 0 && Math.abs(b.x - RULER_SIZE) < 1e-9) {
      assert.ok(
        gridScreenY.has(a.y.toFixed(6)),
        `Left ruler tick at screen y=${a.y} must match a projected grid line`
      );
      checkedLeftTicks++;
    }
  }

  assert.ok(checkedTopTicks > 5, 'Should verify multiple top ruler ticks');
  assert.ok(checkedLeftTicks > 5, 'Should verify multiple left ruler ticks');
});

test('drawRulers restricts ticks, labels, and cursor guides within viewport bounds when panned off origin', () => {
  const cw = 500;
  const ch = 400;
  const view = { ox: 920.4, oy: -1450.8, scale: 1.5 };
  const ctx = createRulerMockCtx(cw, ch);

  // Hover panned off viewport on X (< RULER_SIZE) while valid on Y
  const hover = {
    x: (5 - view.ox) / view.scale, // screen hx = 5 (< RULER_SIZE)
    y: (200 - view.oy) / view.scale, // screen hy = 200 (in [RULER_SIZE, ch])
  };

  drawRulers(ctx, view, cw, ch, { hover });

  // Verify negative world labels appear when panned right of origin
  const texts = ctx.calls.filter((c) => c.type === 'fillText');
  assert.ok(
    texts.some((t) => t.txt.startsWith('-')),
    'Negative coordinate labels should render when panned into negative world space'
  );

  // Verify top ruler labels never overflow [RULER_SIZE, cw]
  for (const t of texts) {
    if (t.y === 2 && t.x > 2) {
      const tw = ctx.measureText(t.txt).width;
      assert.ok(t.x >= RULER_SIZE, `Top label x=${t.x} must not overlap corner box`);
      assert.ok(t.x + tw <= cw, `Top label "${t.txt}" at x=${t.x} must stay within canvas width`);
    }
  }

  // Verify dashed projection guide: X guide must be suppressed (hx = 5 < RULER_SIZE), Y guide drawn
  const dashedMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.lineDash.length > 0);
  const dashedLines = ctx.calls.filter((c) => c.type === 'lineTo' && c.lineDash.length > 0);
  assert.equal(dashedMoves.length, 1, 'Only in-bounds Y projection guide should be drawn');
  assert.equal(dashedMoves[0].x, RULER_SIZE);
  assert.ok(Math.abs(dashedMoves[0].y - 200) < 1e-6);
  assert.equal(dashedLines[0].x, cw);
  assert.ok(Math.abs(dashedLines[0].y - 200) < 1e-6);
});

test('drawRulers renders X and Y cursor projection lines across canvas tracking hover coordinates', () => {
  const cw = 800;
  const ch = 600;
  const view = { ox: 40, oy: 40, scale: 2 };
  const hover = { x: 150, y: 96 }; // 12' 6", 8' -> screen (340, 232)

  const ctx = createRulerMockCtx(cw, ch);
  drawRulers(ctx, view, cw, ch, { hover });

  const dashedMoves = ctx.calls.filter((c) => c.type === 'moveTo' && c.lineDash.length > 0);
  const dashedLines = ctx.calls.filter((c) => c.type === 'lineTo' && c.lineDash.length > 0);

  assert.equal(
    dashedMoves.length,
    2,
    'Both vertical and horizontal cursor projection guides should draw'
  );
  // Vertical guide at hx = 340 from y = RULER_SIZE to ch
  assert.deepEqual({ x: dashedMoves[0].x, y: dashedMoves[0].y }, { x: 340, y: RULER_SIZE });
  assert.deepEqual({ x: dashedLines[0].x, y: dashedLines[0].y }, { x: 340, y: ch });
  // Horizontal guide at hy = 232 from x = RULER_SIZE to cw
  assert.deepEqual({ x: dashedMoves[1].x, y: dashedMoves[1].y }, { x: RULER_SIZE, y: 232 });
  assert.deepEqual({ x: dashedLines[1].x, y: dashedLines[1].y }, { x: cw, y: 232 });

  // Live coordinate badges on rulers should show exact cursor world coordinates
  const renderedTexts = ctx.calls.filter((c) => c.type === 'fillText').map((c) => c.txt);
  assert.ok(renderedTexts.includes('12\' 6"'), 'Top ruler should show live X hover coordinate');
  assert.ok(renderedTexts.includes("8'"), 'Left ruler should show live Y hover coordinate');
});

test('app.js redraw passes hover coordinates in opts to draw()', () => {
  const appJsPath = path.join(__dirname, '../js/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const redrawMatch = appJs.match(/function redraw\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(redrawMatch, 'redraw function must exist in app.js');
  const drawCallMatch = redrawMatch[1].match(/draw\(\s*ctx[\s\S]*?\{([\s\S]*?)\}\s*\);/);
  assert.ok(drawCallMatch, 'draw(ctx, ..., opts) call must exist inside redraw()');
  assert.match(drawCallMatch[1], /\bhover\b/, 'redraw() must pass hover in opts to draw()');
});
