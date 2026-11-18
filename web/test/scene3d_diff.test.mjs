import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import * as m from '../js/model.js';
import { registerCustomWallFinish } from '../js/presetRegistry.js';
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

test('proceduralTexture configures standard texture parameters and reuses cached CanvasTexture instances', () => {
  const state = m.newState();
  const room = m.placeRoomKit(state, 'kit_bedroom', 0, 0); // 144x144, wp_stripe_blue
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallN = api.entityMap.get(`${room.id}:wall:N`);
  const wallS = api.entityMap.get(`${room.id}:wall:S`);
  const texN = wallN.children[0].material.map;
  const texS = wallS.children[0].material.map;

  assert.ok(texN instanceof THREE.CanvasTexture);
  assert.strictEqual(texN.wrapS, THREE.RepeatWrapping);
  assert.strictEqual(texN.wrapT, THREE.RepeatWrapping);
  assert.strictEqual(texN.colorSpace, THREE.SRGBColorSpace);
  assert.strictEqual(texN.anisotropy, 8);
  assert.strictEqual(texN.repeat.x, 144 / 24);
  assert.strictEqual(texN.repeat.y, 96 / 24);
  assert.strictEqual(texN, texS, 'Matching wall dimensions and finish reuse cached texture');
  api.destroy();
});

test('customTexture caches dataUrl textures, preserves async render callback, and falls back to proceduralTexture without dataUrl', () => {
  const origLoad = THREE.TextureLoader.prototype.load;
  const loadCalls = [];
  let renderCalls = 0;

  THREE.TextureLoader.prototype.load = function mockLoad(url, onLoad) {
    const tex = new THREE.Texture();
    loadCalls.push({ url, onLoad, tex });
    return tex;
  };

  try {
    const state = m.newState();
    const room = m.createRoom(state, 'living', 0, 0, 144, 144);
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    registerCustomWallFinish(
      {
        id: 'scene3d_custom_with_url',
        name: 'Custom With URL',
        dataUrl,
        tileInches: 48,
      },
      state
    );
    m.applyWallFinish(state, 'scene3d_custom_with_url', { scope: 'room', room });

    const api = createScene3D(
      canvas,
      () => state,
      () => {
        renderCalls += 1;
        return 0;
      }
    );
    api.show();

    assert.strictEqual(
      loadCalls.length,
      1,
      'TextureLoader.load invoked once and cached across all four 144x96 walls'
    );
    assert.strictEqual(loadCalls[0].url, dataUrl);

    const texN = api.entityMap.get(`${room.id}:wall:N`).children[0].material.map;
    const texE = api.entityMap.get(`${room.id}:wall:E`).children[0].material.map;
    assert.strictEqual(texN, loadCalls[0].tex);
    assert.strictEqual(texN, texE);
    assert.strictEqual(texN.wrapS, THREE.RepeatWrapping);
    assert.strictEqual(texN.wrapT, THREE.RepeatWrapping);
    assert.strictEqual(texN.colorSpace, THREE.SRGBColorSpace);
    assert.strictEqual(texN.anisotropy, 8);
    assert.strictEqual(texN.repeat.x, 144 / 48);
    assert.strictEqual(texN.repeat.y, 96 / 48);

    const rendersBeforeLoad = renderCalls;
    loadCalls[0].onLoad(texN);
    assert.strictEqual(
      renderCalls,
      rendersBeforeLoad + 1,
      'Async onLoad callback triggers render()'
    );

    // Fallback path when dataUrl is absent
    loadCalls.length = 0;
    registerCustomWallFinish(
      {
        id: 'scene3d_custom_without_url',
        name: 'Custom Without URL',
        tileInches: 24,
      },
      state
    );
    m.applyWallFinish(state, 'scene3d_custom_without_url', { scope: 'room', room });
    api.update();

    assert.strictEqual(
      loadCalls.length,
      0,
      'Missing dataUrl delegates to proceduralTexture without calling TextureLoader.load'
    );
    const fallbackN = api.entityMap.get(`${room.id}:wall:N`).children[0].material.map;
    const fallbackS = api.entityMap.get(`${room.id}:wall:S`).children[0].material.map;
    assert.ok(fallbackN instanceof THREE.CanvasTexture);
    assert.strictEqual(fallbackN, fallbackS);
    assert.strictEqual(fallbackN.wrapS, THREE.RepeatWrapping);
    assert.strictEqual(fallbackN.wrapT, THREE.RepeatWrapping);
    assert.strictEqual(fallbackN.colorSpace, THREE.SRGBColorSpace);
    assert.strictEqual(fallbackN.anisotropy, 8);
    assert.strictEqual(fallbackN.repeat.x, 144 / 24);
    assert.strictEqual(fallbackN.repeat.y, 96 / 24);

    api.destroy();
  } finally {
    THREE.TextureLoader.prototype.load = origLoad;
  }
});
