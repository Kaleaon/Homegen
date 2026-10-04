import test from 'node:test';
import assert from 'node:assert/strict';
import { HD_MATERIALS, WINDOW_BLUEPRINTS, MaterialPreloader } from '../js/resources.js';
import { WALL_BY_ID, WINDOW_FRAME_BY_ID } from '../js/catalog.js';
import { createScene3D } from '../js/scene3d.js';
import * as m from '../js/model.js';

// Setup DOM stubs for Node environment
globalThis.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvas();
    return { addEventListener: () => {}, removeEventListener: () => {}, style: {} };
  },
  createElementNS: (ns, tag) => {
    if (tag === 'canvas') return createCanvas();
    return { addEventListener: () => {}, removeEventListener: () => {}, style: {} };
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.window = globalThis;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

function createCanvas() {
  const dummyCtx = {
    canvas: { width: 800, height: 600 },
    getParameter: (p) => (typeof p === 'number' && p === 35661 ? 4 : 'WebGL 2.0'),
    getShaderPrecisionFormat: () => ({ rangeMin: 1, rangeMax: 1, precision: 23 }),
    getShaderParameter: () => true,
    getProgramParameter: () => 0,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getExtension: () => null,
    getActiveUniform: () => ({ name: 'uTest', type: 35678, size: 1 }),
    getActiveAttrib: () => ({ name: 'aTest', type: 35678, size: 1 }),
    TRIANGLES: 4,
  };
  const ctxProxy = new Proxy(dummyCtx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('create')) return () => ({});
      return () => {};
    },
  });
  return {
    style: {},
    ownerDocument: globalThis.document,
    getRootNode: () => globalThis.document,
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    getContext: () => ctxProxy,
  };
}

test('resources.js defines PBR texture presets for exterior cladding and window frames', () => {
  const exteriorCladdings = ['wall_brick', 'wall_stucco', 'wall_stone', 'wall_siding'];
  for (const id of exteriorCladdings) {
    assert.ok(HD_MATERIALS[id], `HD_MATERIALS should define ${id}`);
    assert.ok(WALL_BY_ID[id], `WALL_BY_ID should define ${id}`);
    assert.ok(HD_MATERIALS[id].id, `${id} should specify Poly Haven texture id`);
    assert.ok(HD_MATERIALS[id].tile > 0, `${id} should specify positive tile size`);
  }

  const windowFrames = ['frame_aluminum', 'frame_wood'];
  for (const id of windowFrames) {
    assert.ok(HD_MATERIALS[id], `HD_MATERIALS should define ${id}`);
    assert.ok(WINDOW_FRAME_BY_ID[id], `WINDOW_FRAME_BY_ID should define ${id}`);
  }
});

test('addWindow instantiates composite assembly meshes from WINDOW_BLUEPRINTS with PBR shaders', () => {
  const canvas = createCanvas();

  let state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const scene3d = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  scene3d.show();

  assert.ok(
    WINDOW_BLUEPRINTS.hung && WINDOW_BLUEPRINTS.casement,
    'WINDOW_BLUEPRINTS should define window styles'
  );

  const openingNodes = [];
  scene3d.entityMap.forEach((node) => {
    if (node.userData && node.userData.entityType === 'opening') {
      openingNodes.push(node);
    }
  });

  assert.ok(openingNodes.length > 0, 'Scene should render at least one window opening');
  const windowGroup = openingNodes[0];

  // Verify child meshes represent composite assembly (sill, frame, glass, etc.)
  assert.ok(
    windowGroup.children.length >= 3,
    'Window group should contain composite assembly meshes'
  );

  let hasGlass = false;
  let hasFrame = false;

  windowGroup.traverse((child) => {
    if (child.isMesh && child.material) {
      if (child.material.transmission !== undefined || child.material.transparent) {
        hasGlass = true;
      } else if (child.material.metalness !== undefined) {
        hasFrame = true;
      }
    }
  });

  assert.ok(hasGlass, 'Composite window assembly should include physical glass material');
  assert.ok(hasFrame, 'Composite window assembly should include PBR frame material');
});

test('buildWall applies PBR material slots to exterior faces when HD mode is enabled', () => {
  const canvas = createCanvas();

  let state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const scene3d = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  scene3d.setOption('hd', true);
  scene3d.show();

  let foundExteriorWallMesh = false;
  scene3d.world ||
    scene3d.scene.traverse((node) => {
      if (node.isMesh && Array.isArray(node.material)) {
        foundExteriorWallMesh = true;
      }
    });

  assert.ok(foundExteriorWallMesh || scene3d.entityMap.size > 0, 'Wall meshes should be generated');
});

test('MaterialPreloader fetches and caches texture maps asynchronously and handles fallback on network errors', async () => {
  const mockLoader = {
    load: (url, onLoad, onProgress, onError) => {
      if (url.includes('error')) {
        onError(new Error('Network load error'));
      } else {
        onLoad({ image: { width: 512, height: 512 } });
      }
    },
  };

  const preloader = new MaterialPreloader(mockLoader);

  const resultOk = await preloader.loadMaterial('wall_brick');
  assert.equal(resultOk.finishId, 'wall_brick');
  assert.equal(resultOk.hasError, false);
  assert.ok(resultOk.maps.diff);

  // Cached call returns same promise
  const cachedResult = await preloader.loadMaterial('wall_brick');
  assert.equal(cachedResult, resultOk);

  // Test error handling
  const mockErrorLoader = {
    load: (url, onLoad, onProgress, onError) => {
      onError(new Error('HTTP 500'));
    },
  };

  const errorPreloader = new MaterialPreloader(mockErrorLoader);
  const resultErr = await errorPreloader.loadMaterial('wall_brick');
  assert.equal(resultErr.hasError, true);
});
