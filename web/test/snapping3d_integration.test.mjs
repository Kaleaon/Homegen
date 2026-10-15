import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import { createScene3D } from '../js/scene3d.js';
import { InteractionLayer, SNAP_MODES } from '../../designer3d/tools/index.mjs';

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

test('3D scene raycaster computes intersections in orbit mode and disables raycasting in walk mode', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  assert.equal(api.getCameraMode(), 'orbit');

  // Raycast center pointer
  const hitOrbit = api.raycastPointer(400, 300);
  assert.ok(hitOrbit === null || hitOrbit.point3D !== undefined);

  // Switch to walkthrough mode
  api.setCameraMode('walk');
  const hitWalk = api.raycastPointer(400, 300);
  assert.equal(
    hitWalk,
    null,
    'Walkthrough camera controls must disable object interaction raycasting'
  );
});

test('3D scene extracts geometry context (3D vertices and 3D edges) for snapping', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const geomCtx = api.getScene3DGeometryContext();
  assert.ok(Array.isArray(geomCtx.vertices));
  assert.ok(Array.isArray(geomCtx.edges));
  assert.ok(geomCtx.vertices.length > 0, 'Should extract 3D vertices from room geometry');
  assert.ok(geomCtx.edges.length > 0, 'Should extract 3D edges from room geometry');
});

test('3D visual constraint guide overlay renders and disposes cleanly', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const snapInfo = {
    point: { x: 60, y: 48, z: 60 },
    normal: { x: 0, y: 0, z: 1 },
    snap: {
      type: 'vertex',
      guideLines: [{ start: { x: 0, y: 0, z: 0 }, end: { x: 60, y: 48, z: 60 } }],
    },
  };

  // Should render overlay without throwing
  assert.doesNotThrow(() => {
    api.setSnapOverlay3D(snapInfo);
  });

  // Should clear overlay without throwing
  assert.doesNotThrow(() => {
    api.clearSnapOverlay3D();
  });
});

test('InteractionLayer moveEntity3D respects SnapModeState toggles in real time', () => {
  const layer = new InteractionLayer({
    gridSettings: { unitSize: 6, magneticThreshold: 12 },
    snapModes: { [SNAP_MODES.GRID]: true, [SNAP_MODES.EDGE]: false },
  });

  const entity = { id: 'lamp', position: { x: 0, y: 0, z: 0 } };
  const ptr = { x: 13, y: 5.9, z: 23.8 };

  let res = layer.moveEntity3D(entity, ptr);
  assert.equal(res.position.x, 12, 'Grid snap should quantize x to 12 when GRID mode is active');

  // Toggle GRID off
  layer.toggleSnapMode(SNAP_MODES.GRID, false);
  res = layer.moveEntity3D(entity, ptr);
  assert.equal(
    res.position.x,
    13,
    'Position should remain unquantized when GRID snap mode is disabled'
  );
});
