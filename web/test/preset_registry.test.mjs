import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENINGS } from '../js/catalog.js';
import * as m from '../js/model.js';
import { createScene3D } from '../js/scene3d.js';
import {
  WINDOW_PRESETS,
  getWindowPreset,
  getCladdingMaterial,
  registerWindowPreset,
  registerCladdingMaterial,
  resolveWindowStyle,
  applyBuildingPreset,
  applyCladdingMaterial,
  clearPresetCaches,
  getPresetRevision,
} from '../js/presetRegistry.js';
import { drawWindow2D } from '../js/render.js';

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

test('2D plan renderer reads preset keys to draw matching frame colors and mullion grids', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144);
  const o = m.addOpening(state, room, 'win_hung_36x60', 'N', 36, {
    presetKey: 'craftsman_wood',
  });

  let strokeStyleSet = null;
  const testCtx = {
    ...mock2d,
    set strokeStyle(val) {
      strokeStyleSet = val;
    },
    get strokeStyle() {
      return strokeStyleSet;
    },
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
  };

  assert.doesNotThrow(() => {
    drawWindow2D(testCtx, room, o, OPENINGS[7], false);
  }, '2D plan rendering helper executes cleanly with window style preset');

  assert.strictEqual(
    strokeStyleSet,
    '#4a3728',
    '2D plan renderer applied craftsman wood frame color'
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
  const _o = m.addOpening(state, room, 'win_hung_36x60', 'N', 36);

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
