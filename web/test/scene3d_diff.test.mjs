import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import { createScene3D } from '../js/scene3d.js';

// Setup headless WebGL and DOM mocks for Node test environment
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: (_p) => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
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

test('renderer maintains a map linking entity UUIDs to Three.js Mesh/Group objects', () => {
  const state = m.newState();
  const room = m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  assert.ok(api.entityMap instanceof Map);
  assert.ok(api.entityMap.has(room.id), 'Room entity present in entityMap');
  assert.ok(api.entityMap.has(`${room.id}:slab`), 'Floor slab entity present in entityMap');
  assert.ok(api.entityMap.has(`${room.id}:wall:N`), 'Wall N entity present in entityMap');

  for (const item of room.items) {
    assert.ok(api.entityMap.has(item.id), `Item ${item.id} present in entityMap`);
  }
});

test('state updates mutate existing mesh transforms in place without replacing nodes', () => {
  const state = m.newState();
  const room = m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const item = room.items[0];
  const origMesh = api.entityMap.get(item.id);
  const origX = origMesh.position.x;

  // Move item in plan state
  item.x += 24;
  api.update();

  const updatedMesh = api.entityMap.get(item.id);
  assert.strictEqual(
    origMesh,
    updatedMesh,
    'Mesh object reference must be identical in memory (mutated in-place)'
  );
  assert.notStrictEqual(
    origX,
    updatedMesh.position.x,
    'Mesh transform position must reflect state change'
  );
});

test('added entities spawn new meshes without clearing existing scene nodes', () => {
  const state = m.newState();
  const room = m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const roomMesh = api.entityMap.get(room.id);
  const existingItemMesh = api.entityMap.get(room.items[0].id);

  // Add a new item
  const newItem = m.addItem(state, room, 'plant', { x: 40, y: 40 });
  api.update();

  assert.strictEqual(api.entityMap.get(room.id), roomMesh, 'Room mesh preserved');
  assert.strictEqual(
    api.entityMap.get(room.items[0].id),
    existingItemMesh,
    'Pre-existing item mesh preserved'
  );
  assert.ok(api.entityMap.has(newItem.id), 'New item spawned in entityMap');
});

test('removed entities dismount from the scene graph and entityMap', () => {
  const state = m.newState();
  const room = m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const newItem = m.addItem(state, room, 'plant', { x: 40, y: 40 });
  api.update();

  assert.ok(api.entityMap.has(newItem.id));

  // Remove the newly added item
  m.removeById(state, newItem.id);
  api.update();

  assert.strictEqual(
    api.entityMap.has(newItem.id),
    false,
    'Removed item dismounted from entityMap'
  );
});
