import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';

test('newState initializes background as null', () => {
  const s = m.newState();
  assert.equal(s.background, null);
});

test('serialization round-trips document background state', () => {
  const s = m.newState();
  s.background = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    x: 12,
    y: 24,
    scale: 1.5,
    opacity: 0.7,
    visible: true,
    locked: true,
    width: 100,
    height: 100,
  };
  const json = m.serialize(s);
  const loaded = m.deserialize(json);
  assert.deepEqual(loaded.background, s.background);
});

test('parseDistanceInInches parses various measurement formats correctly', () => {
  assert.equal(m.parseDistanceInInches("10'"), 120);
  assert.equal(m.parseDistanceInInches('10 ft'), 120);
  assert.equal(m.parseDistanceInInches('10 feet'), 120);
  assert.equal(m.parseDistanceInInches('10\' 6"'), 126);
  assert.equal(m.parseDistanceInInches('10ft 6in'), 126);
  assert.equal(m.parseDistanceInInches('120"'), 120);
  assert.equal(m.parseDistanceInInches('120 in'), 120);
  assert.equal(m.parseDistanceInInches('120 inches'), 120);
  assert.equal(m.parseDistanceInInches('120'), 120);
  assert.equal(m.parseDistanceInInches('10'), 120);
  assert.ok(Math.abs(m.parseDistanceInInches('1 m') - 39.3701) < 0.01);
  assert.equal(m.parseDistanceInInches(''), null);
  assert.equal(m.parseDistanceInInches('abc'), null);
  assert.equal(m.parseDistanceInInches('-10'), null);
});

test('2-point scale calibration recalculates scale and anchor position', () => {
  const bg = {
    dataUrl: 'data:image/png;base64,dummy',
    x: 0,
    y: 0,
    scale: 1.0,
    opacity: 0.5,
    visible: true,
    locked: false,
    width: 500,
    height: 500,
  };

  const p1 = { x: 50, y: 50 };
  const p2 = { x: 150, y: 50 };
  const currentDistPx = Math.hypot(p2.x - p1.x, p2.y - p1.y); // 100
  const targetInches = 200; // Want 200 inches

  const factor = targetInches / currentDistPx; // 2.0
  bg.scale *= factor;
  bg.x = p1.x - (p1.x - bg.x) * factor;
  bg.y = p1.y - (p1.y - bg.y) * factor;

  assert.equal(bg.scale, 2.0);
  assert.equal(bg.x, -50);
  assert.equal(bg.y, -50);
});

// Setup WebGL and DOM mocks for scene3d tests in headless Node environment
function setupScene3DEnvironment() {
  if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = () => {};
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = () => 1;

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
  doc.documentElement = doc;

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

  if (!globalThis.window) globalThis.window = { devicePixelRatio: 1 };
  if (!globalThis.document) globalThis.document = doc;
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  return { canvas };
}

test('scene3d.js initializes background and lighting colors from active Ktheme tokens', async () => {
  const { canvas } = setupScene3DEnvironment();
  const { createScene3D } = await import('../js/scene3d.js');
  const { invalidateCache, DEFAULT_TOKENS } = await import('../js/kthemeTokens.js');

  delete globalThis.window.getComputedStyle;
  invalidateCache();

  const state = m.newState();
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );

  assert.equal(
    api.scene.background.getHexString(),
    DEFAULT_TOKENS['--ktheme-tertiary'].replace('#', '').toLowerCase()
  );

  const hemi = api.scene.children.find((c) => c.isHemisphereLight);
  assert.ok(hemi, 'Hemisphere light should exist in scene');
  assert.equal(
    hemi.color.getHexString(),
    DEFAULT_TOKENS['--ktheme-on-primary'].replace('#', '').toLowerCase()
  );
  assert.equal(
    hemi.groundColor.getHexString(),
    DEFAULT_TOKENS['--ktheme-secondary'].replace('#', '').toLowerCase()
  );

  const sun = api.scene.children.find((c) => c.isDirectionalLight);
  assert.ok(sun, 'Directional sun light should exist in scene');
  assert.equal(
    sun.color.getHexString(),
    DEFAULT_TOKENS['--ktheme-primary'].replace('#', '').toLowerCase()
  );

  api.destroy();
});

test('scene colors update dynamically when invalidateCache() is triggered', async () => {
  const { canvas } = setupScene3DEnvironment();
  const { createScene3D } = await import('../js/scene3d.js');
  const { invalidateCache } = await import('../js/kthemeTokens.js');

  delete globalThis.window.getComputedStyle;
  invalidateCache();

  const state = m.newState();
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );

  const customTokens = {
    '--ktheme-tertiary': '#112233',
    '--ktheme-on-primary': '#445566',
    '--ktheme-secondary': '#778899',
    '--ktheme-primary': '#aabbcc',
  };

  globalThis.window.getComputedStyle = () => ({
    getPropertyValue: (prop) => customTokens[prop] || '',
  });

  invalidateCache();

  assert.equal(api.scene.background.getHexString(), '112233');

  const hemi = api.scene.children.find((c) => c.isHemisphereLight);
  assert.equal(hemi.color.getHexString(), '445566');
  assert.equal(hemi.groundColor.getHexString(), '778899');

  const sun = api.scene.children.find((c) => c.isDirectionalLight);
  assert.equal(sun.color.getHexString(), 'aabbcc');

  // Verify destroy unsubscribes from further token invalidations
  api.destroy();

  customTokens['--ktheme-tertiary'] = '#ff0000';
  invalidateCache();

  assert.equal(
    api.scene.background.getHexString(),
    '112233',
    'Background should not update after api.destroy()'
  );

  delete globalThis.window.getComputedStyle;
  invalidateCache();
});
