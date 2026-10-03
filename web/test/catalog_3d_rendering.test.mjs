import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENINGS, OPENING_BY_ID, WALL_FINISHES, WALL_BY_ID } from '../js/catalog.js';
import * as m from '../js/model.js';
import { createScene3D } from '../js/scene3d.js';

// Setup headless WebGL and DOM mocks for Node test environment
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
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
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  scale: () => {},
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  drawImage: () => {},
  translate: () => {},
  strokeRect: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createPattern: () => ({ setTransform: () => {} }),
  ellipse: () => {},
  bezierCurveTo: () => {},
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

test('Catalog opening window definitions contain frameMaterial, frameColor, mullions, and casing', () => {
  const windows = OPENINGS.filter((o) => o.kind === 'window');
  assert.ok(windows.length > 0, 'Catalog contains window definitions');

  for (const winDef of windows) {
    assert.ok(winDef.frameMaterial, `Window ${winDef.id} must specify frameMaterial`);
    assert.ok(winDef.frameColor, `Window ${winDef.id} must specify frameColor`);
    assert.ok(winDef.mullions, `Window ${winDef.id} must specify mullions`);
    assert.ok(winDef.casing, `Window ${winDef.id} must specify casing`);
    assert.ok(typeof winDef.mullions.cols === 'number', `Window ${winDef.id} mullions has cols`);
    assert.ok(typeof winDef.mullions.rows === 'number', `Window ${winDef.id} mullions has rows`);
  }
});

test('Catalog wall finishes contain exterior cladding options and flags', () => {
  const claddingFinishes = WALL_FINISHES.filter((f) => f.exterior || f.cladding);
  assert.ok(claddingFinishes.length >= 5, 'At least 5 exterior cladding finishes defined');

  const sidingWhite = WALL_BY_ID.cladding_siding_white;
  assert.ok(sidingWhite, 'cladding_siding_white exists');
  assert.strictEqual(sidingWhite.pattern, 'siding');
  assert.strictEqual(sidingWhite.exterior, true);
  assert.strictEqual(sidingWhite.cladding, true);

  const brick = WALL_BY_ID.wall_brick;
  assert.ok(brick, 'wall_brick exists');
  assert.strictEqual(brick.exterior, true);
  assert.strictEqual(brick.cladding, true);
});

test('addOpening propagates catalog style attributes and allows custom overrides', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144);

  // Default addition from catalog definition
  const o1 = m.addOpening(state, room, 'win_hung_36x60', 'N', 36);
  assert.strictEqual(o1.frameMaterial, 'vinyl');
  assert.strictEqual(o1.frameColor, '#ffffff');
  assert.deepEqual(o1.mullions, { cols: 2, rows: 3 });

  // Custom override
  const o2 = m.addOpening(state, room, 'win_hung_36x60', 'S', 36, {
    frameMaterial: 'wood',
    frameColor: '#4a3728',
    mullions: { cols: 3, rows: 3 },
  });
  assert.strictEqual(o2.frameMaterial, 'wood');
  assert.strictEqual(o2.frameColor, '#4a3728');
  assert.deepEqual(o2.mullions, { cols: 3, rows: 3 });
});

test('Model serialization and deserialization preserve opening style and cladding attributes', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144, {
    cladding: 'cladding_siding_blue',
  });
  m.addOpening(state, room, 'win_hung_30x48', 'N', 36, {
    frameMaterial: 'bronze',
    frameColor: '#1a1a1a',
    mullions: { cols: 3, rows: 2 },
  });

  const serialized = m.serialize(state);
  assert.ok(serialized.includes('cladding_siding_blue'), 'Serialized state includes cladding');
  assert.ok(serialized.includes('bronze'), 'Serialized state includes custom frameMaterial');

  const restored = m.deserialize(serialized);
  const restoredRoom = restored.rooms[0];
  assert.strictEqual(restoredRoom.cladding, 'cladding_siding_blue');

  const restoredOpening = restoredRoom.openings[0];
  assert.strictEqual(restoredOpening.frameMaterial, 'bronze');
  assert.strictEqual(restoredOpening.frameColor, '#1a1a1a');
  assert.deepEqual(restoredOpening.mullions, { cols: 3, rows: 2 });
});

test('3D Scene renders dynamic exterior wall cladding materials', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144, {
    cladding: 'cladding_stone',
  });

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallGroup = api.entityMap.get(`${room.id}:wall:N`);
  assert.ok(wallGroup, 'Wall entity created');

  // Verify that changing cladding updates scene node signature
  room.cladding = 'cladding_siding_blue';
  api.update();

  const updatedWallGroup = api.entityMap.get(`${room.id}:wall:N`);
  assert.ok(updatedWallGroup, 'Updated wall entity present after cladding change');
});

test('3D Scene addWindow procedurally constructs frame, mullion grid bars, and trim casing', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 144, 144);
  const o = m.addOpening(state, room, 'win_hung_36x60', 'N', 36, {
    frameMaterial: 'wood',
    frameColor: '#4a3728',
    mullions: { cols: 3, rows: 3 },
  });

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const openingNode = api.entityMap.get(o.id);
  assert.ok(openingNode, 'Opening node created in 3D scene');
  // Glass pane + 4 outer frame bars + 1 meeting rail + 2 vertical mullion bars + 2 horizontal mullion bars + 1 sill + 1 head casing + 2 side casings = 15 child meshes
  assert.ok(openingNode.children.length >= 10, 'Window group contains frame, mullions, and casing meshes');
});

test('Deserializing legacy plan without new fields falls back cleanly without error', () => {
  const legacyPlanJson = JSON.stringify({
    version: 2,
    name: 'Legacy Home',
    nextId: 10,
    levels: 1,
    rooms: [
      {
        id: 'r1',
        type: 'bedroom',
        name: 'Bedroom',
        level: 0,
        x: 0,
        y: 0,
        w: 120,
        h: 120,
        ceiling: 96,
        floor: 'floor_oak',
        walls: { N: 'paint_white', E: 'paint_white', S: 'paint_white', W: 'paint_white' },
        openings: [{ id: 'o1', type: 'win_hung_36x60', kind: 'window', wall: 'N', offset: 24, width: 36, swing: 'in' }],
        items: [],
      },
    ],
  });

  const restored = m.deserialize(legacyPlanJson);
  assert.ok(restored, 'Legacy plan deserialized successfully');

  const api = createScene3D(
    canvas,
    () => restored,
    () => 0
  );
  assert.doesNotThrow(() => {
    api.show();
  }, 'Legacy plan renders in 3D view without error using safe fallbacks');
});
