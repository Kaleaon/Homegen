import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENINGS, OPENING_BY_ID } from '../js/catalog.js';
import * as m from '../js/model.js';
import { WT, wallSeg } from '../js/geometry.js';
import { createScene3D } from '../js/scene3d.js';
import {
  WINDOW_PRESETS,
  DOOR_PRESETS,
  getWindowPreset,
  getDoorPresets,
  getDoorPreset,
  getCladdingMaterial,
  registerWindowPreset,
  registerDoorPreset,
  registerCladdingMaterial,
  resolveWindowStyle,
  resolveDoorStyle,
  applyBuildingPreset,
  applyCladdingMaterial,
  clearPresetCaches,
  getPresetRevision,
} from '../js/presetRegistry.js';
import { draw, drawWindow2D } from '../js/render.js';
import { getToken, invalidateCache } from '../js/kthemeTokens.js';

// Setup headless WebGL and DOM Mocks
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: () => 'WebGL 2.0',
  getExtension: () => null,
  getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
  checkFramebufferStatus: () => 36053,
  createFramebuffer: () => ({ id: Math.random() }),
  createRenderbuffer: () => ({ id: Math.random() }),
  createTexture: () => ({ id: Math.random() }),
  createBuffer: () => ({ id: Math.random() }),
  createProgram: () => ({ id: Math.random() }),
  createShader: () => ({ id: Math.random() }),
  createVertexArray: () => ({ id: Math.random() }),
  TRIANGLES: 4,
};

const mockCtx = new Proxy(baseCtx, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => {};
  },
});

const mock2d = {
  fillRect: () => {},
  strokeRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  translate: () => {},
  rotate: () => {},
  transform: () => {},
};

const doc = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ width: 256, height: 256, getContext: () => mock2d }),
};

const canvas = {
  width: 800,
  height: 600,
  ownerDocument: doc,
  getRootNode: () => doc,
  getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  addEventListener: () => {},
  removeEventListener: () => {},
  style: {},
  getContext: (type) => (type === '2d' ? mock2d : mockCtx),
};

globalThis.window = { devicePixelRatio: 1 };
globalThis.document = doc;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

test('Material and Preset Registry maintains window style presets and cladding maps', () => {
  assert.ok(WINDOW_PRESETS.modern_black, 'modern_black preset exists');
  assert.strictEqual(WINDOW_PRESETS.modern_black.frameColor, '#1a1a1a');

  assert.ok(WINDOW_PRESETS.colonial_white, 'colonial_white preset exists');
  assert.deepEqual(WINDOW_PRESETS.colonial_white.mullions, { cols: 3, rows: 2 });

  assert.ok(WINDOW_PRESETS.craftsman_wood, 'craftsman_wood preset exists');
  assert.strictEqual(WINDOW_PRESETS.craftsman_wood.frameMaterial, 'wood');

  const stoneCladding = getCladdingMaterial('cladding_stone');
  assert.strictEqual(stoneCladding.id, 'cladding_stone');
  assert.strictEqual(stoneCladding.pattern, 'stone');
});

test('Safe fallbacks respond when invalid window or cladding preset keys are provided', () => {
  const invalidWindow = getWindowPreset('non_existent_preset_xyz');
  assert.strictEqual(invalidWindow.key, 'standard_default');
  assert.strictEqual(invalidWindow.frameColor, '#ffffff');

  const invalidCladding = getCladdingMaterial('invalid_cladding_key');
  assert.ok(invalidCladding.id.includes('cladding_siding'), 'Fallback cladding returned');

  const resolvedInvalid = resolveWindowStyle({ presetKey: 'invalid_key' });
  assert.strictEqual(resolvedInvalid.frameMaterial, 'vinyl');
  assert.strictEqual(resolvedInvalid.frameColor, '#ffffff');
});

test('Dynamic registration allows adding new presets without modifying core loops', () => {
  const newWindowPreset = registerWindowPreset('custom_matte_navy', {
    name: 'Custom Navy Matte',
    frameMaterial: 'aluminum',
    frameColor: '#1e293b',
    mullions: { cols: 4, rows: 2 },
    casing: { width: 3.0, depth: 1.0 },
  });
  assert.strictEqual(newWindowPreset.key, 'custom_matte_navy');

  const fetched = getWindowPreset('custom_matte_navy');
  assert.strictEqual(fetched.frameColor, '#1e293b');
  assert.deepEqual(fetched.mullions, { cols: 4, rows: 2 });

  const newCladding = registerCladdingMaterial('cladding_cedar_shingle', {
    name: 'Cedar Shingles',
    pattern: 'siding',
    c1: '#8c6239',
    c2: '#6d4827',
  });
  assert.strictEqual(newCladding.id, 'cladding_cedar_shingle');

  const fetchedCladding = getCladdingMaterial('cladding_cedar_shingle');
  assert.strictEqual(fetchedCladding.c1, '#8c6239');
});

test('Window catalog items in catalog.js reference style preset keys', () => {
  const windowDefs = OPENINGS.filter((o) => o.kind === 'window');
  assert.ok(windowDefs.length > 0, 'Catalog window definitions exist');

  for (const winDef of windowDefs) {
    assert.ok(winDef.presetKey, `Window ${winDef.id} specifies a presetKey`);
    const preset = getWindowPreset(winDef.presetKey);
    assert.ok(preset, `Preset ${winDef.presetKey} resolves in registry`);
  }
});

test('Model addOpening propagates presetKey and allows instance overrides', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'living', 0, 0, 144, 144);

  const o1 = m.addOpening(state, room, 'win_hung_36x60', 'N', 36);
  assert.strictEqual(o1.presetKey, 'colonial_white');

  const resolved1 = resolveWindowStyle(o1);
  assert.strictEqual(resolved1.frameColor, '#ffffff');
  assert.deepEqual(resolved1.mullions, { cols: 2, rows: 3 });

  // Custom instance override
  const o2 = m.addOpening(state, room, 'win_hung_36x60', 'S', 36, {
    presetKey: 'modern_black',
    frameColor: '#111111',
  });
  assert.strictEqual(o2.presetKey, 'modern_black');
  const resolved2 = resolveWindowStyle(o2);
  assert.strictEqual(resolved2.frameColor, '#111111');
});

test('Building presets apply exterior cladding and window presets across rooms', () => {
  const state = m.newState();
  const room1 = m.createRoom(state, 'living', 0, 0, 144, 144);
  const room2 = m.createRoom(state, 'bedroom', 144, 0, 144, 144);
  m.addOpening(state, room1, 'win_hung_36x60', 'N', 36);
  m.addOpening(state, room2, 'win_hung_30x48', 'E', 36);

  applyBuildingPreset(state, 'modern_farmhouse', { scope: 'plan' });

  assert.strictEqual(room1.cladding, 'cladding_board_batten');
  assert.strictEqual(room2.cladding, 'cladding_board_batten');
  assert.strictEqual(room1.openings[0].presetKey, 'modern_black');
  assert.strictEqual(room2.openings[0].presetKey, 'modern_black');
});

test('3D Scene uses windowBuilder module and retrieves cladding from registry', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144, {
    cladding: 'cladding_board_batten',
  });
  const o = m.addOpening(state, room, 'win_casement_30x48', 'N', 36, {
    presetKey: 'modern_black',
  });

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallGroup = api.entityMap.get(`${room.id}:wall:N`);
  assert.ok(wallGroup, 'Wall entity created');

  const openingNode = api.entityMap.get(o.id);
  assert.ok(openingNode, 'Opening mesh created via windowBuilder');
  assert.ok(openingNode.children.length >= 8, 'Window group has frame, pane, and trim elements');
});

function createAffineRecordingCtx(width = 800, height = 600) {
  let matrix = [1, 0, 0, 1, 0, 0];
  let fillStyle = '#000000';
  let strokeStyle = '#000000';
  let lineWidth = 1;
  let globalAlpha = 1;
  let lineDash = [];
  const stack = [];
  const ops = [];

  const applyPoint = (mMat, px, py) => ({
    x: mMat[0] * px + mMat[2] * py + mMat[4],
    y: mMat[1] * px + mMat[3] * py + mMat[5],
  });

  const recordRect = (kind, x, y, w, h) => {
    const snap = [...matrix];
    ops.push({
      kind,
      x,
      y,
      w,
      h,
      fillStyle,
      strokeStyle,
      lineWidth,
      matrix: snap,
      center: applyPoint(snap, x + w / 2, y + h / 2),
      corners: [
        applyPoint(snap, x, y),
        applyPoint(snap, x + w, y),
        applyPoint(snap, x + w, y + h),
        applyPoint(snap, x, y + h),
      ],
    });
  };

  const ctx = {
    canvas: { width, height },
    ops,
    get stackDepth() {
      return stack.length;
    },
    get currentMatrix() {
      return [...matrix];
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(val) {
      fillStyle = val;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(val) {
      strokeStyle = val;
    },
    get lineWidth() {
      return lineWidth;
    },
    set lineWidth(val) {
      lineWidth = val;
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(val) {
      globalAlpha = val;
    },
    save() {
      stack.push({
        matrix: [...matrix],
        fillStyle,
        strokeStyle,
        lineWidth,
        globalAlpha,
        lineDash: [...lineDash],
      });
    },
    restore() {
      assert.ok(stack.length > 0, 'ctx.restore called with matching ctx.save');
      const prev = stack.pop();
      matrix = prev.matrix;
      fillStyle = prev.fillStyle;
      strokeStyle = prev.strokeStyle;
      lineWidth = prev.lineWidth;
      globalAlpha = prev.globalAlpha;
      lineDash = prev.lineDash;
    },
    setTransform(a, b, c, d, e, f) {
      matrix = [a, b, c, d, e, f];
    },
    transform(a, b, c, d, e, f) {
      const [m0, m1, m2, m3, m4, m5] = matrix;
      matrix = [
        m0 * a + m2 * b,
        m1 * a + m3 * b,
        m0 * c + m2 * d,
        m1 * c + m3 * d,
        m0 * e + m2 * f + m4,
        m1 * e + m3 * f + m5,
      ];
    },
    translate(tx, ty) {
      this.transform(1, 0, 0, 1, tx, ty);
    },
    rotate(ang) {
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      this.transform(cos, sin, -sin, cos, 0, 0);
    },
    scale(sx, sy) {
      this.transform(sx, 0, 0, sy, 0, 0);
    },
    fillRect(x, y, w, h) {
      recordRect('fillRect', x, y, w, h);
    },
    strokeRect(x, y, w, h) {
      recordRect('strokeRect', x, y, w, h);
    },
    clearRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    ellipse() {},
    clip() {},
    setLineDash(d) {
      lineDash = Array.isArray(d) ? [...d] : [];
    },
    getLineDash() {
      return [...lineDash];
    },
    createPattern() {
      return {};
    },
    measureText(t) {
      return { width: String(t).length * 6 };
    },
    fillText() {},
    strokeText() {},
  };

  return ctx;
}

function assertMatricesClose(actual, expected, eps = 1e-6) {
  assert.strictEqual(actual.length, 6);
  for (let i = 0; i < 6; i++) {
    assert.ok(
      Number.isFinite(actual[i]) && Math.abs(actual[i] - expected[i]) <= eps,
      `Matrix component [${i}] mismatch: actual=${actual[i]}, expected=${expected[i]}`
    );
  }
}

test('2D plan renderer reads preset keys to draw matching frame colors and mullion grids', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 100, 200, 144, 144);
  const o = m.addOpening(state, room, 'win_hung_36x60', 'N', 36, {
    presetKey: 'craftsman_wood',
  });
  const def = OPENING_BY_ID[o.type];

  const testCtx = createAffineRecordingCtx();
  assert.doesNotThrow(() => {
    drawWindow2D(testCtx, room, o, def, false);
  }, '2D plan rendering helper executes cleanly with window style preset');

  assert.strictEqual(testCtx.stackDepth, 0, 'drawWindow2D balances save/restore');
  const frameOp = testCtx.ops.find((op) => op.kind === 'strokeRect' && op.w === o.width);
  assert.ok(frameOp, 'Window frame strokeRect recorded');
  assert.strictEqual(
    frameOp.strokeStyle,
    '#4a3728',
    '2D plan renderer applied craftsman wood frame color'
  );
  assertMatricesClose(frameOp.matrix, [1, 0, 0, 1, 100 + 36 + o.width / 2, 200]);

  // Verify drawWindow2D enforces ctx.rotate unconditionally
  const incompleteCtx = { ...mock2d, rotate: undefined };
  assert.throws(
    () => drawWindow2D(incompleteCtx, room, o, def, false),
    TypeError,
    'drawWindow2D requires ctx.rotate and does not silently skip wall rotation'
  );
});

test('draw restores plan coordinates before drawWindow2D across N, E, S, W, and angled polygon walls', () => {
  const state = m.newState();
  const rectRoom = m.createRoom(state, 'living', 100, 200, 168, 144);
  const rectOpenings = [
    m.addOpening(state, rectRoom, 'win_hung_36x60', 'N', 24, { presetKey: 'modern_black' }),
    m.addOpening(state, rectRoom, 'win_casement_30x48', 'E', 30, { presetKey: 'colonial_white' }),
    m.addOpening(state, rectRoom, 'win_hung_36x60', 'S', 42, { presetKey: 'craftsman_wood' }),
    m.addOpening(state, rectRoom, 'win_casement_30x48', 'W', 36, {
      presetKey: 'industrial_bronze',
    }),
  ];
  // Include a door alongside windows to verify balanced save/restore and door styling
  m.addOpening(state, rectRoom, 'door_entry_36', 'S', 96);

  // Angled polygon room with diagonal walls
  const polyPoints = [
    { x: 340, y: 180 },
    { x: 480, y: 210 },
    { x: 520, y: 330 },
    { x: 400, y: 390 },
    { x: 310, y: 300 },
  ];
  const polyRoom = m.createRoom(state, 'bedroom', 310, 180, 210, 210, {
    points: polyPoints,
  });
  const polyOpenings = [
    m.addOpening(state, polyRoom, 'win_hung_36x60', '0', 24, { presetKey: 'modern_black' }),
    m.addOpening(state, polyRoom, 'win_casement_30x48', '1', 20, { presetKey: 'craftsman_wood' }),
    m.addOpening(state, polyRoom, 'win_hung_30x48', '2', 18, { presetKey: 'colonial_white' }),
  ];

  const views = [
    { view: { scale: 1, ox: 0, oy: 0 }, dpr: 1 },
    { view: { scale: 2.25, ox: -48, oy: 72 }, dpr: 2 },
  ];

  const th = WT + 0.6;

  for (const { view, dpr } of views) {
    const drawCtx = createAffineRecordingCtx(1200, 900);
    draw(drawCtx, state, view, { dpr, showRulers: false });
    assert.strictEqual(drawCtx.stackDepth, 0, 'draw leaves balanced save/restore stack');

    const cutouts = drawCtx.ops.filter(
      (op) =>
        op.kind === 'fillRect' &&
        op.fillStyle === '#f7f5f0' &&
        Math.abs(op.h - th) < 1e-6 &&
        op.x === 0
    );
    const frames = drawCtx.ops.filter(
      (op) =>
        op.kind === 'strokeRect' && Math.abs(op.h - th) < 1e-6 && Math.abs(op.x + op.w / 2) < 1e-6
    );

    const allWindows = [
      ...rectOpenings.map((o) => ({ room: rectRoom, o })),
      ...polyOpenings.map((o) => ({ room: polyRoom, o })),
    ];
    assert.strictEqual(frames.length, allWindows.length, 'Recorded one window frame per window');

    for (let idx = 0; idx < allWindows.length; idx++) {
      const { room, o } = allWindows[idx];
      const def = OPENING_BY_ID[o.type];
      const s = wallSeg(room, o.wall);
      const scale = view.scale * dpr;
      const expectedCenter = {
        x: (s.ax + s.dx * (o.offset + o.width / 2)) * scale + view.ox * dpr,
        y: (s.ay + s.dy * (o.offset + o.width / 2)) * scale + view.oy * dpr,
      };

      const frameOp = frames[idx];
      assert.ok(
        Math.hypot(frameOp.center.x - expectedCenter.x, frameOp.center.y - expectedCenter.y) < 1e-6,
        `Window frame ${o.id} on wall ${o.wall} aligns with expected midpoint`
      );

      const matchingCutout = cutouts.find(
        (c) =>
          Math.abs(c.w - o.width) < 1e-6 &&
          Math.hypot(c.center.x - expectedCenter.x, c.center.y - expectedCenter.y) < 1e-6
      );
      assert.ok(
        matchingCutout,
        `Wall cutout and styled window frame align for ${o.id} on wall ${o.wall}`
      );

      // Compare against standalone drawWindow2D in the same plan view space
      const standaloneCtx = createAffineRecordingCtx(1200, 900);
      standaloneCtx.setTransform(scale, 0, 0, scale, view.ox * dpr, view.oy * dpr);
      drawWindow2D(standaloneCtx, room, o, def, false);
      const standaloneFrame = standaloneCtx.ops.find((op) => op.kind === 'strokeRect');
      assertMatricesClose(frameOp.matrix, standaloneFrame.matrix);
    }
  }
});

test('drawWindow2D and draw handle bad openings, fallback presets, and zero-length walls', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 80, 120, 144, 144);
  const badWin = m.addOpening(state, room, 'win_hung_36x60', 'E', 30, {
    presetKey: 'non_existent_fallback_preset',
  });

  const ctx = createAffineRecordingCtx();
  draw(
    ctx,
    state,
    { scale: 1.5, ox: 20, oy: 30 },
    { bad: new Set([badWin.id]), showRulers: false }
  );
  assert.strictEqual(ctx.stackDepth, 0);

  const th = WT + 0.6;
  const badFrame = ctx.ops.find(
    (op) =>
      op.kind === 'strokeRect' && Math.abs(op.h - th) < 1e-6 && Math.abs(op.w - badWin.width) < 1e-6
  );
  assert.ok(badFrame, 'Bad window frame drawn');
  assert.strictEqual(
    badFrame.strokeStyle,
    getToken('--ktheme-critical', '#d33'),
    'Violating window draws critical token frame color'
  );

  // Also verify #d33 when --ktheme-critical resolves to #d33
  const prevDocEl = globalThis.document.documentElement;
  const prevGetComputed = globalThis.window.getComputedStyle;
  try {
    globalThis.document.documentElement = {};
    globalThis.window.getComputedStyle = () => ({
      getPropertyValue: (prop) => (prop === '--ktheme-critical' ? '#d33' : ''),
    });
    invalidateCache();
    const d33Ctx = createAffineRecordingCtx();
    drawWindow2D(d33Ctx, room, badWin, OPENING_BY_ID[badWin.type], true);
    const d33Frame = d33Ctx.ops.find((op) => op.kind === 'strokeRect');
    assert.strictEqual(d33Frame.strokeStyle, '#d33', 'Violating window draws #d33 frame');
  } finally {
    globalThis.document.documentElement = prevDocEl;
    globalThis.window.getComputedStyle = prevGetComputed;
    invalidateCache();
  }

  // Fallback preset when not bad uses standard_default (#ffffff)
  const okCtx = createAffineRecordingCtx();
  drawWindow2D(okCtx, room, badWin, OPENING_BY_ID[badWin.type], false);
  const okFrame = okCtx.ops.find((op) => op.kind === 'strokeRect');
  assert.strictEqual(okFrame.strokeStyle, '#ffffff', 'Fallback preset resolves #ffffff frame');

  // Zero-length wall segment (len === 0) produces finite aligned transforms without NaN
  const zeroWallRoom = {
    id: 'r_zero',
    type: 'bedroom',
    x: 50,
    y: 75,
    w: 0,
    h: 120,
    walls: {},
    openings: [{ id: 'w_zero', type: 'win_hung_36x60', wall: 'N', offset: 0, width: 36 }],
    items: [],
  };
  const zeroCtx = createAffineRecordingCtx();
  draw(zeroCtx, { rooms: [zeroWallRoom] }, { scale: 1, ox: 0, oy: 0 }, { showRulers: false });
  const zeroFrame = zeroCtx.ops.find(
    (op) => op.kind === 'strokeRect' && Math.abs(op.h - th) < 1e-6 && op.w === 36
  );
  const zeroCutout = zeroCtx.ops.find(
    (op) => op.kind === 'fillRect' && op.fillStyle === '#f7f5f0' && op.w === 36
  );
  assert.ok(zeroFrame && zeroCutout, 'Zero-length wall renders cutout and window frame');
  assert.ok(zeroFrame.matrix.every(Number.isFinite), 'Zero-length wall transform is finite');
  assert.ok(
    Math.hypot(zeroFrame.center.x - zeroCutout.center.x, zeroFrame.center.y - zeroCutout.center.y) <
      1e-6,
    'Zero-length wall cutout and frame stay aligned'
  );
});

test('Clear preset caches executes cleanly without errors', () => {
  assert.doesNotThrow(() => {
    clearPresetCaches();
  }, 'Cache cleanup succeeds');
});

test('Global preset revision counter increments on preset registration or cache clearing', () => {
  const revBefore = getPresetRevision();

  registerWindowPreset('test_rev_window', {
    name: 'Test Revision Window',
    frameColor: '#123456',
  });
  const rev1 = getPresetRevision();
  assert.ok(rev1 > revBefore, 'Revision counter incremented on window preset registration');

  registerCladdingMaterial('test_rev_cladding', {
    name: 'Test Revision Cladding',
    c1: '#654321',
  });
  const rev2 = getPresetRevision();
  assert.ok(rev2 > rev1, 'Revision counter incremented on cladding preset registration');

  clearPresetCaches();
  const rev3 = getPresetRevision();
  assert.ok(rev3 > rev2, 'Revision counter incremented on clearing preset caches');
});

test('Wall signature calculation in 3D scene invalidates cached wall group on preset revision increment', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'living', 0, 0, 144, 144);
  m.addOpening(state, room, 'win_hung_36x60', 'N', 36);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallKey = `${room.id}:wall:N`;
  const initialWallGroup = api.entityMap.get(wallKey);
  assert.ok(initialWallGroup, 'Initial wall group created');

  // Registering a new window preset increments preset revision
  registerWindowPreset('dynamic_preset_update', {
    name: 'Dynamic Update Preset',
    frameColor: '#ff00ff',
  });

  // Re-run update on 3D scene
  api.update();

  const updatedWallGroup = api.entityMap.get(wallKey);
  assert.ok(updatedWallGroup, 'Wall group reconstructed after revision increment');
  assert.notStrictEqual(
    updatedWallGroup,
    initialWallGroup,
    'Cached wall group invalidated and rebuilt due to preset revision increment'
  );
});

test('Wall signature invalidates cached wall group when window opening style properties change', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144);
  const o = m.addOpening(state, room, 'win_hung_36x60', 'N', 36);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallKey = `${room.id}:wall:N`;
  const wallGroup1 = api.entityMap.get(wallKey);

  // Update window opening properties directly (e.g. frameColor)
  o.frameColor = '#00ff00';
  api.update();

  const wallGroup2 = api.entityMap.get(wallKey);
  assert.notStrictEqual(
    wallGroup2,
    wallGroup1,
    'Wall signature updated and invalidated cached mesh when window frame color changed'
  );
});

test('applyCladdingMaterial applies exterior cladding across room, level, and plan scopes', () => {
  const state = m.newState();
  const room1 = m.createRoom(state, 'living', 0, 0, 144, 144, { level: 0 });
  const room2 = m.createRoom(state, 'bedroom', 144, 0, 144, 144, { level: 0 });

  // Room scope
  applyCladdingMaterial(state, 'cladding_stone', { room: room1, scope: 'room' });
  assert.strictEqual(room1.cladding, 'cladding_stone');
  assert.strictEqual(room2.cladding, undefined);

  // Plan scope
  applyCladdingMaterial(state, 'wall_brick', { scope: 'plan' });
  assert.strictEqual(room1.cladding, 'wall_brick');
  assert.strictEqual(room2.cladding, 'wall_brick');
});

test('Material and Preset Registry exports DOOR_PRESETS and resolveDoorStyle', () => {
  const allDoorPresets = getDoorPresets();
  assert.ok(allDoorPresets.modern_flush, 'getDoorPresets returns modern_flush');

  assert.ok(DOOR_PRESETS.modern_flush, 'modern_flush preset exists');
  assert.strictEqual(DOOR_PRESETS.modern_flush.panelStyle, 'flush');

  assert.ok(DOOR_PRESETS.colonial_6panel, 'colonial_6panel preset exists');
  assert.strictEqual(DOOR_PRESETS.colonial_6panel.panelStyle, 'panel_6');

  assert.ok(DOOR_PRESETS.craftsman_2panel, 'craftsman_2panel preset exists');
  assert.strictEqual(DOOR_PRESETS.craftsman_2panel.panelStyle, 'panel_2');

  assert.ok(DOOR_PRESETS.french_glass, 'french_glass preset exists');
  assert.strictEqual(DOOR_PRESETS.french_glass.panelStyle, 'french');

  const resolved = resolveDoorStyle({ presetKey: 'craftsman_2panel' });
  assert.strictEqual(resolved.panelStyle, 'panel_2');
  assert.strictEqual(resolved.hardwareFinish, 'oil_rubbed_bronze');
});

test('Door preset resolution falls back cleanly for missing or invalid keys', () => {
  const invalidDoor = getDoorPreset('invalid_preset_xyz');
  assert.strictEqual(invalidDoor.key, 'standard_default');

  const resolvedNull = resolveDoorStyle(null);
  assert.strictEqual(resolvedNull.presetKey, 'standard_default');
  assert.strictEqual(resolvedNull.panelStyle, 'flush');
});

test('Dynamic registration allows adding custom door presets', () => {
  const customDoor = registerDoorPreset('custom_mahogany_arch', {
    name: 'Mahogany Arch',
    panelStyle: 'panel_2',
    finishColor: '#3d2314',
    hardwareFinish: 'brass',
  });

  assert.strictEqual(customDoor.key, 'custom_mahogany_arch');
  const fetched = getDoorPreset('custom_mahogany_arch');
  assert.strictEqual(fetched.finishColor, '#3d2314');

  const resolved = resolveDoorStyle({ presetKey: 'custom_mahogany_arch' });
  assert.strictEqual(resolved.finishColor, '#3d2314');
  assert.strictEqual(resolved.hardwareFinish, 'brass');
});

test('applyBuildingPreset propagates door preset keys to doors across plan', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'living', 0, 0, 144, 144);
  const d1 = m.addOpening(state, room, 'door_interior_30', 'N', 36);

  applyBuildingPreset(state, 'craftsman', { scope: 'plan' });
  assert.strictEqual(d1.presetKey, 'craftsman_2panel');

  const style = resolveDoorStyle(d1);
  assert.strictEqual(style.panelStyle, 'panel_2');
  assert.strictEqual(style.hardwareFinish, 'oil_rubbed_bronze');
});
